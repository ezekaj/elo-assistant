/**
 * LSP (Language Server Protocol) Types
 * 
 * Core types for LSP integration based on LSP 3.17 specification.
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/
 */

// ============================================================================
// POSITION & RANGE
// ============================================================================

export interface Position {
  /** Line position in a document (zero-based) */
  line: number;
  /** Character offset on a line in a document (zero-based) */
  character: number;
}

export interface Range {
  /** The range's start position */
  start: Position;
  /** The range's end position */
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface LocationLink {
  originSelectionRange?: Range;
  targetUri: string;
  targetRange: Range;
  targetSelectionRange: Range;
}

// ============================================================================
// TEXT DOCUMENT
// ============================================================================

export interface TextDocumentIdentifier {
  uri: string;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface TextDocumentChangeEvent {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: Array<{ text: string } | TextDocumentContentChangeEvent>;
}

export interface TextDocumentContentChangeEvent {
  range: Range;
  rangeLength?: number;
  text: string;
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export type DiagnosticSeverity = 1 | 2 | 3 | 4; // Error | Warning | Information | Hint

export type DiagnosticTag = 1 | 2; // Unnecessary | Deprecated

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: { href: string };
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedRelatedInformation[];
  data?: unknown;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

// ============================================================================
// HOVER & COMPLETION
// ============================================================================

export interface Hover {
  contents: MarkedString | MarkupContent | Array<MarkedString>;
  range?: Range;
}

export type MarkedString = string | { language: string; value: string };

export interface MarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

export interface CompletionItem {
  label: string;
  labelDetails?: { detail?: string; description?: string };
  kind?: CompletionItemKind;
  tags?: CompletionItemTag[];
  detail?: string;
  documentation?: string | MarkupContent;
  deprecated?: boolean;
  preselect?: boolean;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
  data?: unknown;
}

export type CompletionItemKind = 1 | 2 | 3 | /* ... */ 25;
export type CompletionItemTag = 1; // Deprecated
export type InsertTextFormat = 1 | 2; // PlainText | Snippet

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

// ============================================================================
// SYMBOLS
// ============================================================================

export type SymbolKind = 1 | 2 | 3 | /* ... */ 26;

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export type SymbolTag = 1; // Deprecated

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  location: Location;
  containerName?: string;
}

// ============================================================================
// REFERENCES & DEFINITION
// ============================================================================

export interface ReferenceContext {
  includeDeclaration: boolean;
}

export interface ReferenceParams extends TextDocumentPositionParams {
  context: ReferenceContext;
}

export type Definition = Location | Location[] | LocationLink[];

export type Declaration = Location | Location[] | LocationLink[];

export type Implementation = Location | Location[] | LocationLink[];

// ============================================================================
// CALL HIERARCHY
// ============================================================================

export interface CallHierarchyItem {
  name: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  detail?: string;
  uri: string;
  range: Range;
  selectionRange: Range;
  data?: unknown;
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem;
  fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem;
  fromRanges: Range[];
}

// ============================================================================
// WORKSPACE
// ============================================================================

export interface WorkspaceFolder {
  uri: string;
  name: string;
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
  documentChanges?: Array<TextDocumentEdit | CreateFile | RenameFile | DeleteFile>;
}

export interface TextDocumentEdit {
  textDocument: VersionedTextDocumentIdentifier;
  edits: Array<TextEdit>;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface CreateFile {
  kind: "create";
  uri: string;
  options?: CreateFileOptions;
}

export interface CreateFileOptions {
  overwrite?: boolean;
  ignoreIfExists?: boolean;
}

export interface RenameFile {
  kind: "rename";
  oldUri: string;
  newUri: string;
  options?: RenameFileOptions;
}

export interface RenameFileOptions {
  overwrite?: boolean;
  ignoreIfExists?: boolean;
}

export interface DeleteFile {
  kind: "delete";
  uri: string;
  options?: DeleteFileOptions;
}

export interface DeleteFileOptions {
  recursive?: boolean;
  ignoreIfNotExists?: boolean;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export interface ClientCapabilities {
  textDocument?: TextDocumentClientCapabilities;
  workspace?: WorkspaceClientCapabilities;
  window?: WindowClientCapabilities;
  general?: GeneralClientCapabilities;
}

export interface TextDocumentClientCapabilities {
  completion?: { dynamicRegistration?: boolean };
  hover?: { dynamicRegistration?: boolean; contentFormat?: MarkupKind[] };
  definition?: { dynamicRegistration?: boolean };
  references?: { dynamicRegistration?: boolean };
  documentSymbol?: { dynamicRegistration?: boolean };
  publishDiagnostics?: {
    relatedInformation?: boolean;
    tagSupport?: { valueSet: DiagnosticTag[] };
    versionSupport?: boolean;
  };
}

export interface WorkspaceClientCapabilities {
  workspaceFolders?: boolean;
  configuration?: boolean;
  symbol?: { dynamicRegistration?: boolean };
}

export interface WindowClientCapabilities {
  workDoneProgress?: boolean;
  showMessage?: { messageActionItem?: { additionalPropertiesSupport: boolean } };
}

export interface GeneralClientCapabilities {
  staleRequestSupport?: {
    cancel: boolean;
    retryOnContentModified: string[];
  };
}

export type MarkupKind = "plaintext" | "markdown";

export interface InitializeParams {
  processId: number | null;
  clientInfo?: { name: string; version?: string };
  locale?: string;
  rootPath?: string | null;
  rootUri?: string | null;
  capabilities: ClientCapabilities;
  initializationOptions?: unknown;
  trace?: "off" | "messages" | "verbose";
  workspaceFolders?: WorkspaceFolder[] | null;
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: { name: string; version?: string };
}

export interface ServerCapabilities {
  textDocumentSync?: TextDocumentSyncKind | TextDocumentSyncOptions;
  completionProvider?: CompletionOptions;
  hoverProvider?: boolean | { workDoneProgress?: boolean };
  definitionProvider?: boolean | { workDoneProgress?: boolean };
  referencesProvider?: boolean | { workDoneProgress?: boolean };
  documentSymbolProvider?: boolean | { workDoneProgress?: boolean };
  workspaceSymbolProvider?: boolean | { workDoneProgress?: boolean };
  implementationProvider?: boolean | { workDoneProgress?: boolean };
  callHierarchyProvider?: boolean | CallHierarchyOptions;
  executeCommandProvider?: ExecuteCommandOptions;
  diagnosticProvider?: DiagnosticOptions;
}

export type TextDocumentSyncKind = 0 | 1 | 2; // None | Full | Incremental

export interface TextDocumentSyncOptions {
  openClose?: boolean;
  change?: TextDocumentSyncKind;
  willSave?: boolean;
  willSaveWaitUntil?: boolean;
  save?: boolean | SaveOptions;
}

export interface SaveOptions {
  includeText?: boolean;
}

export interface CompletionOptions {
  resolveProvider?: boolean;
  triggerCharacters?: string[];
  allCommitCharacters?: string[];
  workDoneProgress?: boolean;
}

export interface CallHierarchyOptions {
  workDoneProgress?: boolean;
}

export interface ExecuteCommandOptions {
  commands: string[];
  workDoneProgress?: boolean;
}

export interface DiagnosticOptions {
  identifier?: string;
  interFileDependencies: boolean;
  workspaceDiagnostics: boolean;
  workDoneProgress?: boolean;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface DidSaveTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  text?: string;
}

export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

export interface ConfigurationParams {
  items: ConfigurationItem[];
}

export interface ConfigurationItem {
  scopeUri?: string;
  section?: string;
}
