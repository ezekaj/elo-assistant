/**
 * Notebook Tools Integration Tests
 * Tests for NotebookRead, NotebookEdit, and NotebookCellInfo tools
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  createNotebookReadTool,
  createNotebookEditTool,
  createNotebookCellInfoTool,
  McpNotebookProtocol,
  MCP_NOTEBOOK_PROTOCOL_VERSION,
  MCP_NOTEBOOK_METHODS,
  isNotebookFile,
  normalizeCellSource,
  serializeCellSource,
  createCell,
  applyEditOperation,
  type NotebookDocument,
} from "./notebook.js";

describe("Notebook Tools Integration", () => {
  let tempDir: string;
  let testNotebookPath: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-notebook-test-"));
    testNotebookPath = path.join(tempDir, "test.ipynb");

    // Create a test notebook
    const testNotebook: NotebookDocument = {
      cells: [
        {
          cell_type: "markdown",
          source: serializeCellSource("# Test Notebook\n\nThis is a test."),
          metadata: {},
        },
        {
          cell_type: "code",
          source: serializeCellSource('print("Hello, World!")'),
          execution_count: 1,
          outputs: [
            {
              output_type: "stream",
              name: "stdout",
              text: "Hello, World!\n",
            },
          ],
          metadata: {},
        },
        {
          cell_type: "code",
          source: serializeCellSource("x = 1 + 1\nprint(x)"),
          execution_count: 2,
          outputs: [
            {
              output_type: "stream",
              name: "stdout",
              text: "2\n",
            },
          ],
          metadata: {},
        },
      ],
      metadata: {
        kernelspec: {
          name: "python3",
          display_name: "Python 3",
        },
        language_info: {
          name: "python",
          version: "3.9.0",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    };

    await fs.writeFile(testNotebookPath, JSON.stringify(testNotebook, null, 2), "utf-8");
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // MCP PROTOCOL TESTS
  // ============================================================================

  describe("MCP Notebook Protocol", () => {
    it("should have correct protocol version", () => {
      expect(MCP_NOTEBOOK_PROTOCOL_VERSION).toBe("2024-11-05");
    });

    it("should have correct methods", () => {
      expect(MCP_NOTEBOOK_METHODS.NOTEBOOK_READ).toBe("notebook/read");
      expect(MCP_NOTEBOOK_METHODS.NOTEBOOK_EDIT).toBe("notebook/edit");
      expect(MCP_NOTEBOOK_METHODS.NOTIFICATIONS_NOTEBOOK_STATUS).toBe(
        "notifications/notebook/status",
      );
    });

    it("should create MCP protocol handler", () => {
      const protocol = new McpNotebookProtocol();
      expect(protocol).toBeDefined();
      expect(typeof protocol.handleRead).toBe("function");
      expect(typeof protocol.handleEdit).toBe("function");
    });
  });

  // ============================================================================
  // UTILITY FUNCTION TESTS
  // ============================================================================

  describe("Utility Functions", () => {
    it("should detect notebook files", () => {
      expect(isNotebookFile("test.ipynb")).toBe(true);
      expect(isNotebookFile("test.IPNB")).toBe(true);
      expect(isNotebookFile("test.py")).toBe(false);
      expect(isNotebookFile("test.txt")).toBe(false);
    });

    it("should normalize cell source", () => {
      expect(normalizeCellSource("hello")).toBe("hello");
      expect(normalizeCellSource(["hello", "\n", "world"])).toBe("hello\nworld");
      expect(normalizeCellSource([])).toBe("");
    });

    it("should serialize cell source", () => {
      const serialized = serializeCellSource("hello\nworld");
      expect(Array.isArray(serialized)).toBe(true);
      expect(serialized.join("")).toBe("hello\nworld");
    });

    it("should create cells", () => {
      const codeCell = createCell("code", 'print("hello")');
      expect(codeCell.cell_type).toBe("code");
      expect(codeCell.outputs).toEqual([]);
      expect(codeCell.execution_count).toBe(null);

      const mdCell = createCell("markdown", "# Hello");
      expect(mdCell.cell_type).toBe("markdown");
      expect(mdCell.outputs).toBeUndefined();
    });

    it("should apply replace operation", () => {
      const notebook: NotebookDocument = {
        cells: [createCell("code", "old code")],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const result = applyEditOperation(notebook, {
        op: "replace",
        cellIndex: 0,
        source: "new code",
      });

      expect(result.success).toBe(true);
      expect(normalizeCellSource(notebook.cells[0].source)).toBe("new code");
    });

    it("should apply insert operation", () => {
      const notebook: NotebookDocument = {
        cells: [createCell("code", "first")],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const result = applyEditOperation(notebook, {
        op: "insert",
        cellIndex: 0,
        cellType: "markdown",
        source: "inserted",
      });

      expect(result.success).toBe(true);
      expect(notebook.cells.length).toBe(2);
      expect(notebook.cells[0].cell_type).toBe("markdown");
    });

    it("should apply delete operation", () => {
      const notebook: NotebookDocument = {
        cells: [createCell("code", "first"), createCell("code", "second")],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const result = applyEditOperation(notebook, {
        op: "delete",
        cellIndex: 0,
      });

      expect(result.success).toBe(true);
      expect(notebook.cells.length).toBe(1);
      expect(normalizeCellSource(notebook.cells[0].source)).toBe("second");
    });

    it("should apply clear_outputs operation", () => {
      const notebook: NotebookDocument = {
        cells: [
          {
            cell_type: "code",
            source: serializeCellSource('print("hello")'),
            execution_count: 1,
            outputs: [{ output_type: "stream", text: "hello" }],
            metadata: {},
          },
        ],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const result = applyEditOperation(notebook, {
        op: "clear_outputs",
      });

      expect(result.success).toBe(true);
      expect(notebook.cells[0].outputs).toEqual([]);
      expect(notebook.cells[0].execution_count).toBe(null);
    });

    it("should fail on invalid cell index", () => {
      const notebook: NotebookDocument = {
        cells: [],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const result = applyEditOperation(notebook, {
        op: "replace",
        cellIndex: 0,
        source: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid cell index");
    });
  });

  // ============================================================================
  // NOTEBOOK READ TOOL TESTS
  // ============================================================================

  describe("NotebookRead Tool", () => {
    const tool = createNotebookReadTool();

    it("should have correct tool properties", () => {
      expect(tool.name).toBe("notebook_read");
      expect(tool.label).toBe("Notebook Read");
      expect(tool.isReadOnly?.()).toBe(true);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should validate input", async () => {
      // Missing path
      const result1 = await tool.validateInput!({});
      expect(result1.result).toBe(false);

      // Non-notebook file
      const result2 = await tool.validateInput!({ path: "test.py" });
      expect(result2.result).toBe(false);

      // Non-existent file
      const result3 = await tool.validateInput!({ path: "nonexistent.ipynb" });
      expect(result3.result).toBe(false);

      // Valid file
      const result4 = await tool.validateInput!({ path: testNotebookPath });
      expect(result4.result).toBe(true);
    });

    it("should read notebook in markdown format", async () => {
      const result = await tool.call!({ path: testNotebookPath, format: "markdown" });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.markdown).toBeDefined();
      expect(details.cellCount).toBe(3);
      expect(details.format).toBe("markdown");
    });

    it("should read notebook in json format", async () => {
      const result = await tool.call!({ path: testNotebookPath, format: "json" });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.notebook).toBeDefined();
      expect(details.notebook.cells).toBeDefined();
      expect(details.format).toBe("json");
    });

    it("should read notebook cells", async () => {
      const result = await tool.call!({ path: testNotebookPath, format: "cells" });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.cells).toBeDefined();
      expect(Array.isArray(details.cells)).toBe(true);
      expect(details.cells.length).toBe(3);
      expect(details.format).toBe("cells");
    });

    it("should exclude outputs when requested", async () => {
      const result = await tool.call!({
        path: testNotebookPath,
        format: "json",
        includeOutputs: false,
      });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      // Outputs should be stripped
      for (const cell of details.notebook.cells) {
        if (cell.cell_type === "code") {
          expect(cell.outputs).toEqual([]);
        }
      }
    });
  });

  // ============================================================================
  // NOTEBOOK EDIT TOOL TESTS
  // ============================================================================

  describe("NotebookEdit Tool", () => {
    const tool = createNotebookEditTool();
    let tempNotebookPath: string;

    beforeAll(async () => {
      tempNotebookPath = path.join(tempDir, "edit_test.ipynb");
      const testNotebook: NotebookDocument = {
        cells: [createCell("code", 'print("original")')],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };
      await fs.writeFile(tempNotebookPath, JSON.stringify(testNotebook, null, 2), "utf-8");
    });

    it("should have correct tool properties", () => {
      expect(tool.name).toBe("notebook_edit");
      expect(tool.label).toBe("Notebook Edit");
      expect(tool.isReadOnly?.()).toBe(false);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should validate input", async () => {
      // Missing path
      const result1 = await tool.validateInput!({});
      expect(result1.result).toBe(false);

      // Missing operations
      const result2 = await tool.validateInput!({ path: testNotebookPath });
      expect(result2.result).toBe(false);

      // Empty operations
      const result3 = await tool.validateInput!({ path: testNotebookPath, operations: [] });
      expect(result3.result).toBe(false);

      // Valid input
      const result4 = await tool.validateInput!({
        path: tempNotebookPath,
        operations: [{ op: "replace", cellIndex: 0, source: "test" }],
      });
      expect(result4.result).toBe(true);
    });

    it("should replace cell content", async () => {
      const result = await tool.call!({
        path: tempNotebookPath,
        operations: [{ op: "replace", cellIndex: 0, source: 'print("modified")' }],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(true);
      expect(details.cellsModified).toBe(1);

      // Verify the change
      const content = await fs.readFile(tempNotebookPath, "utf-8");
      const notebook = JSON.parse(content) as NotebookDocument;
      expect(normalizeCellSource(notebook.cells[0].source)).toBe('print("modified")');
    });

    it("should insert new cell", async () => {
      const result = await tool.call!({
        path: tempNotebookPath,
        operations: [{ op: "insert", cellType: "markdown", source: "# New Cell" }],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(true);

      // Verify the change
      const content = await fs.readFile(tempNotebookPath, "utf-8");
      const notebook = JSON.parse(content) as NotebookDocument;
      expect(notebook.cells.length).toBe(2);
    });

    it("should delete cell", async () => {
      const result = await tool.call!({
        path: tempNotebookPath,
        operations: [{ op: "delete", cellIndex: 0 }],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(true);

      // Verify the change
      const content = await fs.readFile(tempNotebookPath, "utf-8");
      const notebook = JSON.parse(content) as NotebookDocument;
      expect(notebook.cells.length).toBe(1);
    });

    it("should clear outputs", async () => {
      // First create a notebook with outputs
      const notebookWithOutputs: NotebookDocument = {
        cells: [
          {
            cell_type: "code",
            source: serializeCellSource('print("test")'),
            execution_count: 1,
            outputs: [{ output_type: "stream", name: "stdout", text: "test" }],
            metadata: {},
          },
        ],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };

      const tempPath = path.join(tempDir, "clear_test.ipynb");
      await fs.writeFile(tempPath, JSON.stringify(notebookWithOutputs, null, 2), "utf-8");

      const result = await tool.call!({
        path: tempPath,
        operations: [{ op: "clear_outputs" }],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(true);

      // Verify outputs cleared
      const content = await fs.readFile(tempPath, "utf-8");
      const notebook = JSON.parse(content) as NotebookDocument;
      expect(notebook.cells[0].outputs).toEqual([]);
      expect(notebook.cells[0].execution_count).toBe(null);
    });

    it("should handle multiple operations", async () => {
      const result = await tool.call!({
        path: tempNotebookPath,
        operations: [
          { op: "replace", cellIndex: 0, source: "new code" },
          { op: "insert", cellType: "code", source: "more code" },
          { op: "clear_outputs" },
        ],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(true);
      expect(details.cellsModified).toBe(3);
    });

    it("should fail on invalid operation", async () => {
      const result = await tool.call!({
        path: tempNotebookPath,
        operations: [{ op: "replace", cellIndex: 999, source: "test" }],
      });

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.success).toBe(false);
      expect(details.errors).toBeDefined();
    });
  });

  // ============================================================================
  // NOTEBOOK CELL INFO TOOL TESTS
  // ============================================================================

  describe("NotebookCellInfo Tool", () => {
    const tool = createNotebookCellInfoTool();

    it("should have correct tool properties", () => {
      expect(tool.name).toBe("notebook_cell_info");
      expect(tool.label).toBe("Notebook Cell Info");
      expect(tool.isReadOnly?.()).toBe(true);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should get cell info", async () => {
      const result = await tool.call!({ path: testNotebookPath });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.cellCount).toBe(3);
      expect(details.cells).toBeDefined();
      expect(Array.isArray(details.cells)).toBe(true);
      expect(details.cells[0].cell_type).toBeDefined();
      expect(details.cells[0].source_length).toBeDefined();
    });

    it("should include metadata", async () => {
      const result = await tool.call!({ path: testNotebookPath });
      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.metadata).toBeDefined();
      expect(details.metadata.kernelspec).toBeDefined();
      expect(details.metadata.language_info).toBeDefined();
    });
  });

  // ============================================================================
  // MCP PROTOCOL HANDLER TESTS
  // ============================================================================

  describe("MCP Protocol Handler", () => {
    const protocol = new McpNotebookProtocol();

    it("should handle read", async () => {
      const result = await protocol.handleRead({ path: testNotebookPath });
      expect(result.notebook).toBeDefined();
      expect(result.markdown).toBeDefined();
      expect(result.cellCount).toBe(3);
    });

    it("should handle edit", async () => {
      const tempPath = path.join(tempDir, "mcp_edit_test.ipynb");
      const testNotebook: NotebookDocument = {
        cells: [createCell("code", "original")],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 0,
      };
      await fs.writeFile(tempPath, JSON.stringify(testNotebook, null, 2), "utf-8");

      const result = await protocol.handleEdit({
        path: tempPath,
        operations: [{ op: "replace", cellIndex: 0, source: "modified" }],
      });

      expect(result.success).toBe(true);
      expect(result.cellsModified).toBe(1);
    });
  });
});
