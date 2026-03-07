    const { processToolResult } = await import('./tools/tool-result-persist.js');
    const { processToolResult } from './tools/tool-result-persist.js';
    const { toolUseId: toolCallId, toolName: tool.name }    maxSizeChars: 100_000
    previewSizeChars: 10_000
  });

  if (persistResult.persisted) {
        finalResult = persistResult.content;
        log.info(`Persisted large tool result: ${persistResult.telemetry?.estimatedOriginalTokens} → ${persistResult.telemetry?.estimatedPersistedTokens} tokens`);
      }
    } catch (persistError) {
      log.warn(`Tool result persistence failed, using original: ${persistError}`);
    }
  }

  return {
    finalResult,
    persisted,
    telemetry,
  };
}

 null;
  });
}
