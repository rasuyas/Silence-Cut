// Pure helpers, no Premiere/ffmpeg access. Exported for tests/silence-logic.test.js.

function parseSilences(text) {
  var out = [], cur = null, lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var m = /silence_start:\s*(-?[\d.]+)/.exec(lines[i]);
    if (m) { cur = parseFloat(m[1]); continue; }
    m = /silence_end:\s*(-?[\d.]+)/.exec(lines[i]);
    if (m && cur !== null) { out.push({ s: cur, e: parseFloat(m[1]) }); cur = null; }
  }
  if (cur !== null) out.push({ s: cur, e: 1e9 }); // silence runs to end of file
  return out;
}

// Source-file silence times -> sequence times, trimmed to what is actually on the timeline
function buildGaps(clip, silences, o) {
  var gaps = [];
  silences.forEach(function (sil) {
    var ss = Math.max(sil.s, clip.inPt);
    var ee = Math.min(sil.e, clip.outPt);
    var len = ee - ss;
    if (len < o.minSil) return;
    var s = clip.start + (ss - clip.inPt) + o.pad;
    var e = clip.start + (ee - clip.inPt) - o.pad;
    if (e - s < 0.04) return;
    gaps.push({ s: s, e: e, track: clip.track, ripple: len < o.bigGap });
  });
  return gaps;
}

if (typeof module !== "undefined") module.exports = { parseSilences: parseSilences, buildGaps: buildGaps };
