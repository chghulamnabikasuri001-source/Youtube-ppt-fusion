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
  "Detailed": "7-9"
};

const SCHEMA_HELP = `
Each slide is a JSON object:
{
 "heading": "short, exact topic title from the lecture (max 8 words)",
 "bullets": ["0-3 SHORT, factual lines (max 12 words each). Use **bold** for exact terms/formulas"],
 "visual": null OR one of:
   {"type":"nested","items":["Outer set","Middle set","Inner set"]}
   {"type":"flow","items":["Step 1","Step 2","Step 3"],"direction":"vertical"}
   {"type":"cards","items":[{"icon":"📌","title":"Exact term","text":"Short definition"}]}
   {"type":"steps","items":[{"title":"Step 1","text":"Exact action"}]}
   {"type":"table","headers":["Criteria","A","B"],"rows":[["Feature","x","y"]]}
   {"type":"tree","root":{"label":"Topic","children":[{"label":"Part","children":[{"label":"Sub"}]}]}}
   {"type":"network","layers":[4,6,6,2],"labels":["Input","Hidden","Output"]}
   {"type":"code","language":"python","code":"line1\\nline2"}
   {"type":"compare","left":{"title":"A","points":["..."]},"right":{"title":"B","points":["..."]}}
 "footer": "optional one-line key formula or rule",
 "notes": "2-4 sentences speaker notes with exact explanation and examples",
 "timestamp": "MM:SS",
 "needs_screenshot": true or false,
 "screenshot_hint": "short 4-7 word label of what screenshot to paste here"
}
`;

function buildSystemPrompt(lang, perChunk, isFirst, videoMode) {
  const src = videoMode
    ? "a segment of a lecture VIDEO (extract spoken concepts + code/diagrams shown on screen)"
    : "one timestamped section of a lecture TRANSCRIPT";

  const coverRule = isFirst
    ? `\n- Because this is the FIRST section, also return "tagline" (max 6 words) and "cover" (nested, flow, tree, or network visual).`
    : "";
  const coverTail = isFirst ? `, "tagline": "...", "cover": {...}` : "";

  return `You are an expert presentation designer receiving ${src}. Be 100% factually accurate to the lecture.
${SCHEMA_HELP}
Rules:
- Create ${perChunk} crisp slides in chronological order.
- Never invent generic filler; use exact terms, formulas, and examples from the lecture.
- Set "needs_screenshot": true with a clear "screenshot_hint" whenever live code, IDE output, diagram, or board notes appear on screen.
- At least 60% of slides should have a visual. With table/cards/steps/tree/compare use NO bullets (use footer instead).
- Output language: ${lang}.
- Also return "takeaways": 2 key takeaways, and "quiz": 1-2 questions [{"q":"...","a":"..."}].${coverRule}
- Return ONLY valid JSON: {"slides": [...], "takeaways": ["..."], "quiz": [{"q":"...","a":"..."}]${coverTail}}`;
}

function parseJsonSafe(raw) {
  let s = (raw || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("AI did not return valid JSON.");
  return JSON.parse(s.slice(a, b + 1));
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

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ detail: "GEMINI_API_KEY is missing in Netlify Environment Variables." }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ detail: "Invalid request JSON." }) };
  }

  const lang = LANGS[body.lang_label] || "English";
  const perChunk = DETAIL[body.detail_label] || "5-6";
  const isFirst = Boolean(body.is_first);
  const videoMode = Boolean(body.video_mode);
  const idx = Number(body.idx || 1);
  const total = Number(body.total || 1);

  const ai = new GoogleGenAI({ apiKey });
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

  const systemInstruction = buildSystemPrompt(lang, perChunk, isFirst, videoMode);
  let contents;

  if (videoMode && body.video_id) {
    const startSec = Math.max(0, Math.floor(Number(body.start_sec || 0)));
    const endSec = Math.max(startSec + 30, Math.floor(Number(body.end_sec || 300)));
    const startMin = Math.floor(startSec / 60);
    const endMin = Math.floor(endSec / 60);
    contents = [
      {
        fileData: { fileUri: `https://www.youtube.com/watch?v=${body.video_id}` }
      },
      `Section ${idx}/${total}: Focus ONLY on minute ${startMin}:00 to ${endMin}:00 of this video. Extract exact concepts & on-screen code/diagrams.`
    ];
  } else {
    const chunkText = String(body.chunk_text || "").trim();
    if (!chunkText) {
      return { statusCode: 400, body: JSON.stringify({ detail: "Empty transcript chunk." }) };
    }
    contents = `Section ${idx}/${total} (${body.time_range || ""}):\n\n${chunkText}`;
  }

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
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    const msg = (err && err.message) ? err.message : "AI generation failed.";
    let friendly = `AI Error: ${msg.slice(0, 180)}`;
    if (/429|quota|resource_exhausted/i.test(msg)) {
      friendly = "Free Gemini rate limit reached. Wait 30 seconds and try again.";
    } else if (/api_key|permission_denied|unauthenticated/i.test(msg)) {
      friendly = "Invalid GEMINI_API_KEY in Netlify Environment Variables.";
    }
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: friendly })
    };
  }
};
