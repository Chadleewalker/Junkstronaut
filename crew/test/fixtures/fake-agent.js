#!/usr/bin/env node
'use strict';
// A stand-in for the Claude CLI, for the tests.
//
// It reads a prompt on stdin and writes the CLI's `--output-format json` envelope on stdout,
// which is the entire contract `lib/agent.js` depends on. That contract is why the crew has
// a JUNK_AGENT_CMD seam at all: the orchestrator's retry loop, its envelope parsing and its
// schema gate can be exercised end to end without a model, a network or a credential.
//
// Behaviour is per attempt, taken from argv, so a test can say "malformed the first time,
// valid the second" and then assert the retry actually happened AND that the rejection
// reason reached the next prompt. A stub replay cannot check either: it only ever walks the
// path a recorded run happened to take.
//
//   node fake-agent.js <state-prefix> <behaviour,behaviour,...>
//
// Every invocation appends its attempt number to <state-prefix>.count and writes the prompt
// it received to <state-prefix>.<n>.prompt, so the test can read back what the orchestrator
// actually sent.

const fs = require('fs');

const [prefix, script] = process.argv.slice(2);

// Node's own test discovery treats every .js file under test/ as a test file, so a bare
// `node --test` will execute this one with no arguments. Exiting quietly is the difference
// between that being a harmless no-op and the whole run hanging forever on the stdin read
// below, waiting for a prompt nobody is going to send.
if (!prefix || !script) process.exit(0);

const behaviours = String(script).split(',');

// Drained, not ignored. The real CLI consumes stdin, and a fake that does not can leave the
// parent blocked writing a large prompt into a pipe nobody is reading.
let prompt = '';
try { prompt = fs.readFileSync(0, 'utf8'); } catch { prompt = ''; }

let n = 0;
try { n = Number(fs.readFileSync(`${prefix}.count`, 'utf8')) || 0; } catch { n = 0; }
fs.writeFileSync(`${prefix}.count`, String(n + 1));
fs.writeFileSync(`${prefix}.${n}.prompt`, prompt);

// The last behaviour repeats, so 'invalid' alone means "always invalid".
const behaviour = behaviours[Math.min(n, behaviours.length - 1)];

// modelUsage deliberately lists the cheap helper first: chooseModel has to pick by output
// tokens rather than by key order, and this is the shape that catches it if it stops.
const envelope = (result) => JSON.stringify({
  type: 'result',
  subtype: 'success',
  result,
  modelUsage: {
    'claude-haiku-4-5-20251001': { outputTokens: 12 },
    'claude-opus-5': { outputTokens: 900 },
  },
});

const GOOD = { agent: 'tester', value: 7, note: 'fine' };

if (behaviour === 'ok') {
  console.log(envelope(JSON.stringify(GOOD)));
} else if (behaviour === 'fenced') {
  console.log(envelope('```json\n' + JSON.stringify(GOOD) + '\n```'));
} else if (behaviour === 'prose') {
  console.log(envelope(
    'Here is the object you asked for:\n\n' + JSON.stringify(GOOD) + '\n\nHope that helps.'
  ));
} else if (behaviour === 'chatter') {
  // The CLI prints its own warnings before its output, and a future version will invent new
  // ones. The envelope is found by scanning bottom-up, not by matching known warning text.
  console.log('Warning: this workspace is untrusted');
  console.log('{ not json at all');
  console.log('{"result": 12, "note": "an object, but result is not a string"}');
  console.log(envelope(JSON.stringify(GOOD)));
} else if (behaviour === 'malformed') {
  console.log(envelope('I could not produce that object, sorry.'));
} else if (behaviour === 'invalid') {
  console.log(envelope(JSON.stringify({ agent: 'tester', value: 'seven' })));
} else if (behaviour === 'extra-key') {
  console.log(envelope(JSON.stringify({ ...GOOD, catalog: ['not yours to author'] })));
} else if (behaviour === 'crash') {
  process.stderr.write('the agent command fell over\n');
  process.exit(3);
} else if (behaviour === 'no-envelope') {
  console.log('nothing here parses as the CLI envelope');
} else {
  process.stderr.write(`unknown behaviour: ${behaviour}\n`);
  process.exit(9);
}
