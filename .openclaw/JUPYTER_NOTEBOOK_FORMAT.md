# 📓 JUPYTER NOTEBOOK FILE FORMAT - RESEARCH REPORT

**Date:** 2026-02-24
**File Extension:** `.ipynb` (Interactive Python Notebook)

---

## 📊 EXECUTIVE SUMMARY

Jupyter notebooks are **JSON files** with a `.ipynb` extension. They contain cells with code, markdown, outputs, and metadata.

**Key Finding:** You don't need 100% compliance - just the basic structure!

---

## 📁 FILE STRUCTURE

### **Basic JSON Structure:**

```json
{
  "cells": [
    {
      "cell_type": "markdown",
      "id": "unique-id",
      "metadata": {},
      "source": ["# Heading\n", "Some text"]
    },
    {
      "cell_type": "code",
      "execution_count": 1,
      "id": "unique-id",
      "metadata": {},
      "source": ["print('Hello')"],
      "outputs": [...]
    }
  ],
  "metadata": {},
  "nbformat": 4,
  "nbformat_minor": 5
}
```

---

## 🔍 DETAILED BREAKDOWN

### **1. Root Level Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cells` | Array | ✅ Yes | Array of cell objects |
| `metadata` | Object | ✅ Yes | Notebook metadata |
| `nbformat` | Integer | ✅ Yes | Major version (4) |
| `nbformat_minor` | Integer | ✅ Yes | Minor version (5) |

### **2. Cell Types:**

#### **Markdown Cell:**
```json
{
  "cell_type": "markdown",
  "id": "3f964709",
  "metadata": {},
  "source": [
    "# Heading",
    "Some **bold** text"
  ]
}
```

#### **Code Cell:**
```json
{
  "cell_type": "code",
  "execution_count": 1,
  "id": "0e068977",
  "metadata": {
    "collapsed": false
  },
  "source": [
    "import mlx.core as mx",
    "a = mx.array([1, 2, 3])",
    "print(a)"
  ],
  "outputs": [
    {
      "name": "stdout",
      "output_type": "stream",
      "text": ["array([1, 2, 3])\n"]
    }
  ]
}
```

#### **Output Types:**

**Stream Output:**
```json
{
  "name": "stdout",
  "output_type": "stream",
  "text": ["Hello World\n"]
}
```

**Execute Result:**
```json
{
  "data": {
    "text/plain": ["array([1, 2, 3])"]
  },
  "execution_count": 1,
  "output_type": "execute_result"
}
```

**Error Output:**
```json
{
  "ename": "NameError",
  "evalue": "name 'x' is not defined",
  "output_type": "error",
  "traceback": [
    "\u001b[0;31mNameError\u001b[0m: name 'x' is not defined"
  ]
}
```

---

## 🎯 MINIMAL NOTEBOOK (Works!)

You don't need 100% of the fields. Here's a **minimal working notebook**:

```json
{
  "cells": [
    {
      "cell_type": "code",
      "execution_count": null,
      "metadata": {},
      "source": ["print('Hello World')"],
      "outputs": []
    }
  ],
  "metadata": {
    "kernelspec": {
      "display_name": "Python 3",
      "language": "python",
      "name": "python3"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 5
}
```

**Save as:** `test.ipynb`

**Open with:** Jupyter Notebook, JupyterLab, VS Code, Google Colab

---

## 📋 FIELD REQUIREMENTS

### **Required Fields (Must Have):**

| Location | Field | Type | Example |
|----------|-------|------|---------|
| Root | `nbformat` | Integer | `4` |
| Root | `nbformat_minor` | Integer | `5` |
| Root | `cells` | Array | `[...]` |
| Root | `metadata` | Object | `{}` |
| Cell | `cell_type` | String | `"code"`, `"markdown"` |
| Cell | `source` | Array/String | `["print('hi')"]` |

### **Optional Fields (Can Skip):**

| Location | Field | Default |
|----------|-------|---------|
| Cell | `id` | Auto-generated |
| Cell | `execution_count` | `null` |
| Cell | `metadata` | `{}` |
| Cell | `outputs` | `[]` (for code cells) |

---

## 🔧 CREATING NOTEBOOKS

### **Method 1: Manual JSON**

```python
import json

notebook = {
    "cells": [
        {
            "cell_type": "code",
            "execution_count": None,
            "metadata": {},
            "source": ["print('Hello')"],
            "outputs": []
        }
    ],
    "metadata": {},
    "nbformat": 4,
    "nbformat_minor": 5
}

with open('test.ipynb', 'w') as f:
    json.dump(notebook, f, indent=2)
```

### **Method 2: Using nbformat Library**

```python
import nbformat

# Create new notebook
nb = nbformat.v4.new_notebook()

# Add code cell
code_cell = nbformat.v4.new_code_cell("print('Hello')")
nb.cells.append(code_cell)

# Add markdown cell
md_cell = nbformat.v4.new_markdown_cell("# Heading")
nb.cells.append(md_cell)

# Write to file
with open('test.ipynb', 'w') as f:
    nbformat.write(nb, f)
```

### **Method 3: Using Jupyter API**

```python
from nbformat import writes, v4

nb = v4.new_notebook()
nb.cells.append(v4.new_code_cell("x = 1"))
nb.cells.append(v4.new_code_cell("x + 1"))

notebook_json = writes(nb)
print(notebook_json)
```

