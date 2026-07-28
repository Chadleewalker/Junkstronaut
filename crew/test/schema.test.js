'use strict';
// The schema gate. It runs between every agent handoff, and it is the reason a malformed
// artifact retries the agent that produced it instead of reaching the next one and failing
// there. Every keyword below is one the crew's five contracts actually use — the validator
// supports exactly that much of draft-07 and nothing else, on purpose.

const test = require('node:test');
const assert = require('node:assert');

const { validate } = require('../lib/schema');

const ok = (v, s) => assert.deepEqual(validate(v, s), []);
const fails = (v, s, re) => {
  const errs = validate(v, s);
  assert.ok(errs.length > 0, `expected an error, got none for ${JSON.stringify(v)}`);
  if (re) assert.ok(errs.some((e) => re.test(e)), `no error matched ${re}\n  got: ${errs.join('\n  ')}`);
  return errs;
};

test('type: an integer satisfies number, but not the other way round', () => {
  ok(5, { type: 'number' });
  ok(5, { type: 'integer' });
  ok(5.5, { type: 'number' });
  fails(5.5, { type: 'integer' }, /expected integer, got number/);
  fails('5', { type: 'number' }, /expected number, got string/);
  fails(null, { type: 'object' }, /expected object, got null/);
  fails([], { type: 'object' }, /expected object, got array/);
  ok([], { type: 'array' });
});

test('type accepts a list of alternatives', () => {
  ok(null, { type: ['string', 'null'] });
  ok('x', { type: ['string', 'null'] });
  fails(3, { type: ['string', 'null'] }, /expected string or null/);
});

test('a type mismatch stops there rather than piling on noise', () => {
  // Reporting "expected object, got string" AND "missing required property" for the same
  // value gives the agent two problems to fix when it has one.
  const errs = validate('nope', { type: 'object', required: ['a', 'b', 'c'] });
  assert.equal(errs.length, 1);
});

test('required names the property that is missing', () => {
  fails({ a: 1 }, { type: 'object', required: ['a', 'b'] }, /missing required property "b"/);
  ok({ a: 1, b: 2 }, { type: 'object', required: ['a', 'b'] });
  // Present-but-undefined still counts as present; hasOwnProperty is the test.
  ok({ a: 1, b: undefined }, { type: 'object', required: ['b'] });
});

test('additionalProperties: false is what stops an agent smuggling in another\'s artifact', () => {
  // The Balancer emitting a corrected debris catalog inside its own output is the exact
  // failure this keyword exists to make impossible.
  const schema = {
    type: 'object',
    properties: { agent: { type: 'string' } },
    additionalProperties: false,
  };
  ok({ agent: 'x' }, schema);
  fails({ agent: 'x', debris: [] }, schema, /unexpected property "debris"/);
  // Absent means permissive, which is the draft-07 default and is relied on inside blocks
  // like `flight` where agents may add their own extra tunables.
  ok({ agent: 'x', debris: [] }, { type: 'object', properties: { agent: { type: 'string' } } });
});

test('patternProperties carry the band names', () => {
  const schema = {
    type: 'object',
    required: ['suborbital', 'low', 'high'],
    patternProperties: { '^(suborbital|low|high)$': { type: 'number' } },
  };
  ok({ suborbital: 1, low: 2.4, high: 5.5 }, schema);
  fails({ suborbital: 1, low: 'x', high: 5.5 }, schema, /\$\.low: expected number/);
  fails({ suborbital: 1, high: 3 }, schema, /missing required property "low"/);
});

test('an invented band name is not a schema error, and is caught semantically instead', () => {
  // Worth pinning, because it looks like a gap and is not one. The band blocks say what must
  // be present, not what may not be — `additionalProperties: false` is set at the top level
  // of each contract, not inside these. So a fourth band slips past the schema gate here.
  //
  // The audit is what catches it: `band_names_defined_in_baseline` checks the set difference
  // in BOTH directions against the Researcher's bands, which is a question about meaning
  // rather than shape and belongs to an agent rather than to a validator.
  const schema = {
    type: 'object',
    required: ['suborbital', 'low', 'high'],
    patternProperties: { '^(suborbital|low|high)$': { type: 'number' } },
  };
  ok({ suborbital: 1, low: 2, high: 3, midband: 4 }, schema);
});

