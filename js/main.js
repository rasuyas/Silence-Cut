(function () {
  var nodeRequire = (typeof require !== "undefined") ? require : (window.cep_node && window.cep_node.require);
  var cp = nodeRequire("child_process");
  var logEl = document.getElementById("log");
  var btnPreview = document.getElementById("btnPreview");
  var btnCut = document.getElementById("btnCut");
  var busy = false;

  function log(m) { logEl.textContent += m + "\n"; logEl.scrollTop = logEl.scrollHeight; }
  function num(id) { return parseFloat(document.getElementById(id).value); }

  function evalScript(script) {
    return new Promise(function (resolve) { window.__adobe_cep__.evalScript(script, resolve); });
  }

  function runSilenceDetect(ffmpeg, file, noiseDb, minDur) {
    return new Promise(function (resolve, reject) {
      var args = ["-hide_banner", "-nostats", "-i", file, "-vn",
                  "-af", "silencedetect=noise=" + noiseDb + "dB:d=" + minDur, "-f", "null", "-"];
      var p;
      try { p = cp.spawn(ffmpeg, args); } catch (e) { reject(e); return; }
      var err = "";
      p.stderr.on("data", function (d) { err += d.toString(); });
      p.on("error", function (e) { reject(new Error("Could not start ffmpeg: " + e.message)); });
      p.on("close", function (code) {
        if (code !== 0) { reject(new Error("ffmpeg failed on " + file + " (exit code " + code + ")")); return; }
        resolve(parseSilences(err));
      });
    });
  }

  function run(doCut) {
    if (busy) return;
    busy = true;
    btnPreview.disabled = true;
    btnCut.disabled = true;
    logEl.textContent = "";
    var o = {
      ffmpeg: document.getElementById("ffmpeg").value || "ffmpeg",
      noise: num("noise"), minSil: num("minSil"), bigGap: num("bigGap"), pad: num("pad"),
      cutVideo: document.getElementById("cutVideo").checked
    };
    return Promise.resolve().then(function () {
      if (!isFinite(o.noise) || o.noise >= 0) throw new Error("Silence threshold must be a negative dB number, e.g. -28.");
      if (!isFinite(o.minSil) || !isFinite(o.bigGap) || !isFinite(o.pad)) throw new Error("Min silence, big gap and padding must be numbers.");
      if (o.pad < 0) throw new Error("Padding cannot be negative.");
      log("Reading selected clips...");
      return evalScript("getSelectedAudioClips()");
    }).then(function (res) {
      var data;
      try { data = JSON.parse(res); } catch (e) { throw new Error(res); }
      if (data.error) throw new Error(data.error);
      if (!data.clips.length) throw new Error("Select the audio clip(s) on the timeline first.");
      var gaps = [], cache = {}, chain = Promise.resolve();
      data.clips.forEach(function (clip) {
        chain = chain.then(function () {
          if (!clip.path) throw new Error("No media path for clip: " + clip.name);
          if (!cache[clip.path]) {
            log("Analyzing: " + clip.name);
            cache[clip.path] = runSilenceDetect(o.ffmpeg, clip.path, o.noise, o.minSil);
          }
          return cache[clip.path].then(function (sil) {
            gaps = gaps.concat(buildGaps(clip, sil, o));
          });
        });
      });
      return chain.then(function () { return gaps; });
    }).then(function (gaps) {
      gaps.sort(function (a, b) { return b.s - a.s; }); // last gap first, so earlier times never shift
      var small = 0, big = 0, removed = 0;
      gaps.forEach(function (g) { if (g.ripple) small++; else big++; removed += (g.e - g.s); });
      log("Found " + small + " small gaps (ripple) and " + big + " big gaps (no ripple).");
      log("Silence to remove: " + removed.toFixed(1) + " s");
      if (!doCut) {
        gaps.slice().reverse().slice(0, 40).forEach(function (g) {
          log((g.ripple ? "small " : "BIG   ") + g.s.toFixed(2) + " -> " + g.e.toFixed(2));
        });
        return;
      }
      if (!gaps.length) { log("Nothing to cut."); return; }
      if (!window.confirm("Cut " + gaps.length + " gaps? Duplicate sequence first.")) {
        log("Cancelled");
        return;
      }
      log("Cutting...");
      var payload = JSON.stringify({ gaps: gaps, cutVideo: o.cutVideo });
      return evalScript("applyCuts(" + JSON.stringify(payload) + ")").then(function (r) { log(r); });
    }).catch(function (e) { log("ERROR: " + (e.message || e)); })
      .then(function () { busy = false; btnPreview.disabled = false; btnCut.disabled = false; });
  }

  btnPreview.onclick = function () { run(false); };
  btnCut.onclick = function () { run(true); };
})();
