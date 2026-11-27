// Silence Cut - ExtendScript side (Premiere Pro)
var TICKS = 254016000000;

function toJSON(v) {
  if (v === null || v === undefined) return "null";
  var t = typeof v;
  if (t === "number") return isFinite(v) ? String(v) : "null";
  if (t === "boolean") return v ? "true" : "false";
  if (t === "string") {
    var esc = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
    return '"' + v.replace(/[\\"\u0000-\u001f]/g, function (c) { return esc[c] || "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4); }) + '"';
  }
  if (v instanceof Array) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(toJSON(v[i]));
    return "[" + a.join(",") + "]";
  }
  var p = [];
  for (var k in v) { if (v.hasOwnProperty(k)) p.push(toJSON(k) + ":" + toJSON(v[k])); }
  return "{" + p.join(",") + "}";
}

function getSelectedAudioClips() {
  var seq = app.project.activeSequence;
  if (!seq) return toJSON({ error: "No active sequence." });
  var out = [];
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var tr = seq.audioTracks[t];
    for (var c = 0; c < tr.clips.numItems; c++) {
      var clip = tr.clips[c];
      if (clip.isSelected()) {
        var path = "";
        try { path = clip.projectItem.getMediaPath(); } catch (e) {}
        out.push({
          track: t, name: clip.name, path: path,
          start: clip.start.seconds, end: clip.end.seconds,
          inPt: clip.inPoint.seconds, outPt: clip.outPoint.seconds
        });
      }
    }
  }
  return toJSON({ clips: out });
}

function secToTC(seq, sec) {
  var zp = 0;
  try { zp = (parseFloat(seq.zeroPoint) / TICKS) || 0; } catch (e) {}
  var t = new Time();
  t.seconds = sec + zp;
  try {
    var st = seq.getSettings();
    return t.getFormatted(st.videoFrameRate, st.videoDisplayFormat);
  } catch (e2) {}
  // fallback: non-drop-frame timecode
  var fs = parseFloat(seq.timebase) / TICKS;
  var fps = Math.round(1 / fs);
  var f = Math.round((sec + zp) / fs);
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  var ff = f % fps, s = Math.floor(f / fps), ss = s % 60, m = Math.floor(s / 60), mm = m % 60, hh = Math.floor(m / 60);
  return pad(hh) + ":" + pad(mm) + ":" + pad(ss) + ":" + pad(ff);
}

function findItem(track, s, e, tol) {
  // assumes clips are listed in time order, so we can stop once past the gap
  for (var c = 0; c < track.clips.numItems; c++) {
    var it = track.clips[c];
    if (it.start.seconds > e + tol) break;
    if (Math.abs(it.start.seconds - s) <= tol && Math.abs(it.end.seconds - e) <= tol) return it;
  }
  return null;
}

function razorAll(qeSeq, seq, audioTrackIdx, cutVideo, tc) {
  try { qeSeq.getAudioTrackAt(audioTrackIdx).razor(tc); } catch (e) {}
  if (cutVideo) {
    for (var v = 0; v < seq.videoTracks.numTracks; v++) {
      try { qeSeq.getVideoTrackAt(v).razor(tc); } catch (e2) {}
    }
  }
}

function cutOne(g, cutVideo, log) {
  var seq = app.project.activeSequence;
  var fs = parseFloat(seq.timebase) / TICKS;
  // snap inward to whole frames so we never nibble speech
  var s = Math.ceil(g.s / fs - 1e-6) * fs;
  var e = Math.floor(g.e / fs + 1e-6) * fs;
  if (e - s < fs) return false;

  var qeSeq = qe.project.getActiveSequence();
  var tcS = secToTC(seq, s), tcE = secToTC(seq, e);
  razorAll(qeSeq, seq, g.track, cutVideo, tcE);
  razorAll(qeSeq, seq, g.track, cutVideo, tcS);

  seq = app.project.activeSequence; // refresh after razor
  var tol = fs * 1.5;
  var aItem = findItem(seq.audioTracks[g.track], s, e, tol);
  var vItems = [];
  if (cutVideo) {
    for (var v = 0; v < seq.videoTracks.numTracks; v++) {
      var vi = findItem(seq.videoTracks[v], s, e, tol);
      if (vi) vItems.push(vi);
    }
  }
  if (!aItem && vItems.length === 0) { log.push("Nothing found at " + tcS); return false; }

  if (g.ripple) {
    // lift everything else first, then ripple-delete ONE item so the hole closes on all synced tracks
    var rip = aItem ? aItem : vItems.pop();
    for (var i = 0; i < vItems.length; i++) { try { vItems[i].remove(false, false); } catch (e3) {} }
    rip.remove(true, true);
  } else {
    for (var j = 0; j < vItems.length; j++) { try { vItems[j].remove(false, false); } catch (e4) {} }
    if (aItem) { try { aItem.remove(false, false); } catch (e5) {} }
  }
  return true;
}

function applyCuts(jsonStr) {
  var opts = eval("(" + jsonStr + ")");
  app.enableQE();
  var log = [], cut = 0, notFound = 0;
  for (var i = 0; i < opts.gaps.length; i++) {
    try { if (cutOne(opts.gaps[i], opts.cutVideo, log)) cut++; else notFound++; }
    catch (err) { log.push("Gap " + i + " failed: " + err); }
  }
  return "Cut " + cut + " of " + opts.gaps.length + " gaps, " + notFound + " not found.\n" + log.join("\n");
}
