import { Type } from "@sinclair/typebox";
import * as fs from "fs/promises";
import * as path from "path";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";

// ============================================================================
// MCP NOTEBOOK PROTOCOL CONSTANTS
// ============================================================================

export const MCP_NOTEBOOK_PROTOCOL_VERSION = "2024-11-05";
export const MCP_NOTEBOOK_METHODS = {
  NOTEBOOK_READ: "notebook/read",
  NOTEBOOK_EDIT: "notebook/edit",
  NOTIFICATIONS_NOTEBOOK_STATUS: "notifications/notebook/status",
} as const;

// ============================================================================
// NOTEBOOK TYPES
// ============================================================================

export interface NotebookCell {
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  outputs?: any[];
  execution_count?: number | null;
  metadata?: Record<string, unknown>;
}

export interface NotebookMetadata {
  kernelspec?: {
    name: string;
    display_name: string;
  };
  language_info?: {
    name: string;
    version?: string;
    mimetype?: string;
    file_extension?: string;
  };
  [key: string]: unknown;
}

export interface NotebookDocument {
  cells: NotebookCell[];
  metadata: NotebookMetadata;
  nbformat: number;
  nbformat_minor: number;
}

export interface NotebookEditOperation {
  op: "replace" | "insert" | "delete" | "clear_outputs" | "update_metadata";
  cellIndex?: number;
  cellType?: "code" | "markdown" | "raw";
  source?: string;
  outputs?: any[];
  metadata?: Record<string, unknown>;
}

export interface NotebookEditResult {
  success: boolean;
  cellsModified: number;
  notebookPath: string;
  error?: string;
}

// ============================================================================
// NOTEBOOK UTILITIES
// ============================================================================

function isNotebookFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".ipynb");
}

function normalizeCellSource(source: string | string[]): string {
  if (Array.isArray(source)) {
    return source.join("");
  }
  return source;
}

function serializeCellSource(source: string): string[] {
  // Split by newlines but preserve them
  const lines = source.split("\n");
  return lines.map((line, index) => {
    if (index < lines.length - 1) {
      return line + "\n";
    }
    return line;
  });
}

async function readNotebookFile(filePath: string): Promise<NotebookDocument> {
  const content = await fs.readFile(filePath, "utf-8");
  const notebook = JSON.parse(content) as NotebookDocument;

  // Validate notebook structure
  if (!notebook.cells || !Array.isArray(notebook.cells)) {
    throw new Error("Invalid notebook format: missing cells array");
  }
  if (typeof notebook.nbformat !== "number") {
    throw new Error("Invalid notebook format: missing nbformat");
  }

  return notebook;
}

