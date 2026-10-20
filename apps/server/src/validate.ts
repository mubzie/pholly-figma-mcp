/**
 * Minimal JSON Schema check for tool arguments. The MCP server used to pass
 * whatever a client sent straight to the plugin, so `required` and `enum` in
 * `tools.ts` were advisory. This enforces the parts of the schema the tools
 * already declare. Unknown fields are allowed; adding a field was never a
 * breaking change, and removing one never was either.
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function typeList(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return schema.type;
  return schema.type ? [schema.type] : [];
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

function validateValue(value: unknown, schema: JsonSchema, path: string): string | null {
  const types = typeList(schema);
  if (types.length && value !== undefined && !types.some(type => matchesType(value, type))) {
    return `${path} must be ${types.join(' or ')}`;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return `${path} must be one of: ${schema.enum.map(item => JSON.stringify(item)).join(', ')}`;
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} must be at least ${schema.minimum}`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} must be at most ${schema.maximum}`;
  }
  if (isObject(value) && schema.properties) {
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties[key];
      if (!childSchema) continue;
      const problem = validateValue(child, childSchema, `${path}.${key}`);
      if (problem) return problem;
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index++) {
      const problem = validateValue(value[index], schema.items, `${path}[${index}]`);
      if (problem) return problem;
    }
  }
  return null;
}

export function validateToolArguments(schema: JsonSchema | undefined, args: unknown): string | null {
  if (!schema) return null;
  if (!isObject(args)) return 'arguments must be an object';
  for (const key of schema.required ?? []) {
    if (args[key] === undefined) return `missing required field: ${key}`;
  }
  return validateValue(args, schema, 'arguments');
}
