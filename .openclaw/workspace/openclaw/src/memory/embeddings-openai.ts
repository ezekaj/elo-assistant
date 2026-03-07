import type { EmbeddingProvider, EmbeddingProviderOptions } from "./embeddings.js";
import { requireApiKey, resolveApiKeyForProvider } from "../agents/model-auth.js";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// text-embedding-3-small is available on OpenRouter and is the cheapest embedding model
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type OpenAiEmbeddingClient = {
  baseUrl: string;
  headers: Record<string, string>;
  model: string;
};

export const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function normalizeOpenAiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return DEFAULT_OPENAI_EMBEDDING_MODEL;
  }
  if (trimmed.startsWith("openai/")) {
    return trimmed.slice("openai/".length);
  }
  return trimmed;
}

export async function createOpenAiEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<{ provider: EmbeddingProvider; client: OpenAiEmbeddingClient }> {
  const client = await resolveOpenAiEmbeddingClient(options);
  const url = `${client.baseUrl.replace(/\/$/, "")}/embeddings`;

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) {
      return [];
    }
    const res = await fetch(url, {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({ model: client.model, input }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openai embeddings failed: ${res.status} ${text}`);
    }
    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const data = payload.data ?? [];
    return data.map((entry) => entry.embedding ?? []);
  };

  return {
    provider: {
      id: "openai",
      model: client.model,
      embedQuery: async (text) => {
        const [vec] = await embed([text]);
        return vec ?? [];
      },
      embedBatch: embed,
    },
    client,
  };
}

export async function resolveOpenAiEmbeddingClient(
  options: EmbeddingProviderOptions,
): Promise<OpenAiEmbeddingClient> {
  const remote = options.remote;
  const remoteApiKey = remote?.apiKey?.trim();
  const remoteBaseUrl = remote?.baseUrl?.trim();

  const apiKey = remoteApiKey
    ? remoteApiKey
    : requireApiKey(
        await resolveApiKeyForProvider({
          provider: "openai",
          cfg: options.config,
          agentDir: options.agentDir,
        }),
        "openai",
      );

  const providerConfig = options.config.models?.providers?.openai;
  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL;
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  const model = normalizeOpenAiModel(options.model);
  return { baseUrl, headers, model };
}

export async function createOpenRouterEmbeddingProvider(
  options: EmbeddingProviderOptions,
): Promise<{ provider: EmbeddingProvider; client: OpenAiEmbeddingClient }> {
  const remote = options.remote;
  const remoteApiKey = remote?.apiKey?.trim();
  const remoteBaseUrl = remote?.baseUrl?.trim();

  const apiKey = remoteApiKey
    ? remoteApiKey
    : requireApiKey(
        await resolveApiKeyForProvider({
          provider: "openrouter",
          cfg: options.config,
          agentDir: options.agentDir,
        }),
        "openrouter",
      );

  // OpenRouter uses openai-compatible API; prefer provider-level baseUrl override
  const providerConfig = (
    options.config.models?.providers as Record<
      string,
      { baseUrl?: string; headers?: Record<string, string> } | undefined
    >
  )?.openrouter;
  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || DEFAULT_OPENROUTER_BASE_URL;
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const model = options.model?.trim() || DEFAULT_OPENROUTER_EMBEDDING_MODEL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };

  const client: OpenAiEmbeddingClient = { baseUrl, headers, model };
  const url = `${client.baseUrl.replace(/\/$/, "")}/embeddings`;

  const embed = async (input: string[]): Promise<number[][]> => {
    if (input.length === 0) {
      return [];
    }
    const res = await fetch(url, {
      method: "POST",
      headers: client.headers,
      body: JSON.stringify({ model: client.model, input }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openrouter embeddings failed: ${res.status} ${text}`);
    }
    const payload = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const data = payload.data ?? [];
    return data.map((entry) => entry.embedding ?? []);
  };

  return {
    provider: {
      id: "openrouter",
      model: client.model,
      embedQuery: async (text) => {
        const [vec] = await embed([text]);
        return vec ?? [];
      },
      embedBatch: embed,
    },
    client,
  };
}