---

## 📊 NOTEBOOK METADATA

### **Common Metadata Fields:**

```json
{
  "metadata": {
    "kernelspec": {
      "display_name": "Python 3",
      "language": "python",
      "name": "python3"
    },
    "language_info": {
      "name": "python",
      "version": "3.9.0"
    },
    "colab": {
      "name": "My Notebook",
      "provenance": []
    }
  }
}
```

### **Minimal Metadata:**

```json
{
  "metadata": {}
}
```

**Empty metadata works fine!**

---

## 🎨 CELL METADATA

### **Common Cell Metadata:**

```json
{
  "metadata": {
    "collapsed": false,
    "code_folding": [],
    "collapsed_ranges": [],
    "tags": ["important", "example"]
  }
}
```

### **Minimal Cell Metadata:**

```json
{
  "metadata": {}
}
```

---

## ✅ VALIDATION

### **Check if Valid:**

```python
import nbformat

try:
    nb = nbformat.read('test.ipynb', as_version=4)
    print("Valid notebook!")
except Exception as e:
    print(f"Invalid: {e}")
```

### **Validate Structure:**

```python
def is_valid_notebook(data):
    # Check required fields
    if not isinstance(data, dict):
        return False
    if 'cells' not in data:
        return False
    if 'nbformat' not in data:
        return False
    if not isinstance(data['cells'], list):
        return False
    
    # Check cells
    for cell in data['cells']:
        if 'cell_type' not in cell:
            return False
        if 'source' not in cell:
            return False
    
    return True
```

---

## 🔄 CONVERSION

### **From Python Script to Notebook:**

```python
def py_to_ipynb(py_file, ipynb_file):
    with open(py_file, 'r') as f:
        code = f.read()
    
    nb = {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "source": code.split('\n'),
                "outputs": []
            }
        ],
        "metadata": {},
        "nbformat": 4,
        "nbformat_minor": 5
    }
    
    with open(ipynb_file, 'w') as f:
        json.dump(nb, f, indent=2)
```

### **From Notebook to Python:**

```python
def ipynb_to_py(ipynb_file, py_file):
    with open(ipynb_file, 'r') as f:
        nb = json.load(f)
    
    code_lines = []
    for cell in nb['cells']:
        if cell['cell_type'] == 'code':
            source = cell['source']
            if isinstance(source, list):
                code_lines.extend(source)
            else:
                code_lines.append(source)
    
    with open(py_file, 'w') as f:
        f.write('\n'.join(code_lines))
```

---

## 📝 EXAMPLES

### **Example 1: Simple Notebook**

```json
{
  "cells": [
    {
      "cell_type": "markdown",
      "metadata": {},
      "source": ["# My Notebook\n", "This is a test."]
    },
    {
      "cell_type": "code",
      "execution_count": 1,
      "metadata": {},
      "source": ["x = 1\n", "y = 2\n", "print(x + y)"],
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": ["3\n"]
        }
      ]
    }
  ],
  "metadata": {},
  "nbformat": 4,
  "nbformat_minor": 5
}
```

### **Example 2: Empty Notebook**

```json
{
  "cells": [],
  "metadata": {},
  "nbformat": 4,
  "nbformat_minor": 5
}
```

---

## 🎯 YOU DON'T NEED 100%

### **Minimum Working Notebook:**

```json
{
  "cells": [],
  "metadata": {},
  "nbformat": 4,
  "nbformat_minor": 0
}
```

**That's it!** Just 4 fields at root level.

### **What You Can Skip:**

- ❌ Cell IDs (auto-generated)
- ❌ Execution counts (use `null`)
- ❌ Cell metadata (use `{}`)
- ❌ Outputs (use `[]`)
- ❌ Kernel spec (optional)
- ❌ Language info (optional)

### **What You Need:**

- ✅ `nbformat`: 4
- ✅ `nbformat_minor`: 0-5
- ✅ `cells`: Array (can be empty)
- ✅ `metadata`: Object (can be empty)
- ✅ Cell `cell_type`: "code" or "markdown"
- ✅ Cell `source`: Array of strings

---

## 🔍 FILE INSPECTION

### **View Notebook Structure:**

```bash
# Pretty print JSON
python -m json.tool notebook.ipynb | less

# View just cell types
python -c "import json; nb=json.load(open('notebook.ipynb')); print([c['cell_type'] for c in nb['cells']])"

# Count cells
python -c "import json; nb=json.load(open('notebook.ipynb')); print(f'Cells: {len(nb[\"cells\"])}')"
```

---

## 📊 SUMMARY

### **Jupyter Notebook File Format:**

| Aspect | Details |
|--------|---------|
| **Format** | JSON |
| **Extension** | `.ipynb` |
| **Version** | nbformat 4.x |
| **Required Fields** | 4 (cells, metadata, nbformat, nbformat_minor) |
| **Cell Types** | code, markdown, raw |
| **Minimum Size** | ~100 bytes (empty notebook) |

### **You Don't Need 100%:**

- ✅ Empty `metadata` works
- ✅ Empty `cells` array works
- ✅ `null` execution_count works
- ✅ No cell IDs works
- ✅ Empty outputs works

**Just the basics work fine!**

---

**Research Complete:** 2026-02-24
**File Format:** JSON (.ipynb)
**Complexity:** Low (4 required fields)
**Minimum Working:** ~10 lines of JSON
