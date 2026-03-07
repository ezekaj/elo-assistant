/**
 * Native Module Loader
 *
 * Dynamically loads native modules with automatic fallback to pure JS implementations.
 * Handles cross-platform differences and provides detailed error reporting.
 */

import type {
  NativeModule,
  NativeModuleConfig,
  LoadResult,
  NativeModuleRegistry,
} from "./types.js";
import { logInfo, logWarn, logError } from "../logger.js";

/**
 * Platform detection
 */
export function getPlatform(): { os: string; arch: string } {
  const platform = process.platform;
  const arch = process.arch;
  return { os: platform, arch };
}

/**
 * Get the native module file extension for current platform
 */
export function getNativeExtension(): string {
  const platform = process.platform;
  if (platform === "win32") {
    return ".node";
  }
  return ".node";
}

/**
 * Check if a native module file exists
 */
async function nativeModuleExists(path: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely load a native module with timeout
 */
async function loadNativeModule<T extends Record<string, unknown>>(
  path: string,
  timeout: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logWarn(`[NativeLoader] Native module load timeout: ${path}`);
      resolve(null);
    }, timeout);

    import(path)
      .then((mod) => {
        clearTimeout(timer);
        // Handle both default exports and module exports
        const exported = mod.default ?? mod;
        resolve(exported as T);
      })
      .catch((err) => {
        clearTimeout(timer);
        logWarn(`[NativeLoader] Failed to load native module: ${path}`, err);
        resolve(null);
      });
  });
}

/**
 * Load a native module with fallback support
 */
export async function loadNativeModuleWithFallback<T extends Record<string, unknown>>(
  config: NativeModuleConfig,
): Promise<LoadResult<T>> {
  const {
    name,
    nativePath,
    fallbackFactory,
    nativeFactory,
    preferNative = true,
    loadTimeout = 5000,
  } = config;

  let nativeModule: T | null = null;
  let loadError: string | undefined;

  // Try to load native module if path provided
  if (nativePath && preferNative) {
    const exists = await nativeModuleExists(nativePath);
    if (exists) {
      try {
        nativeModule = await loadNativeModule<T>(nativePath, loadTimeout);
      } catch (err) {
        loadError = err instanceof Error ? err.message : String(err);
      }
    } else {
      loadError = `Native module not found: ${nativePath}`;
    }
  }

  // Try native factory if provided
  if (!nativeModule && nativeFactory && preferNative) {
    try {
      nativeModule = await nativeFactory();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
  }

  // Use fallback if native failed or not preferred
  if (!nativeModule) {
    try {
      const fallback = await fallbackFactory();
      const module: NativeModule<T> = {
        name,
        isNative: false,
        implementation: fallback as T,
        loadError,
      };
      logInfo(`[NativeLoader] Using fallback implementation for: ${name}`);
      return {
        module,
        isNative: false,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logError(`[NativeLoader] Failed to load fallback for ${name}:`, errorMsg);
      return {
        module: null,
        isNative: false,
        error: `Both native and fallback failed: ${errorMsg}`,
      };
    }
  }

  // Native module loaded successfully
  const module: NativeModule<T> = {
    name,
    isNative: true,
    implementation: nativeModule,
  };
  logInfo(`[NativeLoader] Loaded native module: ${name}`);
  return {
    module,
    isNative: true,
  };
}

/**
 * Simple in-memory registry for loaded modules
 */
class ModuleRegistry implements NativeModuleRegistry {
  private modules: Map<string, NativeModule<Record<string, unknown>>> = new Map();

  get<T extends Record<string, unknown>>(name: string): NativeModule<T> | undefined {
    return this.modules.get(name) as NativeModule<T> | undefined;
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  keys(): string[] {
    return Array.from(this.modules.keys());
  }

  stats(): { total: number; native: number; fallback: number } {
    const modules = Array.from(this.modules.values());
    return {
      total: modules.length,
      native: modules.filter((m) => m.isNative).length,
      fallback: modules.filter((m) => !m.isNative).length,
    };
  }

  register<T extends Record<string, unknown>>(module: NativeModule<T>): void {
    this.modules.set(module.name, module as NativeModule<Record<string, unknown>>);
  }
}

/**
 * Global module registry instance
 */
export const registry: NativeModuleRegistry = new ModuleRegistry();

/**
 * Load and register a native module
 */
export async function loadAndRegister<T extends Record<string, unknown>>(
  config: NativeModuleConfig,
): Promise<NativeModule<T> | null> {
  const result = await loadNativeModuleWithFallback<T>(config);
  if (result.module) {
    registry.register(result.module);
  }
  return result.module;
}

/**
 * Get a loaded module's implementation
 */
export function getModuleImplementation<T extends Record<string, unknown>>(name: string): T | null {
  const module = registry.get<T>(name);
  return module?.implementation ?? null;
}

/**
 * Check if a module is using native implementation
 */
export function isModuleNative(name: string): boolean {
  const module = registry.get(name);
  return module?.isNative ?? false;
}

/**
 * Get registry statistics
 */
export function getRegistryStats(): {
  total: number;
  native: number;
  fallback: number;
  modules: Array<{ name: string; isNative: boolean; error?: string }>;
} {
  const stats = registry.stats();
  const modules = registry.keys().map((name) => {
    const mod = registry.get(name);
    return {
      name,
      isNative: mod?.isNative ?? false,
      error: mod?.loadError,
    };
  });
  return {
    ...stats,
    modules,
  };
}
