import {
  ArtifactKnowledgeSourceAdapter,
  ConsoleLogger,
  EnvironmentConfiguration,
  NullPersistenceAdapter,
  createPlatformRuntime,
  type ApplicationContext,
} from "@/runtime";

let contextPromise: Promise<ApplicationContext> | undefined;

/** The Presentation Layer's single gateway to platform knowledge. */
export function getRuntimeContext(): Promise<ApplicationContext> {
  contextPromise ??= startRuntime();
  return contextPromise;
}

/** Refresh generated knowledge after a local Studio publication. */
export function resetRuntimeContext(): void {
  contextPromise = undefined;
}

async function startRuntime(): Promise<ApplicationContext> {
  const knowledgeSource = await ArtifactKnowledgeSourceAdapter.create();
  const runtime = createPlatformRuntime({
    knowledgeSource,
    persistence: new NullPersistenceAdapter(),
    logger: new ConsoleLogger(),
    configuration: new EnvironmentConfiguration(process.env),
  });
  return runtime.start();
}
