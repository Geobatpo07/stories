import type { EntityKind } from "@/kernel";
import { listAuthoringDefinitions } from "@/kernel";
import type { PersistencePort } from "@/runtime";
import { authoringDocumentSchema, type AuthoringDocument } from "./types";

export class KnowledgeObjectRepository {
  constructor(private readonly persistence: PersistencePort) {}

  async save(document: AuthoringDocument): Promise<void> {
    const validated = authoringDocumentSchema.parse(document);
    await this.persistence.save(validated.kind, validated.id, validated);
  }

  async get(kind: EntityKind, id: string): Promise<AuthoringDocument | undefined> {
    const value = await this.persistence.load<unknown>(kind, id);
    return value === undefined ? undefined : authoringDocumentSchema.parse(value);
  }

  async find(id: string): Promise<AuthoringDocument | undefined> {
    for (const definition of listAuthoringDefinitions()) {
      const document = await this.get(definition.kind, id);
      if (document) return document;
    }
    return undefined;
  }

  async list(kind?: EntityKind): Promise<readonly AuthoringDocument[]> {
    const kinds = kind ? [kind] : listAuthoringDefinitions().map((item) => item.kind);
    const collections = await Promise.all(
      kinds.map(async (item) => {
        const values = await this.persistence.list<unknown>(item);
        return values.map((value) => authoringDocumentSchema.parse(value));
      }),
    );
    return collections
      .flat()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async delete(document: AuthoringDocument): Promise<void> {
    await this.persistence.delete(document.kind, document.id);
  }
}
