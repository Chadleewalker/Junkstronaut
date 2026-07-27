'use strict';
// One share of the exploration grid, flown off the main thread.
//
// The parent hands over the three documents and a list of cell indices; the cells themselves
// are re-derived here rather than transferred, because a cell is a handful of numbers to
// describe and half a second to fly. Nothing decides anything in this file — it is the same
// scoring path the single-threaded sweep takes, on a different thread.

const { parentPort, workerData } = require('worker_threads');
const { sweepIndices } = require('./sweep');

const { baseline, params, catalog, indices } = workerData;
parentPort.postMessage(sweepIndices(baseline, params, catalog, indices));
