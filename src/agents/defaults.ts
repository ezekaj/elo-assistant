// Defaults for agent metadata when upstream does not supply them.
// Model id uses zhipu GLM-5 as the default provider.
export const DEFAULT_PROVIDER = "zhipu";
export const DEFAULT_MODEL = "glm-5";
// Context window: GLM-5 supports ~256k tokens.
export const DEFAULT_CONTEXT_TOKENS = 256_000;
