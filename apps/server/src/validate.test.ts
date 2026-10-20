import test from 'node:test';
import assert from 'node:assert/strict';
import { validateToolArguments, type JsonSchema } from './validate.js';

const schema: JsonSchema = {
  type: 'object',
  properties: {
    nodeId: { type: 'string' },
    mode: { type: 'string', enum: ['append', 'reconcile'] },
    depth: { type: 'number', minimum: 0, maximum: 12 },
    nodeIds: { type: 'array', items: { type: 'string' } }
  },
  required: ['nodeId']
};

test('accepts a valid argument object and unknown fields', () => {
  assert.equal(validateToolArguments(schema, { nodeId: '1:2', mode: 'append', extra: true }), null);
  assert.equal(validateToolArguments(schema, { nodeId: '1:2', nodeIds: ['1:2'] }), null);
});

test('rejects missing required fields, wrong types, enums, and bounds', () => {
  assert.match(String(validateToolArguments(schema, {})), /missing required field: nodeId/);
  assert.match(String(validateToolArguments(schema, { nodeId: 4 })), /arguments\.nodeId must be string/);
  assert.match(String(validateToolArguments(schema, { nodeId: '1:2', mode: 'appendd' })), /must be one of/);
  assert.match(String(validateToolArguments(schema, { nodeId: '1:2', depth: 13 })), /at most 12/);
  assert.match(String(validateToolArguments(schema, { nodeId: '1:2', nodeIds: ['a', 4] })), /arguments\.nodeIds\[1\] must be string/);
  assert.match(String(validateToolArguments(schema, null)), /arguments must be an object/);
});
