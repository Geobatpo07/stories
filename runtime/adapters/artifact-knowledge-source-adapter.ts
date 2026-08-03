import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type {
  EntityKind,
  KnowledgeEntity,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  Relationship,
  ResolvedRef,
} from "@/kernel";
import type { ContentStatus } from "@/schemas";
import type { KnowledgeSourceMetadata, KnowledgeSourcePort } from "../ports/types";

interface ArtifactManifest extends KnowledgeSourceMetadata {
  readonly artifacts: Readonly<
    Record<string, { readonly file: string; readonly checksum: string }>
  >;
}

interface EntityRow {
  readonly id: string;
  readonly kind: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly content: string;
  readonly file_path: string;
  readonly metadata: string | Record<string, unknown>;
}

interface RelationshipRow {
  readonly source_id: string;
  readonly target_id: string;
  readonly field: string;
  readonly cardinality: string;
}

export interface ArtifactKnowledgeSourceOptions {
  readonly manifestPath?: string;
  readonly rootDirectory?: string;
}

/**
 * Runtime adapter for Sprint 4's immutable build output. Creation performs
 * all filesystem and DuckDB work; the Runtime subsequently consumes the
 * loaded snapshot through its existing synchronous KnowledgeSourcePort.
 */
export class ArtifactKnowledgeSourceAdapter implements KnowledgeSourcePort {
  private constructor(
    private readonly entities: readonly KnowledgeEntity[],
    private readonly graph: KnowledgeGraph,
    private readonly metadata: KnowledgeSourceMetadata,
  ) {}

  static async create(
    options: ArtifactKnowledgeSourceOptions = {},
  ): Promise<ArtifactKnowledgeSourceAdapter> {
    const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
    const manifestPath = resolve(
      options.manifestPath ?? resolve(rootDirectory, "database/generated/manifest.json"),
    );
    const manifest = parseManifest(await readFile(manifestPath, "utf8"));
    const databaseArtifact = manifest.artifacts.knowledgeDatabase;
    if (!databaseArtifact) {
      throw new Error("manifest.json does not declare a knowledgeDatabase artifact.");
    }

    const databasePath = isAbsolute(databaseArtifact.file)
      ? databaseArtifact.file
      : resolve(rootDirectory, databaseArtifact.file);
    const databaseBytes = await readFile(databasePath);
    const checksum = createHash("sha256").update(databaseBytes).digest("hex");
    if (checksum !== databaseArtifact.checksum) {
      throw new Error("The generated knowledge database checksum does not match manifest.json.");
    }

    const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY" });
    const connection = await instance.connect();
    try {
      const entityReader = await connection.runAndReadAll(
        "SELECT id, kind, slug, title, summary, status, created_at, updated_at, content, file_path, metadata FROM knowledge_entity ORDER BY created_at DESC, id ASC",
      );
      const relationshipReader = await connection.runAndReadAll(
        "SELECT source_id, target_id, field, cardinality FROM knowledge_relationship ORDER BY source_id, target_id, field",
      );
      const entityRows = entityReader.getRowObjectsJson() as unknown as EntityRow[];
      const relationshipRows =
        relationshipReader.getRowObjectsJson() as unknown as RelationshipRow[];
      const entities = hydrateEntities(entityRows, relationshipRows);

      if (
        entities.length !== manifest.knowledge.entities ||
        relationshipRows.length !== manifest.knowledge.relationships
      ) {
        throw new Error("Generated knowledge counts do not match manifest.json.");
      }

      return new ArtifactKnowledgeSourceAdapter(entities, createGraph(entities), manifest);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }

  loadAll(): readonly KnowledgeEntity[] {
    return this.entities;
  }

  getGraph(): KnowledgeGraph {
    return this.graph;
  }

  getMetadata(): KnowledgeSourceMetadata {
    return this.metadata;
  }
}

function parseManifest(raw: string): ArtifactManifest {
  const value = JSON.parse(raw) as Partial<ArtifactManifest>;
  if (
    typeof value.platformVersion !== "string" ||
    typeof value.kernelVersion !== "string" ||
    typeof value.buildVersion !== "string" ||
    typeof value.schemaVersion !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.contentHash !== "string" ||
    typeof value.generationDuration !== "number" ||
    typeof value.knowledge?.entities !== "number" ||
    typeof value.knowledge.relationships !== "number" ||
    !value.artifacts
  ) {
    throw new Error("manifest.json does not satisfy the Runtime artifact contract.");
  }
  return value as ArtifactManifest;
}

function hydrateEntities(
  rows: readonly EntityRow[],
  edges: readonly RelationshipRow[],
): readonly KnowledgeEntity[] {
  const base = new Map<string, KnowledgeEntity>();
  for (const row of rows) {
    const metadata =
      typeof row.metadata === "string"
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;
    base.set(row.id, {
      id: row.id,
      kind: row.kind as EntityKind,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      status: row.status as ContentStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      content: row.content,
      filePath: row.file_path,
      metadata: Object.freeze({ ...metadata }),
      relationships: [],
      ...metadata,
    } as KnowledgeEntity);
  }

  return rows.map((row) => {
    const entity = base.get(row.id);
    if (!entity) throw new Error(`Missing entity ${row.id}.`);
    const relationships: Relationship[] = edges
      .filter((edge) => edge.source_id === row.id)
      .map((edge) => {
        const target = base.get(edge.target_id);
        if (!target) throw new Error(`Relationship target ${edge.target_id} is missing.`);
        const ref: ResolvedRef = {
          id: target.id,
          kind: target.kind,
          slug: target.slug,
          title: target.title,
        };
        return { field: edge.field, cardinality: edge.cardinality as "one" | "many", target: ref };
      });
    return Object.freeze({ ...entity, relationships: Object.freeze(relationships) });
  });
}

function createGraph(entities: readonly KnowledgeEntity[]): KnowledgeGraph {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const outgoing = new Map<string, KnowledgeGraphEdge[]>();
  const incoming = new Map<string, KnowledgeGraphEdge[]>();
  for (const entity of entities) {
    for (const relationship of entity.relationships) {
      const edge = { from: entity.id, to: relationship.target.id, field: relationship.field };
      outgoing.set(entity.id, [...(outgoing.get(entity.id) ?? []), edge]);
      incoming.set(relationship.target.id, [...(incoming.get(relationship.target.id) ?? []), edge]);
    }
  }
  const nodes = new Map<string, KnowledgeGraphNode>();
  for (const entity of entities) {
    nodes.set(entity.id, {
      entity,
      outgoing: outgoing.get(entity.id) ?? [],
      incoming: incoming.get(entity.id) ?? [],
    });
  }
  const resolveEdges = (edges: readonly KnowledgeGraphEdge[], key: "from" | "to") => {
    const seen = new Set<string>();
    return edges.flatMap((edge) => {
      const id = edge[key];
      const entity = byId.get(id);
      if (!entity || seen.has(id)) return [];
      seen.add(id);
      return [entity];
    });
  };
  const getParents = (id: string) => resolveEdges(nodes.get(id)?.outgoing ?? [], "to");
  const getChildren = (id: string) => resolveEdges(nodes.get(id)?.incoming ?? [], "from");
  return {
    nodes,
    getNode: (id) => nodes.get(id),
    getParents,
    getChildren,
    getRelated: (id) => {
      const seen = new Set<string>();
      return [...getParents(id), ...getChildren(id)].filter(
        (entity) => !seen.has(entity.id) && Boolean(seen.add(entity.id)),
      );
    },
  };
}
