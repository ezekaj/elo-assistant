/**
 * Edit Tool Integration Tests
 * Full integration tests for the Edit tool with OpenClaw
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createEditTool } from './edit.js';
import { recordFileRead } from './write.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Edit Tool - Full Integration', () => {
  let tempDir: string;
  let editTool: ReturnType<typeof createEditTool>;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'edit-integration-'));
    editTool = createEditTool();
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('Single Edit Mode', () => {
    it('should edit a file with basic edit', async () => {
      const testFile = path.join(tempDir, 'basic-edit.txt');
      const content = 'Hello world\nThis is a test';
      await fs.promises.writeFile(testFile, content);

      // Record file as read (required for edit)
      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      // Perform edit
      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'world',
        new_string: 'universe'
      }, {});

      expect(result).toBeDefined();
      expect((result as any).success).toBe(true);
      expect((result as any).type).toBe('update');

      // Verify file was edited
      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toContain('Hello universe');
    });

    it('should fail if file not read first', async () => {
      const testFile = path.join(tempDir, 'unread-file.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      // Don't record file as read - should fail
      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'world',
        new_string: 'universe'
      }, {});

      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
      expect((result as any).errorCode).toBe(6); // NOT_READ
    });

    it('should fail if string not found', async () => {
      const testFile = path.join(tempDir, 'not-found.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'goodbye',
        new_string: 'hello'
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('not found');
    });

    it('should fail if multiple occurrences without replace_all', async () => {
      const testFile = path.join(tempDir, 'multiple.txt');
      const content = 'test test test';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'test',
        new_string: 'best'
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('occurrences');
    });

    it('should succeed with replace_all for multiple occurrences', async () => {
      const testFile = path.join(tempDir, 'replace-all.txt');
      const content = 'test test test';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'test',
        new_string: 'best',
        replace_all: true
      }, {});

      expect((result as any).success).toBe(true);

      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toBe('best best best');
    });
  });

  describe('Multi-Edit Mode', () => {
    it('should apply multiple edits', async () => {
      const testFile = path.join(tempDir, 'multi-edit.txt');
      const content = 'Hello world\nGoodbye world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        edits: [
          { old_string: 'Hello', new_string: 'Hi' },
          { old_string: 'Goodbye', new_string: 'See you' }
        ]
      }, {});

      expect((result as any).success).toBe(true);
      expect((result as any).edits).toHaveLength(2);

      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toContain('Hi world');
      expect(newContent).toContain('See you world');
    });

    it('should fail on conflicting edits', async () => {
      const testFile = path.join(tempDir, 'conflict.txt');
      const content = 'Hello';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        edits: [
          { old_string: 'Hello', new_string: 'Hello world' },
          { old_string: 'Hello', new_string: 'Goodbye' }
        ]
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('conflict');
    });

    it('should handle single edit in multi-edit format', async () => {
      const testFile = path.join(tempDir, 'single-multi.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        edits: [
          { old_string: 'world', new_string: 'universe' }
        ]
      }, {});

      expect((result as any).success).toBe(true);

      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toBe('Hello universe');
    });
  });

  describe('Smart Quote Handling', () => {
    it('should match smart double quotes', async () => {
      const testFile = path.join(tempDir, 'smart-double.txt');
      const content = 'She said "Hello" to him';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      // Search with regular quotes, should match smart quotes
      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'She said "Hello"',
        new_string: 'He said "Hi"'
      }, {});

      expect((result as any).success).toBe(true);

      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toContain('He said "Hi"');
    });

    it('should match smart apostrophe', async () => {
      const testFile = path.join(tempDir, 'smart-apostrophe.txt');
      const content = 'It's a beautiful day';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      // Search with regular apostrophe, should match smart apostrophe
      const result = await editTool.call!({
        file_path: testFile,
        old_string: "It's a",
        new_string: "It was a"
      }, {});

      expect((result as any).success).toBe(true);

      const newContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(newContent).toContain('It was a beautiful day');
    });
  });

  describe('Line Ending Preservation', () => {
    it('should preserve CRLF line endings', async () => {
      const testFile = path.join(tempDir, 'crlf-preserve.txt');
      const crlfContent = 'line1\r\nline2\r\nline3';
      await fs.promises.writeFile(testFile, crlfContent);

      const stats = await fs.promises.stat(testFile);
      const content = await fs.promises.readFile(testFile, 'utf-8');
      recordFileRead(testFile, content, stats.mtimeMs, '\r\n');

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'line2',
        new_string: 'line2 edited'
      }, {});

      expect((result as any).success).toBe(true);

      // Read raw buffer to check line endings
      const rawBuffer = await fs.promises.readFile(testFile);
      const rawContent = rawBuffer.toString('utf-8');
      expect(rawContent).toContain('\r\n');
      expect(rawContent).toContain('line2 edited');
    });

    it('should preserve LF line endings', async () => {
      const testFile = path.join(tempDir, 'lf-preserve.txt');
      const lfContent = 'line1\nline2\nline3';
      await fs.promises.writeFile(testFile, lfContent);

      const stats = await fs.promises.stat(testFile);
      const content = await fs.promises.readFile(testFile, 'utf-8');
      recordFileRead(testFile, content, stats.mtimeMs, '\n');

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'line2',
        new_string: 'line2 edited'
      }, {});

      expect((result as any).success).toBe(true);

      const rawContent = await fs.promises.readFile(testFile, 'utf-8');
      expect(rawContent).not.toContain('\r\n');
      expect(rawContent).toContain('line2 edited');
    });
  });

  describe('Error Handling', () => {
    it('should return error for notebook file', async () => {
      const testFile = path.join(tempDir, 'notebook.ipynb');
      const content = '{"cells": []}';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'cells',
        new_string: 'notebooks'
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).errorCode).toBe(5); // NOTEBOOK_FILE
    });

    it('should return error for no changes', async () => {
      const testFile = path.join(tempDir, 'no-change.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'Hello world',
        new_string: 'Hello world'
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('exactly the same');
    });

    it('should return error for externally modified file', async () => {
      const testFile = path.join(tempDir, 'modified.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      // Modify file externally
      await fs.promises.writeFile(testFile, 'Modified externally');

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'Modified',
        new_string: 'Changed'
      }, {});

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('modified since read');
    });
  });

  describe('Output Schema', () => {
    it('should return structured output for single edit', async () => {
      const testFile = path.join(tempDir, 'output-single.txt');
      const content = 'Hello world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        old_string: 'world',
        new_string: 'universe'
      }, {});

      expect((result as any).type).toBe('update');
      expect((result as any).filePath).toBe(testFile);
      expect((result as any).oldString).toBe('world');
      expect((result as any).newString).toBe('universe');
      expect((result as any).structuredPatch).toBeDefined();
      expect((result as any).gitDiff).toBeDefined();
      expect((result as any).originalFile).toBe(content);
    });

    it('should return structured output for multi-edit', async () => {
      const testFile = path.join(tempDir, 'output-multi.txt');
      const content = 'Hello world\nGoodbye world';
      await fs.promises.writeFile(testFile, content);

      const stats = await fs.promises.stat(testFile);
      recordFileRead(testFile, content, stats.mtimeMs);

      const result = await editTool.call!({
        file_path: testFile,
        edits: [
          { old_string: 'Hello', new_string: 'Hi' },
          { old_string: 'Goodbye', new_string: 'See you' }
        ]
      }, {});

      expect((result as any).type).toBe('update');
      expect((result as any).filePath).toBe(testFile);
      expect((result as any).edits).toHaveLength(2);
      expect((result as any).structuredPatch).toBeDefined();
      expect((result as any).gitDiff).toBeDefined();
    });
  });
});
