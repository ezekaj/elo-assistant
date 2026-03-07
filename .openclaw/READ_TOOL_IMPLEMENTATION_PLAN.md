# 📋 READ TOOL IMPLEMENTATION PLAN

**Date:** 2026-02-23  
**Goal:** Implement all missing Claude Code Read tool features in OpenClaw

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Core Security Features (HIGH PRIORITY)
1. Binary file detection (50+ extensions)
2. Device file check (/dev/* blocklist)
3. Permission/directory denial checks

### Phase 2: PDF Support (HIGH PRIORITY)
1. Install pdf-parse dependency
2. Implement PDF text extraction
3. Implement PDF page extraction (with poppler-utils optional)

### Phase 3: Quality of Life Features (MEDIUM PRIORITY)
1. Symlink resolution
2. Typo suggestions
3. Image resizing with sharp

### Phase 4: Testing & Verification
1. Unit tests for each feature
2. Integration tests
3. Performance testing
4. Documentation

---

## 📦 DEPENDENCIES

```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1",
    "sharp": "^0.33.0",
    "fuzzysort": "^2.0.4"
  },
  "optionalDependencies": {
    "poppler-utils": "system package"
  }
}
```

**Install Commands:**
```bash
cd /Users/tolga/.openclaw/workspace/openclaw
npm install pdf-parse sharp fuzzysort
```

---

## 🔧 FILE MODIFICATIONS

### 1. `/src/agents/tools/read.ts`
**Lines to modify:** Complete rewrite (~500 lines)

**New Features:**
- Binary file detection (BINARY_EXTENSIONS set)
- Device file check (DEVICE_FILES set)
- PDF parsing with pdf-parse
- PDF page extraction (optional poppler)
- Symlink resolution
- Typo suggestions
- Image resizing

### 2. `/src/agents/tools/read-utils.ts` (NEW FILE)
**Purpose:** Helper functions for Read tool

**Functions:**
- `findSimilarFiles(filePath, cwd)` - Fuzzy file matching
- `detectTypo(filePath)` - Common typo detection
- `resolveSymlinks(filePath)` - Symlink resolution
- `compressImage(buffer, options)` - Image resizing
- `extractPdfPages(filePath, range)` - PDF page extraction

### 3. `/src/config/types.sandbox.ts`
**Lines to modify:** Already done (added network field)

**Verify:** Network restrictions are properly typed

### 4. `/src/agents/pi-tools.ts`
**Lines to modify:** Already done (line 298)

**Verify:** Network config passes through correctly

---

## 📝 IMPLEMENTATION DETAILS

### 1. Binary File Detection

```typescript
const BINARY_EXTENSIONS = new Set([
  // Audio
  'mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma', 'aiff', 'opus',
  // Video
  'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', 'mpeg', 'mpg',
  // Archives
  'zip', 'rar', 'tar', 'gz', 'bz2', '7z', 'xz', 'z', 'tgz', 'iso',
  // Executables
  'exe', 'dll', 'so', 'dylib', 'app', 'msi', 'deb', 'rpm', 'bin',
  // Databases
  'db', 'sqlite', 'sqlite3', 'mdb', 'idx',
  // Office documents
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Design files
  'psd', 'ai', 'eps', 'sketch', 'fig', 'xd',
  // 3D files
  'blend', 'obj', '3ds', 'max',
  // Compiled code
  'class', 'jar', 'war', 'pyc', 'pyo', 'rlib',
  // Other binaries
  'swf', 'fla', 'dat', 'idx'
]);

// In validateInput:
if (BINARY_EXTENSIONS.has(ext)) {
  return {
    result: false,
    message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
    errorCode: 4
  };
}
```

### 2. Device File Check

```typescript
const DEVICE_FILES = new Set([
  '/dev/zero', '/dev/random', '/dev/urandom',
  '/dev/full', '/dev/stdin', '/dev/tty',
  '/dev/console', '/dev/stdout', '/dev/stderr',
  '/dev/fd/0', '/dev/fd/1', '/dev/fd/2'
]);

function isDeviceFile(filePath: string): boolean {
  return DEVICE_FILES.has(filePath) || 
         filePath.startsWith('/dev/') ||
         filePath.startsWith('\\\\.\\'); // Windows device paths
}

// In validateInput:
if (isDeviceFile(filePath)) {
  return {
    result: false,
    message: `Cannot read '${filePath}': this device file would block or produce infinite output.`,
    errorCode: 9
  };
}
```

### 3. PDF Support

```typescript
import pdfParse from 'pdf-parse';

async function parsePdf(filePath: string): Promise<{
  text: string;
  numpages: number;
  info: any;
  metadata: any;
  version: string;
}> {
  const pdfBuffer = await fs.promises.readFile(filePath);
  return await pdfParse(pdfBuffer);
}

// For page extraction (optional, requires poppler-utils)
async function extractPdfPages(
  filePath: string, 
  range: { firstPage: number; lastPage: number }
): Promise<{
  images: string[]; // base64 encoded
  count: number;
  outputDir: string;
}> {
  const { exec } = await import('child_process');
  const os = await import('os');
  const path = await import('path');
  
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'pdf-pages-')
  );
  
  return new Promise((resolve, reject) => {
    const pdftoppmCmd = `pdftoppm -jpeg -f ${range.firstPage} -l ${range.lastPage} "${filePath}" "${tempDir}/page"`;
    
    exec(pdftoppmCmd, async (error) => {
      if (error) {
        reject(new Error(`PDF extraction failed: ${error.message}`));
        return;
      }
      
      // Read generated images
      const files = await fs.promises.readdir(tempDir);
      const images = await Promise.all(
        files.map(f => fs.promises.readFile(path.join(tempDir, f)).then(b => b.toString('base64')))
      );
      
      resolve({ images, count: images.length, outputDir: tempDir });
    });
  });
}
```

### 4. Symlink Resolution

```typescript
async function resolveSymlinks(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(filePath);
  } catch {
    return null;
  }
}

// In call method, on ENOENT error:
if (error.code === 'ENOENT') {
  const resolved = await resolveSymlinks(filePath);
  if (resolved && resolved !== filePath) {
    // Retry with resolved path
    return call({ ...args, file_path: resolved });
  }
  throw error;
}
```

### 5. Typo Suggestions

```typescript
import fuzzysort from 'fuzzysort';

async function findSimilarFiles(filePath: string, cwd: string): Promise<string | null> {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);
  
  try {
    const files = await fs.promises.readdir(dir);
    const results = fuzzysort.go(basename, files, {
      threshold: -10000,
      limit: 1
    });
    
    if (results.length > 0 && results[0].score > -5000) {
      return path.join(dir, results[0].target);
    }
  } catch {
    return null;
  }
  
  return null;
}

// In error handling:
const similar = await findSimilarFiles(filePath, process.cwd());
if (similar) {
  message += ` Did you mean ${similar}?`;
}
```

### 6. Image Resizing

```typescript
import sharp from 'sharp';

async function resizeImage(
  buffer: Buffer,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  }
): Promise<Buffer> {
  let pipeline = sharp(buffer);
  
  // Get metadata
  const metadata = await pipeline.metadata();
  
  // Calculate new dimensions
  let width = metadata.width || 0;
  let height = metadata.height || 0;
  
  if (options.maxWidth && width > options.maxWidth) {
    height = Math.round(height * (options.maxWidth / width));
    width = options.maxWidth;
  }
  
  if (options.maxHeight && height > options.maxHeight) {
    width = Math.round(width * (options.maxHeight / height));
    height = options.maxHeight;
  }
  
  // Resize
  pipeline = pipeline.resize(width, height, {
    fit: 'inside',
    withoutEnlargement: true
  });
  
  // Convert format if specified
  if (options.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: options.quality || 80 });
  } else if (options.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 6 });
  } else if (options.format === 'webp') {
    pipeline = pipeline.webp({ quality: options.quality || 80 });
  }
  
  return await pipeline.toBuffer();
}
```

---

## 🧪 TESTING PLAN

### Unit Tests (`read.test.ts`)

```typescript
describe('Read Tool', () => {
  describe('Binary Detection', () => {
    test('should reject mp3 file', async () => {
      const result = await validateInput({ file_path: '/test.mp3' });
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
    });
    
    test('should accept text file', async () => {
      const result = await validateInput({ file_path: '/test.txt' });
      expect(result.result).toBe(true);
    });
  });
  
  describe('Device File Check', () => {
    test('should reject /dev/zero', async () => {
      const result = await validateInput({ file_path: '/dev/zero' });
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
    });
  });
  
  describe('PDF Support', () => {
    test('should parse PDF text', async () => {
      const result = await call({ file_path: '/test.pdf' });
      expect(result.type).toBe('pdf');
    });
    
    test('should extract PDF pages', async () => {
      const result = await call({ 
        file_path: '/test.pdf', 
        pages: '1-3' 
      });
      expect(result.type).toBe('parts');
      expect(result.file.count).toBe(3);
    });
  });
  
  describe('Symlink Resolution', () => {
    test('should resolve symlinks', async () => {
      // Create symlink
      // Test resolution
    });
  });
  
  describe('Typo Suggestions', () => {
    test('should suggest similar file', async () => {
      // Create test files
      // Test with typo
    });
  });
});
```

### Integration Tests

```bash
# Test binary detection
pi -p "Read /path/to/file.mp3"

# Test device file
pi -p "Read /dev/zero"

# Test PDF
pi -p "Read /path/to/document.pdf"
pi -p "Read /path/to/document.pdf pages 1-5"

# Test symlink
ln -s /actual/file.txt /path/to/link.txt
pi -p "Read /path/to/link.txt"

# Test typo suggestion
pi -p "Read /path/to/fiel.txt"  # Should suggest file.txt
```

---

## 📊 SUCCESS CRITERIA

| Feature | Test | Pass Criteria |
|---------|------|---------------|
| Binary Detection | Try reading .mp3, .exe, .zip | Rejected with errorCode 4 |
| Device File | Try reading /dev/zero | Rejected with errorCode 9 |
| PDF Text | Read PDF without pages | Returns text content |
| PDF Pages | Read PDF with pages="1-5" | Returns 5 page images |
| Symlink | Read symlinked file | Resolves and reads content |
| Typo | Read non-existent file | Suggests similar file |
| Image Resize | Read large image | Returns resized version |

---

## 🚀 ROLLOUT PLAN

1. **Day 1:** Implement binary detection + device file check
2. **Day 2:** Implement PDF support
3. **Day 3:** Implement symlink + typo suggestions
4. **Day 4:** Implement image resizing
5. **Day 5:** Write unit tests
6. **Day 6:** Write integration tests
7. **Day 7:** Bug fixes + documentation

---

## 📝 NOTES

- All changes must be backward compatible
- Error messages must be clear and actionable
- Performance impact should be minimal
- New dependencies must be audited for security

---

**Status:** Ready for implementation