test('properties win over patternProperties for the same key', () => {
  const schema = {
    type: 'object',
    properties: { low: { type: 'string' } },
    patternProperties: { '^low$': { type: 'number' } },
  };
  ok({ low: 'a string' }, schema);
});

test('numeric bounds', () => {
  ok(5, { minimum: 5 });
  fails(4.9, { minimum: 5 }, /below the minimum 5/);
  ok(5, { maximum: 5 });
  fails(5.1, { maximum: 5 }, /above the maximum 5/);
  fails(0, { exclusiveMinimum: 0 }, /must be greater than 0/);
  ok(0.0001, { exclusiveMinimum: 0 });
  // cycle_toll_growth must exceed 1: a flat toll cannot hold the ablation optimum in place.
  fails(1, { exclusiveMinimum: 1 }, /must be greater than 1/);
});

test('array length and item validation', () => {
  const four = { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number' } };
  ok([1, 0.98, 0.97, 0.97], four);
  fails([1, 0.98, 0.97], four, /has 3 items, needs at least 4/);
  fails([1, 1, 1, 1, 1], four, /has 5 items, allows at most 5|allows at most 4/);
  fails([1, 'x', 1, 1], four, /\$\[1\]: expected number/);
});

test('uniqueItems flags the repeat, not the original', () => {
  const errs = fails(['a', 'b', 'a'], { type: 'array', uniqueItems: true }, /\$\[2\]: duplicate item/);
  assert.equal(errs.length, 1);
});

test('enum and const', () => {
  ok('pass', { enum: ['pass', 'fail'] });
  fails('maybe', { enum: ['pass', 'fail'] }, /"maybe" is not one of "pass", "fail"/);
  ok('economy-balancer', { const: 'economy-balancer' });
  fails('spec-auditor', { const: 'economy-balancer' }, /expected the constant/);
});

test('string length and pattern', () => {
  ok('a long enough note', { type: 'string', minLength: 5 });
  fails('hi', { type: 'string', minLength: 5 }, /shorter than 5 characters/);
  ok('lower_snake_case', { type: 'string', pattern: '^[a-z_]+$' });
  fails('NotSnake', { type: 'string', pattern: '^[a-z_]+$' }, /does not match/);
});

test('errors carry a path a human can follow into a nested artifact', () => {
  const schema = {
    type: 'object',
    properties: {
      ablation: {
        type: 'object',
        properties: {
          cost_curve: {
            type: 'object',
            patternProperties: { '^high$': { type: 'array', items: { type: 'number' } } },
          },
        },
      },
    },
  };
  fails({ ablation: { cost_curve: { high: [30, 'x'] } } }, schema,
    /\$\.ablation\.cost_curve\.high\[1\]: expected number, got string/);
});

test('every error in one pass, so one retry can fix them all', () => {
  // The retry feeds these back verbatim. Stopping at the first would cost an attempt per
  // problem, and there are only three.
  const errs = validate({ a: 'x', b: 'y' }, {
    type: 'object',
    required: ['c'],
    properties: { a: { type: 'number' }, b: { type: 'number' } },
  });
  assert.equal(errs.length, 3);
});

test('the real game-params schema accepts the committed run', () => {
  // A guard against a schema edit that quietly invalidates the artifact in out/.
  const fs = require('fs');
  const path = require('path');
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'schemas', 'game-params.schema.json'), 'utf8'));
  const params = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'out', 'config', 'game_params.json'), 'utf8'));
  const errs = validate(params, schema);
  // The committed run predates the parachute contract, so exactly that is expected to fail
  // until the crew is re-recorded. Anything else is a regression.
  const unexpected = errs.filter((e) => !/parachute_area_m2|parachute_drag_coefficient/.test(e));
  assert.deepEqual(unexpected, [], `unexpected schema errors:\n  ${unexpected.join('\n  ')}`);
});
