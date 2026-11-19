const { GoogleGenAI } = require("@google/genai");

const LANGS = {
  "English": "English",
  "Urdu (اردو)": "Urdu (written in clean Urdu/Arabic script)",
  "Roman Urdu": "Roman Urdu (Urdu written in English letters)",
  "Same as the video": "the exact same language spoken in the video"
};

const DETAIL = {
  "Brief": "3-4",
  "Standard": "5-6",
  "Detailed": "7-8"
};

const SCHEMA_HELP = `
Slide JSON schema:
{
 "heading": "exact topic title (max 8 words)",
 "bullets": ["0-3 short factual lines (max 12 words each), use **bold** for key terms/formulas"],
 "visual": null OR one of:
   {"type":"nested","items":["Outer","Middle","Inner"]}
   {"type":"flow","items":["Step 1","Step 2","Step 3"],"direction":"vertical"}
   {"type":"cards","items":[{"icon":"📌","title":"Term","text":"Short exact definition"}]}
   {"type":"steps","items":[{"title":"Step 1","text":"Exact action"}]}
   {"type":"table","headers":["Criteria","A","B"],"rows":[["Row","x","y"]]}
   {"type":"tree","root":{"label":"Topic","children":[{"label":"Part","children":[{"label":"Sub"}]}]}}
   {"type":"network","layers":[4,6,6,2],"labels":["Input","Hidden","Output"]}
   {"type":"code","language":"python","code":"line1\\nline2"}
   {"type":"compare","left":{"title":"A","points":["..."]},"right":{"title":"B","points":["..."]}}
 "footer": "optional one-line key formula or rule",
 "notes": "2-4 sentences speaker notes with exact numbers, formulas & examples",
 "timestamp": "MM:SS",
 "needs_screenshot": true or false,
 "screenshot_hint": "4-7 word label of what screenshot to paste here"
}
`;

function buildSystemPrompt(lang, perChunk, isFirst, videoMode) {
  const src = videoMode
    ? "a short segment of a lecture VIDEO (extract spoken concepts + code/diagrams shown on screen)"
    : "one timestamped section of a lecture TRANSCRIPT";

  const coverRule = isFirst
    ? `\n- First section ONLY: also return "tagline" (max 6 words) and "cover" (nested, flow, tree, or network visual).`
    : "";
  const coverTail = isFirst ? `, "tagline": "...", "cover": {...}` : "";

  return `You are an expert academic presentation designer receiving ${src}. Be 100% factually accurate to the lecture.
${SCHEMA_HELP}
Rules:
- Create ${perChunk} crisp slides in strict chronological order.
- Zero hallucination: every term, number, formula, and code line must come from the lecture.
- Set "needs_screenshot": true + clear "screenshot_hint" whenever live code, IDE output, diagram, chart, or board notes appear on screen.
- At least 60% of slides must have a visual. With table/cards/steps/tree/compare use NO bullets (use footer instead).
- Output language: ${lang}.
- Return "takeaways": 2 key takeaways, and "quiz": 1-2 factual questions [{"q":"...","a":"..."}].${coverRule}
- Return ONLY valid JSON: {"slides": [...], "takeaways": ["..."], "quiz": [{"q":"...","a":"..."}]${coverTail}}`;
}

function parseJsonSafe(raw) {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("AI returned invalid JSON.");
  return JSON.parse(s.slice(a, b + 1));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isBusyErr = (m) => /503|overloaded|unavailable|high demand/i.test(m);
const isQuotaErr = (m) => /429|quota|resource_exhausted/i.test(m);
const isModelErr = (m) => /404|not found|no longer available|not supported|invalid model/i.test(m);
const isKeyErr = (m) => /api_key|api key|permission_denied|unauthenticated/i.test(m);

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { detail: "Method not allowed" });
  }

  const requiredPw = (process.env.APP_PASSWORD || "").trim();
  const sentPw = (event.headers["x-app-password"] || event.headers["X-App-Password"] || "").trim();
  if (requiredPw && sentPw !== requiredPw) {
    return jsonResponse(401, { detail: "Incorrect or missing App Password." });
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return jsonResponse(500, { detail: "GEMINI_API_KEY is missing in Netlify Environment Variables." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { detail: "Invalid request JSON." });
  }

  const lang = LANGS[body.lang_label] || "English";
  const perChunk = DETAIL[body.detail_label] || "5-6";
  const isFirst = Boolean(body.is_first);
  const videoMode = Boolean(body.video_mode);
  const idx = Number(body.idx || 1);
  const total = Number(body.total || 1);

  const ai = new GoogleGenAI({ apiKey });

  // Model chain: primary first, then fallbacks.
  // Purane models (gemini-2.5-flash / flash-lite) hata diye gaye hain kyun ke wo naye users ke liye band ho rahe hain.
  const primary = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const models = [...new Set([primary, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"])];

  const systemInstruction = buildSystemPrompt(lang, perChunk, isFirst, videoMode);

  let contents;
  if (videoMode && body.video_id) {
    const startSec = Math.max(0, Math.floor(Number(body.start_sec || 0)));
    const endSec = Math.max(startSec + 30, Math.floor(Number(body.end_sec || 180)));
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    contents = [
      { fileData: { fileUri: `https://www.youtube.com/watch?v=${body.video_id}` } },
      `Section ${idx}/${total}: Analyze ONLY minute ${fmt(startSec)} to ${fmt(endSec)} of this video. Extract exact concepts & on-screen code/diagrams.`
    ];
  } else {
    const chunkText = String(body.chunk_text || "").trim();
    if (!chunkText) {
      return jsonResponse(400, { detail: "Empty transcript chunk." });
    }
    contents = `Section ${idx}/${total} (${body.time_range || ""}):\n\n${chunkText}`;
  }

  let sawBusy = false;
  let sawQuota = false;
  let lastMsg = "";

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });
      const parsed = parseJsonSafe(response.text);
      return jsonResponse(200, parsed);
    } catch (err) {
      const m = (err && err.message) ? err.message : "";
      lastMsg = m;

      if (isKeyErr(m)) break; // key galat hai, dusra model try karna bekar

      if (isBusyErr(m)) sawBusy = true;
      if (isQuotaErr(m)) sawQuota = true;

      // Busy / quota / model band / bad JSON -> agla model try karo
      if (isBusyErr(m) || isQuotaErr(m) || isModelErr(m) || /invalid json/i.test(m)) {
        if (i < models.length - 1) {
          await sleep(400);
          continue;
        }
      }
      break;
    }
  }

  let friendly = `AI Error: ${lastMsg.slice(0, 180) || "AI generation failed."}`;
  let status = 500;

  if (isKeyErr(lastMsg)) {
    friendly = "Invalid GEMINI_API_KEY in Netlify Environment Variables.";
  } else if (sawBusy) {
    friendly = "Google Gemini servers are temporarily busy (503). Wait 15 seconds and click Generate again.";
    status = 503;
  } else if (sawQuota) {
    friendly = "Free Gemini rate limit reached. Wait 30 seconds and try again.";
    status = 429;
  } else if (isModelErr(lastMsg)) {
    friendly = "Gemini model name is no longer available. In Netlify, set GEMINI_MODEL to gemini-3.8-flash (or delete that variable) and redeploy.";
  }

  return jsonResponse(status, { detail: friendly });
};
