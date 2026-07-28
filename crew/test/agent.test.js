'use strict';
// The retry loop, end to end through the JUNK_AGENT_CMD seam.
//
// This is the part of the crew a stub replay cannot check. A replay walks the one path a
// recorded run happened to take; these tests walk the paths a recorded run got lucky enough
// to avoid — a reply that is not JSON, a reply that is JSON but wrong, a command that dies,
// and the question that actually matters: does the rejection reason reach the next attempt?
// An agent told exactly which field it broke fixes it; an agent told to try again does not.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runAgent } = require('../lib/agent');

const FAKE = path.join(__dirname, 'fixtures', 'fake-agent.js');

const SCHEMA = {
  type: 'object',
  required: ['agent', 'value'],
  additionalProperties: false,
  properties: {
    agent: { const: 'tester' },
    value: { type: 'number' },
    note: { type: 'string', minLength: 1 },
  },
};

// Each case gets its own directory so the attempt counter and the captured prompts cannot
// leak between tests.
function harness(behaviours) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'junk-crew-test-'));
  const prefix = path.join(dir, 'state');
  process.env.JUNK_AGENT_CMD =
    `"${process.execPath}" "${FAKE}" "${prefix}" ${behaviours}`;
  return {
    dir,
    run: (opts = {}) => runAgent({
      name: 'tester',
      charter: 'Return the object.',
      inputs: { 'A THING YOU WERE GIVEN': 'some input' },
      schema: SCHEMA,
      logDir: dir,
      mode: 'live',
      stubDir: dir,
      ...opts,
    }),
    // What the orchestrator actually sent on attempt n (0-based).
    promptFor: (n) => fs.readFileSync(`${prefix}.${n}.prompt`, 'utf8'),
    attempts: () => Number(fs.readFileSync(`${prefix}.count`, 'utf8')),
  };
}

test.afterEach(() => { delete process.env.JUNK_AGENT_CMD; });

test('a clean reply validates on the first attempt', () => {
  const h = harness('ok');
  const r = h.run();
  assert.deepEqual(r.object, { agent: 'tester', value: 7, note: 'fine' });
  assert.equal(r.attempts, 1);
  assert.equal(h.attempts(), 1);
});

test('the model is the one that did the work, not the first key', () => {
  // modelUsage lists a cheap internal helper first. Reading key[0] names the wrong model,
  // and the run manifest reports whatever this returns.
  const r = harness('ok').run();
  assert.equal(r.model, 'claude-opus-5');
});

test('CLI chatter around the envelope is skipped', () => {
  // Warning lines, a line that is not JSON, and an object whose `result` is not a string —
  // the scan is bottom-up and structural, so none of them are mistaken for the envelope.
  const r = harness('chatter').run();
  assert.equal(r.object.value, 7);
  assert.equal(r.attempts, 1);
});

test('a fenced or prose-wrapped object is still extracted', () => {
  assert.equal(harness('fenced').run().object.value, 7);
  assert.equal(harness('prose').run().object.value, 7);
});

test('a reply with no JSON retries, and the reason reaches the next prompt', () => {
  const h = harness('malformed,ok');
  const r = h.run();
  assert.equal(r.attempts, 2);
  const second = h.promptFor(1);
  assert.match(second, /YOUR PREVIOUS ATTEMPT WAS REJECTED/);
  assert.match(second, /reply contained no JSON object/);
});

test('a schema failure retries with the exact validation error', () => {
  // The whole reason the crew feeds errors back rather than saying "try again".
  const h = harness('invalid,ok');
  const r = h.run();
  assert.equal(r.attempts, 2);
  const second = h.promptFor(1);
  assert.match(second, /failed its schema/);
  assert.match(second, /\$\.value: expected number, got string/);
});

test('an extra top-level key is rejected, which is what stops one agent re-authoring another\'s artifact', () => {
  // The Balancer emitting a corrected catalog inside its own output is the failure this
  // gate exists for. additionalProperties: false is what makes it impossible.
  const h = harness('extra-key,ok');
  const r = h.run();
  assert.equal(r.attempts, 2);
  assert.match(h.promptFor(1), /unexpected property "catalog"/);
});

test('three bad attempts give up and name the agent and every reason', () => {
  const h = harness('invalid');
  assert.throws(() => h.run(), (err) => {
    assert.match(err.message, /^tester failed after 3 attempts/);
    assert.match(err.message, /attempt 1:/);
    assert.match(err.message, /attempt 3:/);
    return true;
  });
  assert.equal(h.attempts(), 3);
});

test('a command that exits non-zero is a retryable failure, not a crash', () => {
  const h = harness('crash,ok');
  const r = h.run();
  assert.equal(r.attempts, 2);
  assert.match(h.promptFor(1), /exited 3/);
});

test('every attempt leaves its prompt and its reply on disk', () => {
  // The failure path tells a human to read crew/out/logs/. That has to be true.
  const h = harness('invalid,ok');
  h.run();
  for (const f of ['tester.attempt1.prompt.md', 'tester.attempt1.log',
                   'tester.attempt2.prompt.md', 'tester.attempt2.log']) {
    assert.ok(fs.existsSync(path.join(h.dir, f)), `${f} should exist`);
  }
});

test('stub mode replays a recorded envelope through the identical parse and validate path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'junk-crew-test-'));
  fs.writeFileSync(path.join(dir, 'tester.attempt1.log'), JSON.stringify({
    result: JSON.stringify({ agent: 'tester', value: 42 }),
    modelUsage: { 'claude-opus-5': { outputTokens: 5 } },
  }));
  // No JUNK_AGENT_CMD is set: if replay reached for the command this would fail loudly.
  const r = runAgent({
    name: 'tester', charter: 'x', inputs: {}, schema: SCHEMA,
    logDir: dir, mode: 'stub', stubDir: dir,
  });
  assert.equal(r.object.value, 42);
});

test('a missing fixture says which names it looked for', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'junk-crew-test-'));
  assert.throws(() => runAgent({
    name: 'nobody', charter: 'x', inputs: {}, schema: SCHEMA,
    logDir: dir, mode: 'stub', stubDir: dir,
  }), /no recorded output for "nobody"/);
});
