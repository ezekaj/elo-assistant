/**
 * Native Module Tools for OpenClaw
 *
 * Export all native module-based tools for integration with OpenClaw.
 */

// Grep tools
export { createGrepTool, createRglobTool, grepTool, rglobTool } from "./grep-tool.js";

// File search tools
export {
  createFileSearchTool,
  createFileIndexTool,
  fileSearchTool,
  fileIndexTool,
} from "./file-search-tool.js";

// Image tools
export {
  createImageTool,
  createImageAnalyzeTool,
  imageTool,
  imageAnalyzeTool,
} from "./image-tool.js";

// Color diff tools
export {
  createHighlightTool,
  createDiffHighlightTool,
  createDetectLanguageTool,
  createListLanguagesTool,
  highlightTool,
  diffHighlightTool,
  detectLanguageTool,
  listLanguagesTool,
} from "./color-diff-tool.js";

/**
 * Get all native module tools
 */
export function getNativeModuleTools() {
  return [
    grepTool,
    rglobTool,
    fileSearchTool,
    fileIndexTool,
    imageTool,
    imageAnalyzeTool,
    highlightTool,
    diffHighlightTool,
    detectLanguageTool,
    listLanguagesTool,
  ];
}

/**
 * Create all native module tools
 */
export function createAllNativeTools() {
  return [
    createGrepTool(),
    createRglobTool(),
    createFileSearchTool(),
    createFileIndexTool(),
    createImageTool(),
    createImageAnalyzeTool(),
    createHighlightTool(),
    createDiffHighlightTool(),
    createDetectLanguageTool(),
    createListLanguagesTool(),
  ];
}
