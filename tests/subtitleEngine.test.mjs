import assert from 'node:assert/strict';
import * as S from '../js/utils/subtitleEngine.js';

assert.equal(S.formatTimestamp(3723.456), '01:02:03,456');
assert.equal(S.formatTimestamp(1.5, '.'), '00:00:01.500');
assert.equal(S.parseTimestamp('00:01:02,500'), 62.5);
assert.equal(S.parseTimestamp('01:02.500'), 62.5);
assert.ok(Number.isNaN(S.parseTimestamp('abc')));

const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nXin <i>chào</i>\r\nthế giới\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nCâu hai\r\n';
const cues = S.parseSRT(srt);
assert.equal(cues.length, 2);
assert.equal(cues[0].text, 'Xin chào\nthế giới');
assert.equal(cues[1].start, 3);

const round = S.parseSRT(S.toSRT(cues));
assert.deepEqual(round.map(c => [c.start, c.end, c.text]), cues.map(c => [c.start, c.end, c.text]));
const vtt = S.toVTT(cues);
assert.ok(vtt.startsWith('WEBVTT\n\n00:00:01.000 --> 00:00:02.500'));
assert.equal(S.parseVTT(vtt).length, 2);

const v = S.validate([{ start: 5, end: 4, text: 'a' }, { start: 0, end: 12, text: 'b' }, { start: 0, end: 1, text: ' ' }], 10);
assert.deepEqual(v.map(x => x.problems.length), [1, 1, 1]);
assert.equal(S.clampToDuration([{ start: 0, end: 12, text: 'b' }, { start: 11, end: 12, text: 'c' }], 10).length, 1);

const [a, b] = S.splitCue({ id: 'x', start: 0, end: 4, text: 'một hai ba bốn', source: 'ocr' }, 2);
assert.equal(a.text, 'một hai'); assert.equal(b.start, 2);
assert.throws(() => S.splitCue({ start: 0, end: 4, text: 'x' }, 2));
assert.equal(S.mergeCues(a, b).end, 4);

assert.equal(S.similarity('Xin chào!', 'xin chào'), 1);
assert.ok(S.similarity('hello world', 'hello wurld') > 0.8);

const rows = S.compareSources(
  [{ start: 1, end: 3, text: 'Xin chào các bạn' }, { start: 5, end: 6, text: 'Logo ABC' }, { start: 8, end: 10, text: 'bản dịch khác hẳn' }],
  [{ start: 1.2, end: 3.1, text: 'xin chào các bạn' }, { start: 7.9, end: 10, text: 'nội dung nói hoàn toàn khác' }, { start: 20, end: 22, text: 'chỉ có trong âm thanh' }]);
assert.deepEqual(rows.map(r => r.status), ['match', 'ocr-only', 'review', 'stt-only']);
assert.equal(rows[2].ocr.text, 'bản dịch khác hẳn'); // originals untouched
console.log('subtitleEngine: all tests passed');
