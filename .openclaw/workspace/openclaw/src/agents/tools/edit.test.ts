/**
 * Edit Tool Unit Tests
 * Tests for all Edit tool features including:
 * - Multi-edit support
 * - Smart quote handling
 * - Line ending preservation
 * - Encoding detection
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  normalizeQuotes,
  detectLineEnding,
  preserveLineEndings,
  detectEncoding,
  findStringWithQuoteNormalization,
  applyEditWithQuoteNormalization,
  applyMultipleEdits,
  EDIT_ERROR_CODES
} from './edit.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Edit Tool - Smart Quote Handling', () => {
  describe('normalizeQuotes', () => {
    it('should convert smart double quotes to regular quotes', () => {
      const input = 'He said "Hello" to her';
      const expected = 'He said "Hello" to her';
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it('should convert smart single quotes to regular quotes', () => {
      const input = 'It's a test';
      const expected = "It's a test";
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it('should convert en dash to hyphen', () => {
      const input = 'Pages 1–10';
      const expected = 'Pages 1-10';
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it('should convert em dash to hyphen', () => {
      const input = 'Test—Result';
      const expected = 'Test-Result';
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it('should convert ellipsis to three dots', () => {
      const input = 'Wait...';
      const expected = 'Wait...';
      expect(normalizeQuotes(input)).toBe(expected);
    });

    it('should handle mixed smart quotes', () => {
      const input = 'She said "It's fine" to me';
      const expected = 'She said "It\'s fine" to me';
      expect(normalizeQuotes(input)).toBe(expected);
    });
  });

  describe('findStringWithQuoteNormalization', () => {
    it('should find exact match', () => {
      const content = 'Hello "world" test';
      const search = '"world"';
      const result = findStringWithQuoteNormalization(content, search);
      expect(result).toBe('"world"');
    });

    it('should find match with smart quotes', () => {
      const content = 'Hello "world" test';
      const search = '"world"';
      const result = findStringWithQuoteNormalization(content, search);
      expect(result).toBe('"world"');
    });

    it('should find match with smart apostrophe', () => {
      const content = 'It's a test';
      const search = "It's a test";
      const result = findStringWithQuoteNormalization(content, search);
      expect(result).toBe("It's");
    });

    it('should return null when not found', () => {
      const content = 'Hello world';
      const search = 'goodbye';
      const result = findStringWithQuoteNormalization(content, search);
      expect(result).toBeNull();
    });
  });
});

describe('Edit Tool - Line Ending Handling', () => {
  describe('detectLineEnding', () => {
    it('should detect CRLF line endings', () => {
      const content = 'line1\r\nline2\r\nline3';
      expect(detectLineEnding(content)).toBe('\r\n');
    });

    it('should detect LF line endings', () => {
      const content = 'line1\nline2\nline3';
      expect(detectLineEnding(content)).toBe('\n');
    });

    it('should default to LF when mixed', () => {
      const content = 'line1\nline2\r\nline3\n';
      expect(detectLineEnding(content)).toBe('\n');
    });

    it('should handle empty content', () => {
      const content = '';
      expect(detectLineEnding(content)).toBe('\n');
    });
  });

  describe('preserveLineEndings', () => {
    it('should preserve CRLF line endings', () => {
      const content = 'line1\nline2\nline3';
      const result = preserveLineEndings(content, '\r\n');
      expect(result).toBe('line1\r\nline2\r\nline3');
    });

    it('should preserve LF line endings', () => {
      const content = 'line1\r\nline2\r\nline3';
      const result = preserveLineEndings(content, '\n');
      expect(result).toBe('line1\nline2\nline3');
    });

    it('should handle mixed line endings', () => {
      const content = 'line1\rline2\nline3\r\n';
      const result = preserveLineEndings(content, '\n');
      expect(result).toBe('line1\nline2\nline3\n');
    });
  });
});

describe('Edit Tool - Encoding Detection', () => {
  describe('detectEncoding', () => {
    it('should detect UTF-8 without BOM', () => {
      const buffer = Buffer.from('Hello world', 'utf-8');
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should detect UTF-8 with BOM', () => {
      const buffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(detectEncoding(buffer)).toBe('utf-8');
    });

    it('should detect UTF-16 LE with BOM', () => {
      const buffer = Buffer.from([0xFF, 0xFE, 0x48, 0x00]);
      expect(detectEncoding(buffer)).toBe('utf-16le');
    });

    it('should detect UTF-16 BE with BOM', () => {
      const buffer = Buffer.from([0xFE, 0xFF, 0x00, 0x48]);
      expect(detectEncoding(buffer)).toBe('utf-16be');
    });

    it('should default to UTF-8 for unknown encoding', () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(detectEncoding(buffer)).toBe('utf-8');
    });
  });
});

describe('Edit Tool - Edit Application', () => {
  describe('applyEditWithQuoteNormalization', () => {
    it('should apply simple edit', () => {
      const content = 'Hello world';
      const result = applyEditWithQuoteNormalization(content, 'world', 'universe', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello universe');
    });

    it('should apply edit with smart quotes', () => {
      const content = 'She said "Hello"';
      const result = applyEditWithQuoteNormalization(content, 'She said "Hello"', 'He said "Hi"', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('He said "Hi"');
    });

    it('should fail when string not found', () => {
      const content = 'Hello world';
      const result = applyEditWithQuoteNormalization(content, 'goodbye', 'hello', false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should detect multiple occurrences', () => {
      const content = 'test test test';
      const result = applyEditWithQuoteNormalization(content, 'test', 'best', false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('3 occurrences');
    });

    it('should replace all occurrences when requested', () => {
      const content = 'test test test';
      const result = applyEditWithQuoteNormalization(content, 'test', 'best', true);
      expect(result.success).toBe(true);
      expect(result.content).toBe('best best best');
    });
  });

  describe('applyMultipleEdits', () => {
    it('should apply multiple edits sequentially', () => {
      const content = 'Hello world';
      const edits = [
        { old_string: 'Hello', new_string: 'Goodbye' },
        { old_string: 'world', new_string: 'universe' }
      ];
      const result = applyMultipleEdits(content, edits);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Goodbye universe');
    });

    it('should fail on edit conflict', () => {
      const content = 'Hello';
      const edits = [
        { old_string: 'Hello', new_string: 'Hello world' },
        { old_string: 'Hello', new_string: 'Goodbye' }
      ];
      const result = applyMultipleEdits(content, edits);
      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
    });

    it('should handle empty edits array', () => {
      const content = 'Hello';
      const edits: any[] = [];
      const result = applyMultipleEdits(content, edits);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello');
    });
  });
});

describe('Edit Tool - Error Codes', () => {
  it('should have correct error code mappings', () => {
    expect(EDIT_ERROR_CODES.NO_CHANGES).toBe(1);
    expect(EDIT_ERROR_CODES.PERMISSION_DENIED).toBe(2);
    expect(EDIT_ERROR_CODES.FILE_EXISTS).toBe(3);
    expect(EDIT_ERROR_CODES.FILE_NOT_FOUND).toBe(4);
    expect(EDIT_ERROR_CODES.NOTEBOOK_FILE).toBe(5);
    expect(EDIT_ERROR_CODES.NOT_READ).toBe(6);
    expect(EDIT_ERROR_CODES.FILE_MODIFIED).toBe(7);
    expect(EDIT_ERROR_CODES.STRING_NOT_FOUND).toBe(8);
    expect(EDIT_ERROR_CODES.MULTIPLE_OCCURRENCES).toBe(9);
    expect(EDIT_ERROR_CODES.EDIT_CONFLICT).toBe(10);
    expect(EDIT_ERROR_CODES.INVALID_SEQUENCE).toBe(11);
    expect(EDIT_ERROR_CODES.ENCODING_FAILED).toBe(12);
    expect(EDIT_ERROR_CODES.LINE_ENDING_FAILED).toBe(13);
    expect(EDIT_ERROR_CODES.LSP_FAILED).toBe(14);
    expect(EDIT_ERROR_CODES.GIT_DIFF_FAILED).toBe(15);
  });
});

describe('Edit Tool - Integration Tests', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'edit-test-'));
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('File-based tests', () => {
    it('should handle CRLF file', async () => {
      const testFile = path.join(tempDir, 'crlf.txt');
      const crlfContent = 'line1\r\nline2\r\nline3';
      await fs.promises.writeFile(testFile, crlfContent);

      const content = await fs.promises.readFile(testFile, 'utf-8');
      const lineEnding = detectLineEnding(content);
      expect(lineEnding).toBe('\r\n');

      const edited = preserveLineEndings('line1\nline2\nline3\nline4', lineEnding);
      expect(edited).toBe('line1\r\nline2\r\nline3\r\nline4');
    });

    it('should handle UTF-8 with BOM', async () => {
      const testFile = path.join(tempDir, 'utf8bom.txt');
      const bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF, 0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      await fs.promises.writeFile(testFile, bomBuffer);

      const buffer = await fs.promises.readFile(testFile);
      const encoding = detectEncoding(buffer);
      expect(encoding).toBe('utf-8');
    });

    it('should handle smart quotes in file', async () => {
      const testFile = path.join(tempDir, 'smartquotes.txt');
      const content = 'She said "Hello" to him';
      await fs.promises.writeFile(testFile, content);

      const fileContent = await fs.promises.readFile(testFile, 'utf-8');
      const search = 'She said "Hello"';
      const matched = findStringWithQuoteNormalization(fileContent, search);
      expect(matched).toBeTruthy();
    });
  });
});

describe('Edit Tool - Edge Cases', () => {
  describe('Empty and null handling', () => {
    it('should handle empty content', () => {
      const content = '';
      const result = applyEditWithQuoteNormalization(content, '', 'Hello', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const content = `prefix${longString}suffix`;
      const result = applyEditWithQuoteNormalization(content, longString, 'b'.repeat(5000), false);
      expect(result.success).toBe(true);
      expect(result.content!.length).toBe(6 + 5000);
    });

    it('should handle special regex characters', () => {
      const content = 'Test [abc] (def) {ghi}';
      const result = applyEditWithQuoteNormalization(content, '[abc]', '[xyz]', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Test [xyz] (def) {ghi}');
    });
  });

  describe('Unicode handling', () => {
    it('should handle emoji', () => {
      const content = 'Hello 🌍 world';
      const result = applyEditWithQuoteNormalization(content, '🌍', '🌎', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello 🌎 world');
    });

    it('should handle CJK characters', () => {
      const content = '你好世界';
      const result = applyEditWithQuoteNormalization(content, '世界', '地球', false);
      expect(result.success).toBe(true);
      expect(result.content).toBe('你好地球');
    });
  });
});
