import {
  EnvironmentConfiguration,
  SupabasePersistenceAdapter,
  IdentifierService,
  SystemClock,
} from "@/runtime";
import { KnowledgeObjectRepository } from "./repository";
import { MDXRenderer } from "./renderers";
import { AuthoringWorkflow } from "./workflow";

const configuration = new EnvironmentConfiguration(process.env);
configuration.load();

/**
 * Deliberately not local-filesystem-backed: Vercel's serverless functions
 * have a read-only deployment filesystem outside `/tmp`, so Studio drafts
 * need a real database — see supabase/migrations/0001_persistence_records.sql.
 * `namespace: "knowledge"` keeps drafts in their own rows, distinct from
 * auth/server.ts's `"auth"` namespace in the same table. Published work is
 * unaffected: AuthoringWorkflow.publish() still writes MDX straight to
 * content/, Git-tracked, never through this port — only pre-publication
 * draft state moves to Supabase.
 */
const persistence = new SupabasePersistenceAdapter(
  configuration.get("SUPABASE_URL") ?? "",
  configuration.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  "knowledge",
);
export const knowledgeObjectRepository = new KnowledgeObjectRepository(persistence);
export const authoringWorkflow = new AuthoringWorkflow(
  knowledgeObjectRepository,
  new MDXRenderer(),
  new SystemClock(),
  new IdentifierService(),
);

export function isStudioEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || configuration.get("STORIES_STUDIO_ENABLED") === "true"
  );
}
