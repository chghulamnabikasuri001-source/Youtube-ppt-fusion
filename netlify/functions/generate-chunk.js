const { GoogleGenAI } = require("@google/genai");

const LANGS = {
  "English": "English",
  "Urdu (اردو)": "Urdu (written in clean Urdu/Arabic script)",
  "Roman Urdu": "Roman Urdu (Urdu written in English letters)",
  "Same as the video": "the exact same language spoken in the video"
};

const DETAIL = {
  "Brief": "4-5",
  "Standard": "6-8",
  "Detailed": "9-12"
};

const SCHEMA_HELP = `
Each slide is a JSON object:
{
 "heading": "short, exact topic title from the lecture (max 8 words)",
 "bullets": ["0-4 SHORT, factual lines (max 12 words each). Use **bold** for exact terms/formulas, e.g. \\"**Bayes Theorem**: P(A|B) = P(B|A)P(A)/P(B)\\""],
 "visual": null OR exactly one of:
   {"type":"nested","items":["Outer set","Middle set","Inner set"]}                 // sets inside sets, 2-4 items, outermost first
   {"type":"flow","items":["Step 1","Step 2","Step 3"],"direction":"vertical"}      // exact process, pipeline, cause->effect (2-6 items)
   {"type":"cards","items":[{"icon":"📌","title":"Exact term","text":"Exact short definition or example"}]}   // 2-4 categories/examples
   {"type":"steps","items":[{"title":"Step 1","text":"Exact action"}]}              // ordered stages (2-5)
   {"type":"table","headers":["Criteria","Option A","Option B"],"rows":[["Feature","x","y"]]} // comparison table, max 6 rows, max 4 cols
   {"type":"tree","root":{"label":"Topic","children":[{"label":"Part","children":[{"label":"Sub-part"}]}]}}  // hierarchy/taxonomy, max 3 levels
   {"type":"network","layers":[4,6,6,2],"labels":["Input","Hidden layers","Output"]}  // ONLY when neural network layers are discussed
   {"type":"code","language":"python","code":"line1\\nline2"}                          // exact code/commands explained (max 12 lines)
   {"type":"compare","left":{"title":"A","points":["..."]},"right":{"title":"B","points":["..."]}}   // two-sided contrast
 "footer": "optional one-line key formula, rule, or takeaway from the lecture",
 "notes": "speaker notes: 3-6 sentences with the EXACT explanation, numbers, formulas, and examples the teacher gave",
 "timestamp": "MM:SS",  // exact [MM:SS] timestamp from the transcript where this topic starts
 "needs_screenshot": true or false, // true ONLY when the teacher is showing code, a whiteboard diagram, complex equation, or important visual on screen that the user should paste a screenshot of
 "screenshot_hint": "short 4-8 word label of what screenshot to paste here, e.g. 'Paste Python loop output from 04:15'"
}
`;

function buildSystemPrompt(lang, perChunk, isFirst, videoMode) {
  const src = videoMode
    ? "a segment of a lecture VIDEO (extract BOTH spoken explanations AND exact text, formulas, diagrams, and code shown on screen)"
    : "one timestamped section of a lecture TRANSCRIPT (fix speech-to-text spelling errors on technical terms silently)";

  const coverRule = isFirst
    ? `\n- Because this is the FIRST section, also return "tagline" (short subtitle, max 6 words) and "cover" (one visual object of type nested, flow, tree, or network representing the main lecture topic).`
    : "";
  const coverTail = isFirst ? `, "tagline": "...", "cover": {...}` : "";

  return `You are an expert academic assistant and presentation designer. You receive ${src}.
Your #1 priority is **100% FACTUAL ACCURACY** to what is actually taught in the video.

${SCHEMA_HELP}
Strict Rules:
- Create about ${perChunk} slides in strict chronological order matching the video timestamps.
- **NO HALLUCINATION / NO FLUFF**: Every heading, bullet, table cell, diagram label, and code snippet MUST come directly from the teacher's actual words, numbers, formulas, and examples. Never invent generic filler points.
- Preserve exact technical terms, variable names, equations, numbers, and real examples mentioned by the teacher.
- Keep slide text crisp (max 12 words per bullet), and put the full detailed explanation + worked examples in "notes".
- **SCREENSHOT PLACEHOLDER RULE**: If the teacher is demonstrating live code, IDE output, a diagram, chart, or important board notes on screen at that timestamp, set "needs_screenshot": true and write a clear "screenshot_hint" (with the timestamp). If a slide has BOTH a diagram ("visual") AND "needs_screenshot": true, keep both so the builder can reserve a clean screenshot slot!
- At least 65% of slides should have a visual that models the concept explained in that moment. Vary visual types naturally.
- With table / cards / steps / tree / compare use NO bullets and use "footer" instead. With nested / flow / network / code use 2-3 bullets.
- Skip intros, sponsor reads, greetings, and "like & subscribe" chatter.
- Output language for all text: ${lang}. (Keep code syntax and standard technical symbols accurate).
- Also return "takeaways": 2-3 exact key takeaways from this section, and "quiz": 1-2 factual questions [{"q":"...","a":"..."}] based strictly on this section.${coverRule}
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
  const perChunk = DETAIL[body.detail_label] || "6-8";
  const isFirst = Boolean(body.is_first);
  const videoMode = Boolean(body.video_mode);
  const idx = Number(body.idx || 1);
  const total = Number(body.total || 1);

  const ai = new GoogleGenAI({ apiKey });
  const primaryModel = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const models = [primaryModel, "gemini-2.0-flash"].filter((v, i, a) => a.indexOf(v) === i);

  const systemInstruction = buildSystemPrompt(lang, perChunk, isFirst, videoMode);
  let contents;

  if (videoMode && body.video_id) {
    const startSec = Math.max(0, Math.floor(Number(body.start_sec || 0)));
    const endSec = Math.max(startSec + 30, Math.floor(Number(body.end_sec || 480)));
    const startMin = Math.floor(startSec / 60);
    const endMin = Math.floor(endSec / 60);
    contents = [
      {
        fileData: { fileUri: `https://www.youtube.com/watch?v=${body.video_id}` }
      },
      `This is segment ${idx} of ${total} of the lecture. Focus ONLY on the portion of the video from minute ${startMin}:00 to ${endMin}:00. Watch and listen carefully to extract exact spoken concepts AND on-screen code/diagrams.`
    ];
  } else {
    const chunkText = String(body.chunk_text || "").trim();
    if (!chunkText) {
      return { statusCode: 400, body: JSON.stringify({ detail: "Empty transcript chunk." }) };
    }
    contents = `This is section ${idx} of ${total} of the lecture (${body.time_range || ""}).\nExtract the EXACT concepts, formulas, code, and examples taught here:\n\n${chunkText}`;
  }

  let lastErr = null;
  for (const model of models) {
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
      lastErr = err;
    }
  }

  const msg = (lastErr && lastErr.message) ? lastErr.message : "AI generation failed.";
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
};
