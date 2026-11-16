const { YoutubeTranscript } = require("youtube-transcript");

function extractVideoId(url) {
  const s = (url || "").trim();
  const m = s.match(/(?:v=|\/videos\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}

function decodeXmlEntities(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCaptionsFallback(vid) {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();
    const match = html.match(/"captionTracks":(\[.*?\])/);
    if (!match) return [];
    const tracks = JSON.parse(match[1]);
    if (!Array.isArray(tracks) || !tracks.length) return [];

    // Prefer manual English/Urdu/Hindi, else first available track
    const preferred =
      tracks.find((t) => /^(en|ur|hi)/i.test(t.languageCode) && t.kind !== "asr") ||
      tracks.find((t) => /^(en|ur|hi)/i.test(t.languageCode)) ||
      tracks[0];

    if (!preferred || !preferred.baseUrl) return [];
    const xmlRes = await fetch(preferred.baseUrl);
    if (!xmlRes.ok) return [];
    const xml = await xmlRes.text();

    const snippets = [];
    const textRegex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = textRegex.exec(xml)) !== null) {
      const clean = decodeXmlEntities(m[3]);
      if (clean) {
        snippets.push({
          start: parseFloat(m[1]) || 0,
          duration: parseFloat(m[2]) || 3,
          text: clean
        });
      }
    }
    return snippets;
  } catch {
    return [];
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ detail: "Method not allowed" }) };
  }

  const requiredPw = (process.env.APP_PASSWORD || "").trim();
  const sentPw = (event.headers["x-app-password"] || event.headers["X-App-Password"] || "").trim();
  if (requiredPw && sentPw !== requiredPw) {
    return { statusCode: 401, body: JSON.stringify({ detail: "Incorrect or missing App Password." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ detail: "Invalid request JSON." }) };
  }

  const vid = extractVideoId(body.url);
  if (!vid) {
    return { statusCode: 400, body: JSON.stringify({ detail: "Invalid YouTube link. Please check and try again." }) };
  }

  let title = "Lecture";
  let channel = "";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}`;
    const r = await fetch(oembedUrl);
    if (r.ok) {
      const meta = await r.json();
      title = meta.title || "Lecture";
      channel = meta.author_name || "";
    }
  } catch (_) {}

  let snippets = [];
  for (const lang of ["ur", "hi", "en", undefined]) {
    try {
      const items = lang
        ? await YoutubeTranscript.fetchTranscript(vid, { lang })
        : await YoutubeTranscript.fetchTranscript(vid);
      if (items && items.length > 0) {
        snippets = items
          .map((it) => ({
            start: Number(it.offset || 0) / 1000,
            duration: Number(it.duration || 3000) / 1000,
            text: String(it.text || "").replace(/\s+/g, " ").trim()
          }))
          .filter((x) => x.text);
        if (snippets.length > 0) break;
      }
    } catch (_) {}
  }

  if (!snippets.length) {
    snippets = await fetchCaptionsFallback(vid);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: vid,
      title,
      channel,
      snippets,
      transcript_available: snippets.length > 0
    })
  };
};
