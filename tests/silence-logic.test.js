var assert = require("assert");
var L = require("../js/silence-logic.js");

var o = { minSil: 0.2, bigGap: 1, pad: 0.04 };
function clip(extra) {
  var c = { inPt: 0, outPt: 10, start: 0, track: 0 };
  for (var k in extra) c[k] = extra[k];
  return c;
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-9, a + " != " + b); }

// 1. silence starting at the beginning of the source file
var sil = L.parseSilences("[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 2 | silence_duration: 2\n");
assert.deepStrictEqual(sil, [{ s: 0, e: 2 }]);
var g = L.buildGaps(clip(), sil, o);
assert.strictEqual(g.length, 1);
near(g[0].s, 0.04);
near(g[0].e, 1.96);
assert.strictEqual(g[0].ripple, false);

// 2. silence running to the end of the file (parser emits 1e9)
sil = L.parseSilences("[silencedetect @ 0x1] silence_start: 5\n");
assert.strictEqual(sil.length, 1);
near(sil[0].s, 5);
assert.ok(sil[0].e >= 1e9 - 1);
g = L.buildGaps(clip(), sil, o);
assert.strictEqual(g.length, 1);
near(g[0].s, 5.04);
near(g[0].e, 9.96);

// 3. silence starts before the clip in-point
g = L.buildGaps(clip({ inPt: 2, start: 100 }), [{ s: 0, e: 4 }], o);
assert.strictEqual(g.length, 1);
near(g[0].s, 100.04);
near(g[0].e, 101.96);

// 4. gap shorter than minSil is dropped
assert.deepStrictEqual(L.buildGaps(clip(), [{ s: 1, e: 1.1 }], o), []);

// 5. gap smaller than pad x2 is dropped
assert.deepStrictEqual(L.buildGaps(clip(), [{ s: 1, e: 1.28 }], { minSil: 0.2, bigGap: 1, pad: 0.2 }), []);

// ripple flag follows bigGap
assert.strictEqual(L.buildGaps(clip(), [{ s: 1, e: 1.55 }], o)[0].ripple, true);

console.log("silence-logic tests passed");
