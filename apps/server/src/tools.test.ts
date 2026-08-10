import test from 'node:test';
import assert from 'node:assert/strict';
import { tools } from './tools.js';

const byName = (name: string) => tools.find(t => t.name === name);
const required = (name: string) => (byName(name)?.inputSchema as {required?: string[]}).required ?? [];

test('toolset includes the editing parity tools', () => {
  for (const name of ['set_gradient_fill', 'set_effects', 'set_stroke_properties', 'set_node_visibility', 'save_screenshots']) {
    assert.ok(byName(name), `${name} is defined`);
  }
});

test('toolset includes the search and session tools', () => {
  for (const name of ['find_nodes', 'find_text', 'get_path', 'undo', 'redo', 'get_changes', 'clear_changes', 'extract_design_tokens']) {
    assert.ok(byName(name), `${name} is defined`);
  }
});

test('set_gradient_fill requires nodeId and gradientStops', () => {
  const schema = byName('set_gradient_fill')!.inputSchema as {properties: Record<string, {enum?: string[]}>};
  assert.deepEqual(required('set_gradient_fill').sort(), ['gradientStops', 'nodeId']);
  assert.deepEqual(schema.properties.gradientType?.enum, ['LINEAR', 'RADIAL', 'ANGULAR', 'DIAMOND']);
  assert.deepEqual(schema.properties.target?.enum, ['fill', 'stroke']);
});

test('set_effects requires nodeId and effects', () => {
  const schema = byName('set_effects')!.inputSchema as {properties: Record<string, {enum?: string[]; items?: {properties: {type: {enum: string[]}}}; properties?: Record<string, {enum?: string[]}>}>};
  assert.deepEqual(required('set_effects').sort(), ['effects', 'nodeId']);
  assert.deepEqual(schema.properties.effects.items?.properties.type.enum, ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR']);
});

test('set_stroke_properties requires nodeId and validates enums', () => {
  const schema = byName('set_stroke_properties')!.inputSchema as {properties: Record<string, {enum?: string[]}>};
  assert.deepEqual(required('set_stroke_properties'), ['nodeId']);
  assert.deepEqual(schema.properties.strokeAlign?.enum, ['INSIDE', 'OUTSIDE', 'CENTER']);
  assert.deepEqual(schema.properties.strokeCap?.enum, ['NONE', 'ROUND', 'SQUARE', 'ARROW_LINES', 'ARROW_EQUILATERAL']);
  assert.deepEqual(schema.properties.strokeJoin?.enum, ['MITER', 'BEVEL', 'ROUND']);
});

test('search tools require a query', () => {
  assert.deepEqual(required('find_nodes').sort(), ['query']);
  assert.deepEqual(required('find_text').sort(), ['query']);
});

test('save_screenshots requires nodeIds and bounds its scale', () => {
  assert.deepEqual(required('save_screenshots').sort(), ['nodeIds']);
  const scale = (byName('save_screenshots')!.inputSchema as {properties: Record<string, {minimum?: number; maximum?: number}>}).properties.scale;
  assert.equal(scale.minimum, 0.1);
  assert.equal(scale.maximum, 4);
});
