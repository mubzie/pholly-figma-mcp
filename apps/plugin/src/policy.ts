export const MUTATING_METHODS = new Set([
  'set_node_properties', 'set_text_content', 'set_text_properties', 'set_solid_fill',
  'set_gradient_fill', 'set_effects', 'set_stroke_properties', 'set_node_visibility',
  'set_auto_layout', 'create_frame', 'create_text', 'create_shape', 'create_image',
  'create_component', 'create_instance', 'set_instance_properties', 'swap_instance_component',
  'detach_instance', 'duplicate_nodes', 'reparent_nodes', 'group_nodes', 'ungroup_node',
  'render_design', 'delete_nodes', 'create_variable_collection', 'create_variable',
  'set_variable_values', 'bind_variable', 'batch'
]);

const NESTED_QUANTIFIER = /(\([^)]*[+*][^)]*\))[+*{?]/;

export function isMutating(method: string): boolean {
  return MUTATING_METHODS.has(method);
}

export function shouldCommit(method: string, params: { commitUndo?: unknown } | undefined): boolean {
  if (!isMutating(method)) return false;
  if (method === 'render_design' && params?.commitUndo === false) return false;
  return true;
}

export function assertConfirm(value: unknown): void {
  if (value !== true) throw new Error('Deletion requires confirm=true');
}

export function clampDepth(value: unknown, fallback = 6): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(0, Math.min(12, parsed));
}

export function compileSearch(query: string): RegExp | null {
  const trimmed = query.trim();
  if (!(trimmed.length >= 2 && trimmed.startsWith('/') && trimmed.endsWith('/'))) return null;
  const source = trimmed.slice(1, -1);
  if (source.length > 80) throw new Error('Search pattern exceeds 80 characters');
  if (NESTED_QUANTIFIER.test(source)) throw new Error('Search pattern is too expensive');
  try {
    return new RegExp(source, 'i');
  } catch {
    throw new Error('Search pattern is not a valid regular expression');
  }
}

export function matchesQuery(value: string, query: string): boolean {
  const pattern = compileSearch(query);
  if (!pattern) return value.toLowerCase().includes(query.trim().toLowerCase());
  return pattern.test(value);
}

export function paintTarget(target: unknown): 'fills' | 'strokes' {
  if (target === 'stroke' || target === 'strokes') return 'strokes';
  return 'fills';
}

export const RENDER_TYPES = new Set(['FRAME', 'TEXT', 'RECTANGLE', 'ELLIPSE', 'LINE']);

export function textCharacters(spec: { content?: unknown; characters?: unknown; text?: unknown } | null | undefined): string | undefined {
  if (!spec) return undefined;
  if (typeof spec.content === 'string') return spec.content;
  if (typeof spec.characters === 'string') return spec.characters;
  if (typeof spec.text === 'string') return spec.text;
  if (spec.text && typeof spec.text === 'object' && typeof (spec.text as { characters?: unknown }).characters === 'string') {
    return (spec.text as { characters: string }).characters;
  }
  return undefined;
}
