/**
 * Native Modules Integration for OpenClaw TUI
 *
 * This file integrates the native modules into the OpenClaw TUI system.
 * It initializes native modules at startup and makes them available to all agents.
 */

let nativeModulesInitialized = false;

/**
 * Initialize native modules for TUI
 * Call this once at application startup
 */
export async function initializeTuiNativeModules(): Promise<{
  success: boolean;
  modules: {
    ripgrep: boolean;
    imageProcessor: boolean;
    fileIndex: boolean;
    colorDiff: boolean;
  };
  error?: string;
}> {
  if (nativeModulesInitialized) {
    return {
      success: true,
      modules: { ripgrep: true, imageProcessor: true, fileIndex: true, colorDiff: true },
    };
  }

  try {
    // Dynamically import native modules
    const { initializeNativeModules } = await import("./native/index.js");

    const result = await initializeNativeModules();

    nativeModulesInitialized = true;

    console.log(`[TUI] Native modules initialized:`, {
      ripgrep: result.ripgrep,
      imageProcessor: result.imageProcessor,
      fileIndex: result.fileIndex,
      colorDiff: result.colorDiff,
    });

    return {
      success: true,
      modules: {
        ripgrep: result.ripgrep,
        imageProcessor: result.imageProcessor,
        fileIndex: result.fileIndex,
        colorDiff: result.colorDiff,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[TUI] Failed to initialize native modules: ${errorMsg}`);

    return {
      success: false,
      modules: { ripgrep: false, imageProcessor: false, fileIndex: false, colorDiff: false },
      error: errorMsg,
    };
  }
}

/**
 * Get native module status
 */
export function getTuiNativeModuleStatus(): {
  initialized: boolean;
  modules: {
    ripgrep: boolean;
    imageProcessor: boolean;
    fileIndex: boolean;
    colorDiff: boolean;
  };
} {
  return {
    initialized: nativeModulesInitialized,
    modules: {
      ripgrep: nativeModulesInitialized,
      imageProcessor: nativeModulesInitialized,
      fileIndex: nativeModulesInitialized,
      colorDiff: nativeModulesInitialized,
    },
  };
}
