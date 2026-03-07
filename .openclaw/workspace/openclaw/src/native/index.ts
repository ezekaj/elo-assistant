/**
 * Native Module System for OpenClaw
 *
 * Main export point for all native modules with automatic fallback support.
 *
 * @module @openclaw/native
 */

// Types
export type {
  NativeModule,
  NativeModuleConfig,
  LoadResult,
  NativeModuleRegistry,
  RipgrepOptions,
  RipgrepMatch,
  RipgrepResult,
  ImageProcessOptions,
  ImageProcessResult,
  FileIndexEntry,
  FileIndexBuildOptions,
  FileIndexSearchOptions,
  FileIndexSearchResult,
  HighlightOptions,
  DiffHighlightOptions,
  HighlightResult,
} from "./types.js";

// Loader
export {
  loadNativeModuleWithFallback,
  loadAndRegister,
  getModuleImplementation,
  isModuleNative,
  getRegistryStats,
  registry,
  getPlatform,
  getNativeExtension,
} from "./loader.js";

// Ripgrep module
export { createRipgrepModule, search, searchFiles, ripgrepModule } from "./ripgrep/index.js";

// Image processor module
export {
  createImageProcessorModule,
  processImage,
  resizeImage,
  convertImage,
  imageProcessorModule,
} from "./image-processor/index.js";

// File index module
export {
  createFileIndexModule,
  buildIndex,
  searchIndex,
  fileIndexModule,
} from "./file-index/index.js";

// Color diff module
export {
  createColorDiffModule,
  highlightCode,
  highlightDiff,
  colorDiffModule,
} from "./color-diff/index.js";

/**
 * Initialize all native modules
 * Call this at application startup to preload modules
 */
export async function initializeNativeModules(): Promise<{
  ripgrep: boolean;
  imageProcessor: boolean;
  fileIndex: boolean;
  colorDiff: boolean;
  stats: ReturnType<typeof getRegistryStats>;
}> {
  // Use the module promises directly to avoid hoisting issues
  const results = await Promise.allSettled([
    (await import("./ripgrep/index.js")).createRipgrepModule(),
    (await import("./image-processor/index.js")).createImageProcessorModule(),
    (await import("./file-index/index.js")).createFileIndexModule(),
    (await import("./color-diff/index.js")).createColorDiffModule(),
  ]);

  const ripgrep = results[0].status === "fulfilled";
  const imageProcessor = results[1].status === "fulfilled";
  const fileIndex = results[2].status === "fulfilled";
  const colorDiff = results[3].status === "fulfilled";

  // Use dynamic import to avoid hoisting issues
  const { getRegistryStats } = await import("./loader.js");

  return {
    ripgrep,
    imageProcessor,
    fileIndex,
    colorDiff,
    stats: getRegistryStats(),
  };
}

/**
 * Get summary of all loaded native modules
 */
export async function getNativeModuleStatus(): Promise<{
  available: boolean;
  modules: Array<{
    name: string;
    loaded: boolean;
    isNative: boolean;
    error?: string;
  }>;
  stats: {
    total: number;
    native: number;
    fallback: number;
  };
}> {
  // Use dynamic import to avoid hoisting issues
  const { getRegistryStats, registry } = await import("./loader.js");

  const stats = getRegistryStats();
  const expectedModules = ["ripgrep", "image-processor", "file-index", "color-diff"];
  const modules = expectedModules.map((name) => {
    const mod = registry.get(name);
    return {
      name,
      loaded: !!mod,
      isNative: mod?.isNative ?? false,
      error: mod?.loadError,
    };
  });

  return {
    available: stats.total > 0,
    modules,
    stats: {
      total: stats.total,
      native: stats.native,
      fallback: stats.fallback,
    },
  };
}
