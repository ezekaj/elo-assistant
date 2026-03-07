# Keybinding System Implementation

## Overview

This implementation adds a complete, customizable keybinding system to OpenClaw's TUI.

## Files Created

```
src/tui/keybinds/
├── types.ts           (280 lines)  - Type definitions
├── defaults.ts        (380 lines)  - Default profiles (default, vim, emacs)
├── manager.ts         (400 lines)  - KeybindingManager class
├── config.ts          (250 lines)  - Config loading/saving
├── commands.ts        (330 lines)  - TUI /keybind commands
├── integration.ts     (190 lines)  - Integration helpers
├── index.ts           (40 lines)   - Public exports
└── manager.test.ts    (270 lines)  - Tests
```

**Total: ~2,140 lines**

## Architecture

### 1. Types (`types.ts`)

- `KeyAction` - 50+ predefined actions (submit, abort, history-up, etc.)
- `KeyBinding` - Single binding (key + modifiers + action)
- `KeybindProfile` - Named collection of bindings
- `KeybindConfig` - User configuration
- Helper functions: `parseBinding`, `formatBinding`, `bindingKey`

### 2. Profiles (`defaults.ts`)

Three built-in profiles:

| Profile   | Description                              |
| --------- | ---------------------------------------- |
| `default` | Standard bindings (Ctrl+C, arrows, etc.) |
| `vim`     | Vim-style navigation + standard bindings |
| `emacs`   | Emacs-style (Ctrl+A/E/F/B, Alt+M, etc.)  |

### 3. Manager (`manager.ts`)

```typescript
const manager = getKeybindManager();

// Check if input matches an action
if (manager.matches(data, "abort")) {
  handleAbort();
}

// Register handler
manager.on("submit", (event) => {
  handleSubmit();
  return true;
});

// Switch profile
manager.loadProfile("emacs");

// Custom binding
manager.register({
  key: "enter",
  modifiers: ["ctrl"],
  action: "submit",
  description: "Send message",
});
```

### 4. Config (`config.ts`)

User config stored in `~/.openclaw/keybindings.json`:

```json
{
  "activeProfile": "emacs",
  "customBindings": [
    {
      "key": "enter",
      "modifiers": ["ctrl"],
      "action": "submit",
      "description": "Send message"
    }
  ],
  "disabledActions": ["history-up"]
}
```

### 5. Commands (`commands.ts`)

```
/keybind                  Show all bindings
/keybind profile emacs    Switch to emacs profile
/keybind set ctrl+enter submit   Bind key
/keybind unset ctrl+d     Remove binding
/keybind search history   Search bindings
/keybind save             Save to config
```

## Integration Steps

### Step 1: Initialize on TUI startup

```typescript
// In tui.ts
import { initializeKeybinds } from "./keybinds";

// During init
await initializeKeybinds();
```

### Step 2: Update CustomEditor

```typescript
// In custom-editor.ts
import { getKeybindManager } from './keybinds';

const keybindManager = getKeybindManager();

handleInput(data: string): void {
  // Replace hardcoded checks
  if (keybindManager.matches(data, 'abort') && this.onCtrlC) {
    this.onCtrlC();
    return;
  }

  if (keybindManager.matches(data, 'submit-alt') && this.onAltEnter) {
    this.onAltEnter();
    return;
  }

  // ... etc
}
```

### Step 3: Update context

```typescript
// When input focused
keybindManager.setContext("input");

// When autocomplete open
keybindManager.setContext("autocomplete");

// When output focused
keybindManager.setContext("output");
```

### Step 4: Register commands

```typescript
// In commands.ts
import { getKeybindCommands } from "./keybinds/commands.js";

// Add to command list
commands.push(getKeybindCommands());
```

## Usage Examples

### Switch to Emacs-style editing

```
/keybind profile emacs
/keybind save
```

### Use Ctrl+Enter to send (Enter for newline)

```
/keybind set enter submit-alt
/keybind set ctrl+enter submit
/keybind save
```

### Disable arrow key history (use Ctrl+P/N instead)

```
/keybind set up scroll-up
/keybind set down scroll-down
/keybind save
```

### Quick setups in config

```json
{
  "keybindings": {
    "profile": "emacs"
  }
}
```

## Key Actions Available

| Category     | Actions                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| Input        | submit, submit-alt, abort, clear, delete-line                                       |
| History      | history-up, history-down, history-search                                            |
| Cursor       | cursor-left, cursor-right, cursor-start, cursor-end, word-back, word-forward        |
| Editing      | delete-word, delete-to-end, delete-to-start, transpose, yank                        |
| Autocomplete | autocomplete, autocomplete-next, autocomplete-prev, autocomplete-cancel             |
| Sessions     | new-session, switch-session, close-session                                          |
| Navigation   | focus-input, focus-output, scroll-up, scroll-down, scroll-top, scroll-bottom        |
| Tools        | toggle-verbose, toggle-reasoning, toggle-vim, show-status, show-help, show-commands |

## Testing

```bash
cd openclaw
npm test -- keybinds
```

## Future Enhancements

1. **Key sequences** - Support multi-key sequences like `gg`, `dd`
2. **Leader keys** - Prefix key for custom commands
3. **Mode-specific bindings** - Different bindings per mode
4. **Import/export** - Share keybinding configs
5. **Interactive rebinding** - `/keybind record` to capture keys
