import {
  EnvironmentConfiguration,
  FileSystemPersistenceAdapter,
  IdentifierService,
  SystemClock,
} from "@/runtime";
import { KnowledgeObjectRepository } from "./repository";
import { MDXRenderer } from "./renderers";
import { AuthoringWorkflow } from "./workflow";

const persistence = new FileSystemPersistenceAdapter("knowledge");
export const knowledgeObjectRepository = new KnowledgeObjectRepository(persistence);
export const authoringWorkflow = new AuthoringWorkflow(
  knowledgeObjectRepository,
  new MDXRenderer(),
  new SystemClock(),
  new IdentifierService(),
);

export function isStudioEnabled(): boolean {
  const configuration = new EnvironmentConfiguration(process.env);
  configuration.load();
  return (
    process.env.NODE_ENV !== "production" || configuration.get("STORIES_STUDIO_ENABLED") === "true"
  );
}
