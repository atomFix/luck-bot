import test from 'node:test';
import assert from 'node:assert/strict';
import {logEvent} from '../src/diagnostics.js';
test('credentials and utterance fields cannot reach diagnostic output', () => {
 const lines: string[]=[];
 logEvent(s=>lines.push(s), {event:'asr.done',bytes:640,api_key:'sentinel-secret',transcript:'private words'} as any);
 assert.deepEqual(JSON.parse(lines[0]!),{event:'asr.done',bytes:640});
});
test('untrusted free text cannot be smuggled through diagnostic names or codes', () => {
 const lines: string[]=[];
 logEvent(s=>lines.push(s), {event:'Authorization: sentinel-secret',code:'private words',model:'bad\nvalue'});
 assert.deepEqual(JSON.parse(lines[0]!),{event:'invalid'});
});
