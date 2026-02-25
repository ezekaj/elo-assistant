/**
 * JSON Schema Validator for OpenClaw
 * Matches Claude Code's bUT class implementation (lines 27348-27367)
 */

import AjvModule, { type ValidateFunction, type ErrorObject, type Options } from "ajv";

// Ajv uses default export in ESM
const Ajv = (AjvModule as any).default || AjvModule;

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  data?: unknown;
  errorMessage?: string;
  errors?: ErrorObject[];
}

export type ValidatorFunction = (data: unknown) => ValidationResult;

export interface JsonSchemaValidatorOptions {
  strict?: boolean;
  validateFormats?: boolean;
  validateSchema?: boolean;
  allErrors?: boolean;
}

// ============================================================================
// AJV CONFIGURATION (matching Claude Code's fFD function - line 27339)
// ============================================================================

const DEFAULT_OPTIONS: Options = {
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
};

/**
 * Create Ajv validator instance with default configuration
 * Matches Claude Code's fFD() function (line 27339)
 */
function createAjvInstance(): any {
  const ajv = new Ajv(DEFAULT_OPTIONS);

  // Add any additional plugins/formats here if needed
  // This matches Claude Code's QA9.default(T) call

  return ajv;
}

// ============================================================================
// JSON SCHEMA VALIDATOR CLASS (matching Claude Code's bUT class)
// ============================================================================

/**
 * JSON Schema Validator
 * Matches Claude Code's bUT class (lines 27348-27367)
 */
export class JsonSchemaValidator {
  private ajv: any;
  private schemaCache: Map<string, ValidateFunction>;

  constructor(ajv?: any) {
    this.ajv = ajv ?? createAjvInstance();
    this.schemaCache = new Map();
  }

  /**
   * Get or compile a validator for the given schema
   * Matches Claude Code's getValidator() method (lines 27352-27366)
   *
   * @param schema - JSON Schema or TypeBox schema to compile
   * @returns Validator function that returns ValidationResult
   */
  getValidator(schema: any): ValidatorFunction {
    // Convert TypeBox schema to JSON Schema if needed
    const jsonSchema = this.toJsonSchema(schema);

    // Check cache first
    const schemaId = (jsonSchema as any).$id;
    if (schemaId && typeof schemaId === "string") {
      const cached = this.ajv.getSchema(schemaId);
      if (cached) {
        return this.createValidatorWrapper(cached);
      }
    }

    // Compile new validator
    const validate = this.ajv.compile(jsonSchema);

    // Cache if schema has $id
    if (schemaId && typeof schemaId === "string") {
      this.schemaCache.set(schemaId, validate);
    }

    return this.createValidatorWrapper(validate);
  }

  /**
   * Create wrapper function that matches Claude Code's return format
   */
  private createValidatorWrapper(validate: ValidateFunction): ValidatorFunction {
    return (data: unknown): ValidationResult => {
      const valid = validate(data);

      if (valid) {
        return {
          valid: true,
          data: data,
          errorMessage: undefined,
          errors: undefined,
        };
      } else {
        return {
          valid: false,
          data: undefined,
          errorMessage: this.ajv.errorsText(validate.errors),
          errors: validate.errors || [],
        };
      }
    };
  }

  /**
   * Convert TypeBox schema to JSON Schema
   */
  private toJsonSchema(schema: any): object {
    // If it's already a plain object, assume it's JSON Schema
    if (schema && typeof schema === "object" && !("kind" in schema)) {
      return schema;
    }

    // For TypeBox schemas, return as-is (Ajv can handle them)
    return schema as object;
  }

  /**
   * Validate data against schema (convenience method)
   */
  validate(schema: any, data: unknown): ValidationResult {
    const validator = this.getValidator(schema);
    return validator(data);
  }

  /**
   * Clear schema cache
   */
  clearCache(): void {
    this.schemaCache.clear();
  }
}

// ============================================================================
// GLOBAL VALIDATOR INSTANCE
// ============================================================================

/**
 * Global JSON Schema Validator instance
 * Matches Claude Code's R?.jsonSchemaValidator ?? new bUT pattern
 */
let globalValidator: JsonSchemaValidator | null = null;

export function getGlobalValidator(): JsonSchemaValidator {
  if (!globalValidator) {
    globalValidator = new JsonSchemaValidator();
  }
  return globalValidator;
}

export function setGlobalValidator(validator: JsonSchemaValidator): void {
  globalValidator = validator;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate structured content against schema
 * Matches Claude Code's validation pattern (lines 209507-209512)
 */
export function validateStructuredContent(
  schema: any,
  content: unknown,
  toolName: string,
): { valid: true } | { valid: false; error: Error } {
  const validator = getGlobalValidator().getValidator(schema);
  const result = validator(content);

  if (!result.valid) {
    return {
      valid: false,
      error: new Error(`Tool ${toolName} output does not match schema: ${result.errorMessage}`),
    };
  }

  return { valid: true };
}
