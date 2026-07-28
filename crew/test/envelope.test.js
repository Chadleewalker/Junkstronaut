'use strict';
// Getting an agent's answer out of a raw CLI log.
//
// Two separate jobs, and they fail differently. `parseEnvelope` finds the CLI's own JSON
// wrapper in a log full of the CLI's chatter; `extractObject` finds the agent's object
// inside the reply text, whether or not the agent honoured "return one JSON object and
// nothing else". Both are pure string handling, and both have been broken by a change in
// the CLI's output rather than by anything in this repo — which is exactly why they are
// tested against shapes rather than against a recorded log.

const test = require('node:test');
const assert = require('node:assert');

const { parseEnvelope, extractObject, chooseModel } = require('../lib/envelope');

const envelope = (result, modelUsage) =>
  JSON.stringify({ type: 'result', result, ...(modelUsage ? { modelUsage } : {}) });

test('the envelope is found at the bottom of a noisy log', () => {
  const log = [
    'Warning: this workspace is untrusted',
    'some other line the CLI decided to print',
    envelope('{"a":1}'),
  ].join('\n');
  const env = parseEnvelope(log);
  assert.equal(env.result, '{"a":1}');
});

test('objects that are not the envelope are skipped structurally, not by matching known warnings', () => {
  // The rule is "the last line that parses to an object with a string `result`". No list of
  // warning strings to maintain, so a new warning in a future CLI version costs nothing.
  const log = [
    '{"type":"progress","step":3}',
    '{"result":42}',
    '{"result":{"nested":"object, not a string"}}',
    envelope('{"a":1}'),
    'trailing chatter that is not JSON at all',
  ].join('\n');
  assert.equal(parseEnvelope(log).result, '{"a":1}');
});

test('the LAST envelope wins when the CLI prints more than one', () => {
  const log = [envelope('{"a":1}'), envelope('{"a":2}')].join('\n');
  assert.equal(parseEnvelope(log).result, '{"a":2}');
});

test('a log with no envelope returns null rather than throwing', () => {
  // Stub mode relies on this: a hand-written fixture may be the bare object, and the caller
  // falls through to extractObject on the raw text.
  assert.equal(parseEnvelope('not json\nstill not json'), null);
  assert.equal(parseEnvelope(''), null);
  assert.equal(parseEnvelope('[1,2,3]'), null);
});

test('chooseModel picks the model that did the work, not the first key', () => {
  // The CLI bills a cheap internal helper alongside the real model and lists it first, so
  // key[0] names the wrong one and the run manifest reports a lie.
  assert.equal(chooseModel({
    'claude-haiku-4-5-20251001': { outputTokens: 12 },
    'claude-opus-5': { outputTokens: 4300 },
  }), 'claude-opus-5');
  assert.equal(chooseModel({ 'claude-opus-5': { outputTokens: 5 } }), 'claude-opus-5');
  assert.equal(chooseModel({}), null);
  assert.equal(chooseModel(null), null);
  assert.equal(chooseModel([]), null);
});

test('chooseModel breaks ties by name, so the manifest is reproducible', () => {
  assert.equal(chooseModel({ b: { outputTokens: 5 }, a: { outputTokens: 5 } }), 'a');
  // Missing or non-numeric counts read as zero rather than poisoning the sort.
  assert.equal(chooseModel({ a: {}, b: { outputTokens: 1 } }), 'b');
});

test('extractObject: a bare object, the cheapest path', () => {
  assert.deepEqual(extractObject('{"a":1}'), { a: 1 });
  assert.deepEqual(extractObject('  \n {"a":1}\n '), { a: 1 });
});

test('extractObject: a markdown fence, which agents produce despite being told not to', () => {
  assert.deepEqual(extractObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractObject('```\n{"a":1}\n```'), { a: 1 });
});

test('extractObject: prose either side of the object', () => {
  assert.deepEqual(
    extractObject('Here you go:\n\n{"a":1,"b":{"c":2}}\n\nLet me know if that helps.'),
    { a: 1, b: { c: 2 } }
  );
});

test('extractObject refuses arrays and non-objects', () => {
  // Every crew contract is an object at the top level. An array here means the agent
  // misread its charter, and that should retry rather than proceed.
  assert.equal(extractObject('[1,2,3]'), null);
  assert.equal(extractObject('"just a string"'), null);
  assert.equal(extractObject('42'), null);
  assert.equal(extractObject('I could not do that.'), null);
  assert.equal(extractObject(''), null);
});

test('extractObject gives up when prose before the object contains its own braces', () => {
  // A known and deliberate limit. The last fallback is the OUTERMOST brace span — first '{'
  // to last '}' — so a brace in the prose swallows the real object and the span no longer
  // parses. Balanced-span scanning would fix it and is not worth the code: the agent is told
  // to return one object and nothing else, and a miss here is not silent. It fails the
  // extraction, the attempt retries, and the next prompt says "reply contained no JSON
  // object" — which is the feedback that gets it right the second time.
  //
  // This test exists to pin the boundary. If someone makes it pass, that is an improvement,
  // not a regression — but it should be a deliberate one.
  assert.equal(extractObject('note: use {curly} braces\n{"a":1}'), null);
  // Prose without braces is handled, and that is the case that actually shows up.
  assert.deepEqual(extractObject('note: use curly braces\n{"a":1}'), { a: 1 });
});
