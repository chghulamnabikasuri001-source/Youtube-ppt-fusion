const { YoutubeTranscript } = require("youtube-transcript");

function extractVideoId(url) {
  const s = (url || "").trim();
  const m = s.match(/(?:v=|\/videos\/|embed\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
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

  // Fetch video title & channel via oEmbed
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

  // Try fetching transcript in Urdu, Hindi, or English
  let snippets = [];
  let transcriptError = null;
  for (const lang of ["ur", "hi", "en", undefined]) {
    try {
      const items = lang
        ? await YoutubeTranscript.fetchTranscript(vid, { lang })
        : await YoutubeTranscript.fetchTranscript(vid);
      if (items && items.length > 0) {
        snippets = items.map((it) => ({
          start: Number(it.offset || 0) / 1000,
          duration: Number(it.duration || 3000) / 1000,
          text: String(it.text || "").replace(/\s+/g, " ").trim()
        })).filter((x) => x.text);
        if (snippets.length > 0) break;
      }
    } catch (e) {
      transcriptError = e.message || "Transcript unavailable";
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: vid,
      title,
      channel,
      snippets,
      transcript_available: snippets.length > 0,
      transcript_error: transcriptError
    })
  };
};
