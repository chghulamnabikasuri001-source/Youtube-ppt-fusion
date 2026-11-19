const VIS_ICON = {
  nested: "⭕", flow: "🔀", cards: "🗂️", steps: "🪜", table: "📊",
  tree: "🌳", network: "🧠", code: "💻", compare: "⚖️", null: "📝"
};

const $ = (id) => document.getElementById(id);
let latestDeck = null;

function fmtTs(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(rem)}` : `${pad(m)}:${pad(rem)}`;
}

function renderSwatches(themeName) {
  const t = THEMES[themeName] || THEMES["Classroom"];
  const cols = [t.dark, ...t.acc, t.light];
  $("swatches").innerHTML = cols.map((c) => `<i style="background:#${c}"></i>`).join("");
  $("swatch-label").textContent = `${themeName} palette`;
}

// Auto-retry: agar Gemini busy (503) ya rate limit (429) ho to khud dobara try karta hai
async function safeFetchJson(url, options, retries = 2) {
  const res = await fetch(url, options);
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    if (res.status === 502 || res.status === 504 || raw.trim().startsWith("<")) {
      throw new Error(
        "Server timed out because this video has no captions and was too heavy to watch directly. Tip: Open YouTube → click 'Show transcript' → paste it in the manual box above!"
      );
    }
    throw new Error(`Unexpected server response (${res.status}).`);
  }
  if (!res.ok) {
    if ((res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) && retries > 0) {
      await new Promise((r) => setTimeout(r, 4000));
      return safeFetchJson(url, options, retries - 1);
    }
    throw new Error(data.detail || `Request failed (${res.status}).`);
  }
  return data;
}

function parseManualTranscript(text) {
  const tsRegex = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;
  const snips = [];
  let curTime = 0;
  let hasTs = false;
  let n = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(tsRegex);
    if (m) {
      const h = parseInt(m[1] || "0", 10);
      const mi = parseInt(m[2], 10);
      const sec = parseInt(m[3], 10);
      curTime = h * 3600 + mi * 60 + sec;
      hasTs = true;
      continue;
    }
    if (!hasTs) curTime = n * 5;
    snips.push({ start: curTime, duration: 5, text: line });
    n++;
  }
  return snips;
}

function splitChunks(snips, maxCharsPerChunk = 2500, maxTotalChars = 150000) {
  const chunks = [];
  let cur = [];
  let n = 0;
  let total = 0;
  let truncated = false;

  const flush = () => {
    if (!cur.length) return;
    const lines = [];
    let lastMarker = -30;
    let buf = [];
    for (const sn of cur) {
      if (sn.start - lastMarker >= 20) {
        if (buf.length) {
          lines.push(buf.join(" "));
          buf = [];
        }
        buf.push(`[${fmtTs(sn.start)}]`);
        lastMarker = sn.start;
      }
      buf.push(sn.text);
    }
    if (buf.length) lines.push(buf.join(" "));
    chunks.push({
      text: lines.join("\n"),
      start: cur[0].start,
      end: cur[cur.length - 1].start + cur[cur.length - 1].duration
    });
  };

  for (const sn of snips) {
    if (total + sn.text.length > maxTotalChars) {
      truncated = true;
      break;
    }
    cur.push(sn);
    n += sn.text.length + 1;
    total += sn.text.length + 1;
    if (n >= maxCharsPerChunk) {
      flush();
      cur = [];
      n = 0;
    }
  }
  flush();
  return { chunks, truncated };
}

function setProgress(pct, msg, title) {
  if (title) $("progress-title").textContent = title;
  $("progress-msg").textContent = msg;
  $("progress-fill").style.width = `${pct}%`;
  $("progress-pct").textContent = `${pct}%`;
}

function showError(msg) {
  $("progress-card").classList.add("hidden");
  $("error-card").classList.remove("hidden");
  $("error-msg").textContent = msg;
  $("submit-btn").disabled = false;
  $("btn-text").textContent = "✨ Generate Presentation";
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function saveToHistory(item) {
  const list = JSON.parse(localStorage.getItem("ppt_history") || "[]");
  list.unshift({ ...item, date: new Date().toLocaleString() });
  localStorage.setItem("ppt_history", JSON.stringify(list.slice(0, 12)));
  renderHistory();
}

function renderHistory() {
  const list = JSON.parse(localStorage.getItem("ppt_history") || "[]");
  if (!list.length) {
    $("history-card").classList.add("hidden");
    return;
  }
  $("history-card").classList.remove("hidden");
  $("history-list").innerHTML = list.map((it) => `
    <div class="history-item">
      <div>
        <strong>${escapeHtml(it.title)}</strong>
        <div style="font-size:0.78rem;color:#64748b">${it.slides} slides · ${escapeHtml(it.date)}</div>
      </div>
      <span class="ts-tag">${escapeHtml(it.theme)}</span>
    </div>
  `).join("");
}

$("clear-history").addEventListener("click", () => {
  localStorage.removeItem("ppt_history");
  renderHistory();
});

$("download-btn").addEventListener("click", async () => {
  if (!latestDeck) return;
  latestDeck.themeName = $("theme-select").value;
  latestDeck.wantPlaceholders = $("want-placeholders").checked;
  await generateAndDownloadPptx(latestDeck);
});

async function initApp() {
  renderSwatches($("theme-select").value);
  $("theme-select").addEventListener("change", (e) => renderSwatches(e.target.value));
  renderHistory();

  try {
    const res = await fetch("/.netlify/functions/config");
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.password_required) {
        $("password-box").classList.remove("hidden");
      }
    }
  } catch (_) {}
}

$("generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = $("youtube-url").value.trim();
  const manualText = $("manual-transcript").value.trim();
  const langLabel = $("lang-select").value;
  const detailLabel = $("detail-select").value;
  const themeName = $("theme-select").value;
  const wantPlaceholders = $("want-placeholders").checked;
  const password = $("app-password").value.trim();

  if (!url) return;

  $("error-card").classList.add("hidden");
  $("result-card").classList.add("hidden");
  $("progress-card").classList.remove("hidden");
  $("submit-btn").disabled = true;
  $("btn-text").textContent = "⏳ Generating Slides...";

  const headers = { "Content-Type": "application/json" };
  if (password) headers["X-App-Password"] = password;

  try {
    setProgress(8, "Reading video details & fetching transcript...", "Step 1 of 3 · Fetching Lecture");
    const trData = await safeFetchJson("/.netlify/functions/transcript", {
      method: "POST",
      headers,
      body: JSON.stringify({ url })
    });

    const notes = [];
    let snips = [];
    let videoMode = false;

    if (manualText.length >= 100) {
      snips = parseManualTranscript(manualText);
    } else if (trData.transcript_available && trData.snippets.length > 0) {
      snips = trData.snippets;
    } else {
      videoMode = true;
      notes.push("Auto-captions were unavailable, so Gemini watched the video directly.");
    }

    const parts = [];
    if (!videoMode) {
      const { chunks, truncated } = splitChunks(snips);
      if (!chunks.length) throw new Error("Transcript was too short to build slides.");
      if (truncated) notes.push("Video was very long, so only the first ~2 hours were processed.");

      for (let i = 0; i < chunks.length; i++) {
        const pct = Math.round(18 + (68 * i) / chunks.length);
        setProgress(
          pct,
          `Designing exact slides for section ${i + 1} of ${chunks.length}...`,
          "Step 2 of 3 · AI Structuring Slides"
        );
        const chData = await safeFetchJson("/.netlify/functions/generate-chunk", {
          method: "POST",
          headers,
          body: JSON.stringify({
            chunk_text: chunks[i].text,
            time_range: `${fmtTs(chunks[i].start)} to ${fmtTs(chunks[i].end)}`,
            idx: i + 1,
            total: chunks.length,
            is_first: i === 0,
            lang_label: langLabel,
            detail_label: detailLabel,
            video_mode: false
          })
        });
        parts.push(chData);
      }
    } else {
      // Fast 3-minute micro-segments so Netlify never hits 10s timeout
      const segments = [[0, 180], [180, 360], [360, 540], [540, 720]];
      for (let i = 0; i < segments.length; i++) {
        const pct = Math.round(20 + (65 * i) / segments.length);
        setProgress(
          pct,
          `Watching video segment ${i + 1} of ${segments.length}...`,
          "Step 2 of 3 · AI Watching Video"
        );
        try {
          const segData = await safeFetchJson("/.netlify/functions/generate-chunk", {
            method: "POST",
            headers,
            body: JSON.stringify({
              video_id: trData.video_id,
              start_sec: segments[i][0],
              end_sec: segments[i][1],
              idx: i + 1,
              total: segments.length,
              is_first: i === 0,
              lang_label: langLabel,
              detail_label: detailLabel,
              video_mode: true
            })
          });
          if (!segData.slides || !segData.slides.length) break;
          parts.push(segData);
        } catch (segErr) {
          if (parts.length > 0) break;
          throw segErr;
        }
      }
    }

    const allSlides = [];
    const allTakeaways = [];
    const allQuiz = [];
    let tagline = "";
    let cover = null;

    for (const p of parts) {
      if (p.tagline && !tagline) tagline = p.tagline;
      if (p.cover && !cover) cover = p.cover;
      for (const s of (p.slides || [])) {
        if (!s.heading) continue;
        if (allSlides.length && allSlides[allSlides.length - 1].heading.toLowerCase() === s.heading.toLowerCase()) {
          continue;
        }
        allSlides.push(s);
      }
      for (const t of (p.takeaways || [])) {
        if (t && !allTakeaways.some((x) => x.toLowerCase() === t.toLowerCase())) {
          allTakeaways.push(t);
        }
      }
      for (const q of (p.quiz || [])) {
        if (q && q.q) allQuiz.push(q);
      }
    }

    if (!allSlides.length) throw new Error("No slides could be generated from this lecture.");

    const shotSlotsCount = wantPlaceholders ? allSlides.filter((s) => s.needs_screenshot).length : 0;
    if (shotSlotsCount > 0) {
      notes.push(`Reserved ${shotSlotsCount} clickable screenshot drop-zone(s) with timestamps where code or board diagrams appear.`);
    }

    setProgress(95, "Building & downloading your PowerPoint deck...", "Step 3 of 3 · Compiling .PPTX");

    const cleanTitle = (trData.title || "Lecture").slice(0, 80);
    latestDeck = {
      videoId: trData.video_id,
      title: cleanTitle,
      tagline,
      channel: trData.channel,
      slides: allSlides,
      takeaways: allTakeaways.slice(0, 6),
      quiz: allQuiz.slice(0, 5),
      rtl: langLabel.startsWith("Urdu"),
      themeName,
      cover,
      wantPlaceholders
    };

    $("progress-card").classList.add("hidden");
    $("result-card").classList.remove("hidden");
    $("result-title").textContent = cleanTitle;
    $("stat-slides").textContent = allSlides.length;
    $("stat-visuals").textContent = allSlides.filter((s) => s.visual && s.visual.type).length;
    $("stat-shots").textContent = shotSlotsCount;

    $("result-notes").innerHTML = notes.map((n) => `<div class="note-pill">ℹ️ ${escapeHtml(n)}</div>`).join("");

    $("outline-list").innerHTML = allSlides.map((s, i) => {
      const vType = s.visual && s.visual.type ? String(s.visual.type).toLowerCase() : null;
      const icon = VIS_ICON[vType] || "🧩";
      const shotTag = (wantPlaceholders && s.needs_screenshot)
        ? `<span class="shot-badge">📸 Drop-Zone</span>`
        : "";
      return `
        <div class="outline-item">
          <div class="outline-left">
            <span>${icon}</span>
            <span>${i + 1}. ${escapeHtml(s.heading)}</span>
            ${shotTag}
          </div>
          <span class="ts-tag">${escapeHtml(s.timestamp || "--:--")}</span>
        </div>`;
    }).join("");

    saveToHistory({ title: cleanTitle, slides: allSlides.length, theme: themeName });
    await generateAndDownloadPptx(latestDeck);

    $("submit-btn").disabled = false;
    $("btn-text").textContent = "✨ Generate Presentation";
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  }
});

initApp();
