import { test } from 'node:test';
import * as assert from 'node:assert/strict';

// The script is CommonJS; compiled output is CommonJS, so require works.
// Unit tests inject schemas directly (no file IO) and use the compiled module.
const { getTsType, generateTypes } = require('../scripts/sync-api-types.js');

// Helper to build the minimal OpenAPI envelope the script expects.
function makeSchema(componentsSchemas: any) {
  return { components: { schemas: componentsSchemas } };
}

test('getTsType maps primitive types', () => {
  assert.equal(getTsType({ type: 'string' }), 'string');
  assert.equal(getTsType({ type: 'boolean' }), 'boolean');
  assert.equal(getTsType({ type: 'integer' }), 'number');
  assert.equal(getTsType({ type: 'number' }), 'number');
});

test('getTsType maps $ref to last path segment', () => {
  assert.equal(getTsType({ $ref: '#/components/schemas/Role' }), 'Role');
  assert.equal(getTsType({ $ref: '#/components/schemas/MemberProfile' }), 'MemberProfile');
});

test('getTsType maps enum to quoted union', () => {
  assert.equal(getTsType({ enum: ['member', 'moderator', 'admin'] }), `'member' | 'moderator' | 'admin'`);
});

test('getTsType maps array to ItemType[]', () => {
  assert.equal(getTsType({ type: 'array', items: { type: 'string' } }), 'string[]');
  assert.equal(getTsType({ type: 'array', items: { $ref: '#/components/schemas/Role' } }), 'Role[]');
});

test('getTsType returns any for schemaless fragments', () => {
  // No type, no $ref, no enum -> defaults to any (existing behavior).
  assert.equal(getTsType({}), 'any');
});

test('getTsType throws on unsupported type rather than silently emitting any', () => {
  assert.throws(
    () => getTsType({ type: 'unknownType' }),
    (err: any) => err instanceof Error && err.message === 'Unsupported OpenAPI schema type: unknownType',
  );
});

test('generateTypes object with required + optional properties', () => {
  const schema = makeSchema({
    Profile: {
      type: 'object',
      required: ['address'],
      properties: {
        address: { type: 'string' },
        nickname: { type: 'string' },
      },
    },
  });
  const output = generateTypes(schema);
  assert.ok(output.includes('export interface Profile {'));
  // required property has no '?'
  assert.ok(/address:\s*string/.test(output), 'address should be required (no ?)');
  // optional property has '?'
  assert.ok(/nickname\?:\s*string/.test(output), 'nickname should be optional (?)');
});

test('generateTypes marks a non-required property as optional', () => {
  const schema = makeSchema({
    Membership: {
      type: 'object',
      properties: {
        tier: { type: 'string' },
      },
    },
  });
  const output = generateTypes(schema);
  assert.ok(/tier\?:\s*string/.test(output), 'absent from required -> optional');
});

test('generateTypes emits union type for enum schema', () => {
  const schema = makeSchema({
    Role: {
      enum: ['member', 'moderator', 'admin'],
    },
  });
  const output = generateTypes(schema);
  assert.ok(output.includes("export type Role = 'member' | 'moderator' | 'admin'"));
});

test('generateTypes emits ItemType[] for array properties', () => {
  const schema = makeSchema({
    MemberList: {
      type: 'object',
      properties: {
        roles: { type: 'array', items: { type: 'string' } },
        members: { type: 'array', items: { $ref: '#/components/schemas/Role' } },
      },
    },
  });
  const output = generateTypes(schema);
  // Substring checks are robust to the optional '?' marker.
  assert.ok(output.includes('string[]'));
  assert.ok(output.includes('Role[]'));
});

test('generateTypes resolves nested $ref to last segment', () => {
  const schema = makeSchema({
    Community: {
      type: 'object',
      required: ['owner'],
      properties: {
        owner: { $ref: '#/components/schemas/MemberProfile' },
      },
    },
  });
  const output = generateTypes(schema);
  assert.ok(output.includes('owner: MemberProfile'));
  assert.ok(!output.includes('#/components/schemas/'), 'raw $ref path should not appear');
});

test('generateTypes with no args reads the real fixture (CLI path intact)', () => {
  // The CLI runs the source script from the repo root, where __dirname points at
  // scripts/ and ../test/fixtures/openapi.json resolves correctly. We load the
  // source module explicitly here so the fixture path resolves as it would in the
  // real CLI, while still exercising generateTypes() with no injected schema.
  const path = require('path');
  const sourceScript = require(path.resolve(__dirname, '../../scripts/sync-api-types.js'));
  const output = sourceScript.generateTypes();
  assert.equal(typeof output, 'string');
  assert.ok(output.includes('export interface') || output.includes('export type'));
});