async function writeNotebookFile(filePath: string, notebook: NotebookDocument): Promise<void> {
  const content = JSON.stringify(notebook, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

function createCell(
  cellType: "code" | "markdown" | "raw",
  source: string,
  metadata?: Record<string, unknown>,
): NotebookCell {
  const cell: NotebookCell = {
    cell_type: cellType,
    source: serializeCellSource(source),
    metadata: metadata || {},
  };

  if (cellType === "code") {
    cell.outputs = [];
    cell.execution_count = null;
  }

  return cell;
}

function cellToString(cell: NotebookCell): string {
  const source = normalizeCellSource(cell.source);

  if (cell.cell_type === "code") {
    const outputText =
      cell.outputs && cell.outputs.length > 0
        ? `\n# Output:\n${JSON.stringify(cell.outputs, null, 2)}`
        : "";
    const execCount =
      cell.execution_count !== undefined && cell.execution_count !== null
        ? `In [${cell.execution_count}]: `
        : "";
    return `${execCount}${source}${outputText}`;
  }

  return source;
}

function notebookToMarkdown(notebook: NotebookDocument): string {
  const parts: string[] = [];

  // Add title from metadata if available
  const title = notebook.metadata.title as string | undefined;
  if (title) {
    parts.push(`# ${title}\n`);
  }

  for (const cell of notebook.cells) {
    if (cell.cell_type === "markdown" || cell.cell_type === "raw") {
      parts.push(normalizeCellSource(cell.source));
    } else if (cell.cell_type === "code") {
      const source = normalizeCellSource(cell.source);
      parts.push(`\`\`\`python\n${source}\n\`\`\``);

      if (cell.outputs && cell.outputs.length > 0) {
        parts.push("\n**Output:**");
        for (const output of cell.outputs) {
          if (output.output_type === "stream") {
            parts.push(`\n\`\`\`\n${output.text}\n\`\`\``);
          } else if (output.output_type === "execute_result") {
            const data = output.data as Record<string, unknown>;
            if (data["text/plain"]) {
              parts.push(`\n\`\`\`\n${data["text/plain"]}\n\`\`\``);
            }
            if (data["image/png"]) {
              parts.push(`\n![image](data:image/png;base64,${data["image/png"]})\n`);
            }
          } else if (output.output_type === "error") {
            parts.push(`\n\`\`\`\n${output.ename}: ${output.evalue}\n\`\`\``);
          }
        }
      }
    }

    parts.push("\n---\n");
  }

  return parts.join("\n");
}

// ============================================================================
// NOTEBOOK EDIT OPERATIONS
// ============================================================================

function applyEditOperation(
  notebook: NotebookDocument,
  operation: NotebookEditOperation,
): { success: boolean; error?: string } {
  switch (operation.op) {
    case "replace": {
      if (
        operation.cellIndex === undefined ||
        operation.cellIndex < 0 ||
        operation.cellIndex >= notebook.cells.length
      ) {
        return { success: false, error: `Invalid cell index: ${operation.cellIndex}` };
      }
      if (operation.source === undefined) {
        return { success: false, error: "Source is required for replace operation" };
      }

      const cell = notebook.cells[operation.cellIndex];
      cell.source = serializeCellSource(operation.source);
      if (operation.cellType && operation.cellType !== cell.cell_type) {
        cell.cell_type = operation.cellType;
      }
      if (operation.metadata) {
        cell.metadata = { ...cell.metadata, ...operation.metadata };
      }
      return { success: true };
    }

    case "insert": {
      const index =
        operation.cellIndex !== undefined
          ? Math.max(0, Math.min(operation.cellIndex, notebook.cells.length))
          : notebook.cells.length;

      if (operation.cellType === undefined) {
        return { success: false, error: "cellType is required for insert operation" };
      }
      if (operation.source === undefined) {
        return { success: false, error: "source is required for insert operation" };
      }

      const newCell = createCell(operation.cellType, operation.source, operation.metadata);
      notebook.cells.splice(index, 0, newCell);
      return { success: true };
    }

    case "delete": {
      if (
        operation.cellIndex === undefined ||
        operation.cellIndex < 0 ||
        operation.cellIndex >= notebook.cells.length
      ) {
        return { success: false, error: `Invalid cell index: ${operation.cellIndex}` };
      }
      notebook.cells.splice(operation.cellIndex, 1);
      return { success: true };
    }

    case "clear_outputs": {
      if (operation.cellIndex !== undefined) {
        // Clear specific cell
        if (operation.cellIndex < 0 || operation.cellIndex >= notebook.cells.length) {
          return { success: false, error: `Invalid cell index: ${operation.cellIndex}` };
        }
        const cell = notebook.cells[operation.cellIndex];
        if (cell.cell_type === "code") {
          cell.outputs = [];
          cell.execution_count = null;
        }
      } else {
        // Clear all cells
        for (const cell of notebook.cells) {
          if (cell.cell_type === "code") {
            cell.outputs = [];
            cell.execution_count = null;
          }
        }
      }
      return { success: true };
    }

    case "update_metadata": {
      if (operation.metadata) {
        notebook.metadata = { ...notebook.metadata, ...operation.metadata };
      }
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown operation: ${(operation as any).op}` };
  }
}

// ============================================================================
// MCP NOTEBOOK PROTOCOL HANDLER
// ============================================================================

export class McpNotebookProtocol {
  async handleRead(params: { path: string; includeOutputs?: boolean }): Promise<{
    notebook: NotebookDocument;
    markdown: string;
    cellCount: number;
  }> {
    const notebook = await readNotebookFile(params.path);
    const markdown = notebookToMarkdown(notebook);

    if (!params.includeOutputs) {
      // Strip outputs if not requested
      for (const cell of notebook.cells) {
        if (cell.cell_type === "code") {
          cell.outputs = [];
        }
      }
    }

    return {
      notebook,
      markdown,
      cellCount: notebook.cells.length,
    };
  }

  async handleEdit(params: {
    path: string;
    operations: NotebookEditOperation[];
  }): Promise<NotebookEditResult> {
    try {
      const notebook = await readNotebookFile(params.path);

      let cellsModified = 0;
      for (const operation of params.operations) {
        const result = applyEditOperation(notebook, operation);
        if (!result.success) {
          return {
            success: false,
            cellsModified,
            notebookPath: params.path,
            error: result.error,
          };
        }
        cellsModified++;
      }

      await writeNotebookFile(params.path, notebook);

      return {
        success: true,
        cellsModified,
        notebookPath: params.path,
      };
    } catch (error: any) {
      return {
        success: false,
        cellsModified: 0,
        notebookPath: params.path,
        error: error.message,
      };
    }
  }

  registerNotifications(
    onStatusChange: (path: string, status: "started" | "completed" | "failed") => void,
  ): void {
    // Placeholder for notification registration
  }
}

// ============================================================================
// NOTEBOOK READ TOOL
// ============================================================================

const NotebookReadSchema = Type.Object({
  path: Type.String({
    description: "Path to the Jupyter notebook file (.ipynb)",
  }),
  includeOutputs: Type.Optional(
    Type.Boolean({
      description: "Include cell outputs in the response (default: true)",
      default: true,
    }),
  ),
  format: Type.Optional(
    Type.Union([Type.Literal("json"), Type.Literal("markdown"), Type.Literal("cells")], {
      description:
        "Output format: json (full notebook), markdown (rendered), or cells (array of cells)",
      default: "markdown",
    }),
  ),
});

// ============================================================================
// NOTEBOOK OUTPUT SCHEMAS
// ============================================================================

const NotebookReadOutputSchema = Type.Object({
  path: Type.String(),
  notebook: Type.Optional(
    Type.Object({
      cells: Type.Array(Type.Any()),
      metadata: Type.Any(),
      nbformat: Type.Number(),
      nbformat_minor: Type.Number(),
    }),
  ),
  markdown: Type.Optional(Type.String()),
  cells: Type.Optional(Type.Array(Type.Any())),
  cellCount: Type.Number(),
  format: Type.String(),
});

const NotebookEditOutputSchema = Type.Object({
  success: Type.Boolean(),
  cellsModified: Type.Number(),
  notebookPath: Type.String(),
  saved: Type.Optional(Type.Boolean()),
  message: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  errors: Type.Optional(Type.Array(Type.String())),
});

const NotebookCellInfoOutputSchema = Type.Object({
  path: Type.String(),
  cellCount: Type.Number(),
  cells: Type.Array(
    Type.Object({
      index: Type.Number(),
      cell_type: Type.String(),
      source_length: Type.Number(),
      source_preview: Type.String(),
      has_outputs: Type.Boolean(),
      execution_count: Type.Optional(Type.Number()),
    }),
  ),
  metadata: Type.Object({
    nbformat: Type.Number(),
    nbformat_minor: Type.Number(),
    kernelspec: Type.Optional(Type.Any()),
    language_info: Type.Optional(Type.Any()),
  }),
});

export function createNotebookReadTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Notebook Read",
    name: "notebook_read",
    description:
      "Read a Jupyter notebook (.ipynb) file and extract its contents. Returns cells with code, markdown, and outputs.",
    parameters: NotebookReadSchema,
    outputSchema: NotebookReadOutputSchema,
    inputParamAliases: {
      file: "path",
      notebook: "path",
      ipynb: "path",
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const filePath = (params.path as string) || "notebook.ipynb";
      return `Reading notebook: ${path.basename(filePath)}`;
    },

    userFacingName() {
      return "Read Notebook";
    },

    async validateInput(params: Record<string, unknown>) {
      const filePath = params.path as string | undefined;

      if (!filePath) {
        return {
          result: false,
          message: "path is required",
          errorCode: 1,
        };
      }

      if (!isNotebookFile(filePath)) {
        return {
          result: false,
          message: "File must be a Jupyter notebook (.ipynb)",
          errorCode: 2,
        };
      }

      const resolvedPath = path.resolve(filePath);

      try {
        await fs.access(resolvedPath, fs.constants.F_OK);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return {
            result: false,
            message: `Notebook file not found: ${filePath}`,
            errorCode: 3,
          };
        }
        return {
          result: false,
          message: `Cannot access notebook file: ${error.message}`,
          errorCode: 4,
        };
      }

      return { result: true };
    },

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "path", { required: true });
      const includeOutputs = (params.includeOutputs as boolean) ?? true;
      const format = (params.format as "json" | "markdown" | "cells") ?? "markdown";

      const resolvedPath = path.resolve(filePath);

      try {
        const notebook = await readNotebookFile(resolvedPath);

        if (format === "json") {
          return jsonResult({
            path: resolvedPath,
            notebook: includeOutputs
              ? notebook
              : {
                  ...notebook,
                  cells: notebook.cells.map((cell) => ({
                    ...cell,
                    outputs: cell.cell_type === "code" ? [] : undefined,
                  })),
                },
            cellCount: notebook.cells.length,
            format: "json",
          });
        }

        if (format === "cells") {
          const cells = notebook.cells.map((cell, index) => ({
            index,
            cell_type: cell.cell_type,
            source: normalizeCellSource(cell.source),
            outputs: includeOutputs && cell.cell_type === "code" ? cell.outputs : undefined,
            execution_count: cell.execution_count,
          }));

          return jsonResult({
            path: resolvedPath,
            cells,
            cellCount: cells.length,
            format: "cells",
          });
        }

        // Default: markdown format
        const markdown = notebookToMarkdown(notebook);

        return jsonResult({
          path: resolvedPath,
          markdown,
          cellCount: notebook.cells.length,
          format: "markdown",
        });
      } catch (error: any) {
        return jsonResult({
          success: false,
          error: `Failed to read notebook: ${error.message}`,
          errorCode: 100,
        });
      }
    },
  };
}

// ============================================================================
// NOTEBOOK EDIT TOOL
// ============================================================================

const NotebookEditOperationSchema = Type.Union([
  // Replace operation
  Type.Object({
    op: Type.Literal("replace"),
    cellIndex: Type.Number({ description: "Index of cell to replace" }),
    source: Type.String({ description: "New cell source" }),
    cellType: Type.Optional(
      Type.Union([Type.Literal("code"), Type.Literal("markdown"), Type.Literal("raw")]),
    ),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  // Insert operation
  Type.Object({
    op: Type.Literal("insert"),
    cellIndex: Type.Optional(Type.Number({ description: "Index to insert at (default: end)" })),
    cellType: Type.Union([Type.Literal("code"), Type.Literal("markdown"), Type.Literal("raw")], {
      description: "Type of cell to insert",
    }),
    source: Type.String({ description: "Cell source code/markdown" }),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  }),
  // Delete operation
  Type.Object({
    op: Type.Literal("delete"),
    cellIndex: Type.Number({ description: "Index of cell to delete" }),
  }),
  // Clear outputs operation
  Type.Object({
    op: Type.Literal("clear_outputs"),
    cellIndex: Type.Optional(Type.Number({ description: "Specific cell to clear (default: all)" })),
  }),
  // Update metadata operation
  Type.Object({
    op: Type.Literal("update_metadata"),
    metadata: Type.Record(Type.String(), Type.Any(), { description: "Metadata to update" }),
  }),
]);

const NotebookEditSchema = Type.Object({
  path: Type.String({
    description: "Path to the Jupyter notebook file (.ipynb)",
  }),
  operations: Type.Array(NotebookEditOperationSchema, {
    description: "Array of edit operations to apply",
  }),
  save: Type.Optional(
    Type.Boolean({
      description: "Save changes to file (default: true)",
      default: true,
    }),
  ),
});

export function createNotebookEditTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Notebook Edit",
    name: "notebook_edit",
    description:
      "Edit a Jupyter notebook (.ipynb) file. Supports replacing, inserting, and deleting cells, as well as clearing outputs and updating metadata.",
    parameters: NotebookEditSchema,
    outputSchema: NotebookEditOutputSchema,
    inputParamAliases: {
      file: "path",
      notebook: "path",
      ipynb: "path",
      edits: "operations",
      edit: "operations",
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const filePath = (params.path as string) || "notebook.ipynb";
      const operations = (params.operations as any[]) || [];
      return `Editing notebook: ${path.basename(filePath)} (${operations.length} operations)`;
    },

    userFacingName() {
      return "Edit Notebook";
    },

    async validateInput(params: Record<string, unknown>) {
      const filePath = params.path as string | undefined;
      const operations = params.operations as any[] | undefined;

      if (!filePath) {
        return {
          result: false,
          message: "path is required",
          errorCode: 1,
        };
      }

      if (!isNotebookFile(filePath)) {
        return {
          result: false,
          message: "File must be a Jupyter notebook (.ipynb)",
          errorCode: 2,
        };
      }

      if (!operations || !Array.isArray(operations) || operations.length === 0) {
        return {
          result: false,
          message: "operations array is required and must not be empty",
          errorCode: 3,
        };
      }

      const resolvedPath = path.resolve(filePath);

      try {
        await fs.access(resolvedPath, fs.constants.F_OK);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return {
            result: false,
            message: `Notebook file not found: ${filePath}`,
            errorCode: 4,
          };
        }
        return {
          result: false,
          message: `Cannot access notebook file: ${error.message}`,
          errorCode: 5,
        };
      }

      return { result: true };
    },

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "path", { required: true });
      const operations = params.operations as NotebookEditOperation[] | undefined;
      const save = (params.save as boolean) ?? true;

      if (!operations || !Array.isArray(operations)) {
        return jsonResult({
          success: false,
          error: "operations must be an array",
          errorCode: 100,
        });
      }

      const resolvedPath = path.resolve(filePath);

      try {
        const notebook = await readNotebookFile(resolvedPath);

        let cellsModified = 0;
        const errors: string[] = [];

        for (let i = 0; i < operations.length; i++) {
          const operation = operations[i];
          const result = applyEditOperation(notebook, operation);

          if (!result.success) {
            errors.push(`Operation ${i}: ${result.error}`);
          } else {
            cellsModified++;
          }
        }

        if (errors.length > 0) {
          return jsonResult({
            success: false,
            cellsModified,
            notebookPath: resolvedPath,
            errors,
            errorCode: 101,
          });
        }

        if (save) {
          await writeNotebookFile(resolvedPath, notebook);
        }

        return jsonResult({
          success: true,
          cellsModified,
          notebookPath: resolvedPath,
          saved: save,
          message: `Successfully applied ${cellsModified} edit(s) to notebook`,
        });
      } catch (error: any) {
        return jsonResult({
          success: false,
          error: `Failed to edit notebook: ${error.message}`,
          errorCode: 102,
        });
      }
    },
  };
}

// ============================================================================
// NOTEBOOK CELL INFO TOOL
// ============================================================================

const NotebookCellInfoSchema = Type.Object({
  path: Type.String({
    description: "Path to the Jupyter notebook file (.ipynb)",
  }),
});

export function createNotebookCellInfoTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Notebook Cell Info",
    name: "notebook_cell_info",
    description: "Get information about cells in a Jupyter notebook without loading full content.",
    parameters: NotebookCellInfoSchema,
    outputSchema: NotebookCellInfoOutputSchema,
    inputParamAliases: {
      file: "path",
      notebook: "path",
      ipynb: "path",
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const filePath = (params.path as string) || "notebook.ipynb";
      return `Getting cell info: ${path.basename(filePath)}`;
    },

    userFacingName() {
      return "Notebook Cell Info";
    },

    async validateInput(params: Record<string, unknown>) {
      const filePath = params.path as string | undefined;

      if (!filePath) {
        return {
          result: false,
          message: "path is required",
          errorCode: 1,
        };
      }

      if (!isNotebookFile(filePath)) {
        return {
          result: false,
          message: "File must be a Jupyter notebook (.ipynb)",
          errorCode: 2,
        };
      }

      return { result: true };
    },

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "path", { required: true });

      const resolvedPath = path.resolve(filePath);

      try {
        const notebook = await readNotebookFile(resolvedPath);

        const cellInfo = notebook.cells.map((cell, index) => ({
          index,
          cell_type: cell.cell_type,
          source_length: normalizeCellSource(cell.source).length,
          source_preview: normalizeCellSource(cell.source).substring(0, 100),
          has_outputs: cell.cell_type === "code" && (cell.outputs?.length ?? 0) > 0,
          execution_count: cell.cell_type === "code" ? cell.execution_count : undefined,
        }));

        return jsonResult({
          path: resolvedPath,
          cellCount: cellInfo.length,
          cells: cellInfo,
          metadata: {
            nbformat: notebook.nbformat,
            nbformat_minor: notebook.nbformat_minor,
            kernelspec: notebook.metadata.kernelspec,
            language_info: notebook.metadata.language_info,
          },
        });
      } catch (error: any) {
        return jsonResult({
          success: false,
          error: `Failed to read notebook: ${error.message}`,
          errorCode: 100,
        });
      }
    },
  };
}

// ============================================================================
// EXPORTS FOR MCP PROTOCOL
// ============================================================================

export {
  McpNotebookProtocol,
  isNotebookFile,
  readNotebookFile,
  writeNotebookFile,
  notebookToMarkdown,
  normalizeCellSource,
  applyEditOperation,
  createCell,
};

export type {
  NotebookCell,
  NotebookDocument,
  NotebookMetadata,
  NotebookEditOperation,
  NotebookEditResult,
};
