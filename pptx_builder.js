/**
 * Native PptxGenJS Slide Builder with Sleek Visuals + Smart Screenshot Drop-Zone Placeholders
 */
const THEMES = {
  "Classroom": {
    dark: "111A2E", light: "F6F3EC", surface_dark: "1F2D4E", surface_light: "FFFFFF",
    ink: "1B2540", on_dark: "F6F3EC", muted: "5B6478",
    acc: ["1FB5A3", "F28C3E", "2A7090", "1F2D4E"], head: "Trebuchet MS", body: "Calibri"
  },
  "Ocean Blue": {
    dark: "0B2A4A", light: "F0F7FF", surface_dark: "16406B", surface_light: "FFFFFF",
    ink: "0F2A47", on_dark: "F0F7FF", muted: "53708F",
    acc: ["2E9BE8", "FFB142", "1B6FB5", "123B66"], head: "Georgia", body: "Calibri"
  },
  "Midnight Indigo": {
    dark: "0F172A", light: "F8FAFC", surface_dark: "1E293B", surface_light: "FFFFFF",
    ink: "0F172A", on_dark: "F8FAFC", muted: "64748B",
    acc: ["6366F1", "EC4899", "06B6D4", "312E81"], head: "Trebuchet MS", body: "Calibri"
  },
  "Forest": {
    dark: "12372A", light: "F4F8F1", surface_dark: "1E5240", surface_light: "FFFFFF",
    ink: "14301F", on_dark: "F4F8F1", muted: "5A7266",
    acc: ["2E9E6B", "F2A541", "4C8C7A", "1F5C45"], head: "Georgia", body: "Trebuchet MS"
  },
  "Sunset": {
    dark: "2B1B3D", light: "FFF6F0", surface_dark: "3E2A59", surface_light: "FFFFFF",
    ink: "2B1B3D", on_dark: "FFF6F0", muted: "7A6A8A",
    acc: ["FF6B6B", "FFA94D", "845EF7", "3B2A5E"], head: "Trebuchet MS", body: "Verdana"
  },
  "Graphite": {
    dark: "18181B", light: "FAFAFA", surface_dark: "27272A", surface_light: "FFFFFF",
    ink: "18181B", on_dark: "FAFAFA", muted: "71717A",
    acc: ["10B981", "F59E0B", "3B82F6", "3F3F46"], head: "Calibri", body: "Calibri"
  }
};

const W = 13.333;
const H = 7.5;

function lum(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function textOn(T, fillHex) {
  return lum(fillHex) > 0.55 ? T.ink : T.on_dark;
}

function parseBoldRuns(text, baseOpts) {
  const parts = String(text || "").split(/(\*\*.+?\*\*)/g).filter(Boolean);
  if (!parts.length) return [{ text: "", options: baseOpts }];
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return { text: p.slice(2, -2), options: { ...baseOpts, bold: true } };
    }
    return { text: p, options: { ...baseOpts } };
  });
}

function makeCtx(T, dark, rtl) {
  return {
    T,
    dark,
    rtl,
    bg: dark ? T.dark : T.light,
    text: dark ? T.on_dark : T.ink,
    surface: dark ? T.surface_dark : T.surface_light,
    line: dark ? "3E4F78" : "CBD5E1",
    headFont: rtl ? "Arial" : T.head,
    bodyFont: rtl ? "Arial" : T.body,
    pal: [T.acc[3], T.acc[2], T.acc[0], T.acc[1]],
    cards: [T.acc[0], T.acc[1], T.acc[2], T.acc[3]]
  };
}

function mx(ctx, x, w) {
  return ctx.rtl ? W - x - w : x;
}

function newStyledSlide(pptx, ctx) {
  const slide = pptx.addSlide();
  slide.background = { color: ctx.bg };
  // Sleek top accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 0.08,
    fill: { color: ctx.T.acc[0] },
    line: { type: "none" }
  });
  return slide;
}

function addHeaderWithPill(pptx, slide, ctx, heading, x, y, w, h, fontSize = 28) {
  const pillX = ctx.rtl ? x + w - 0.10 : x;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: pillX, y: y + 0.15, w: 0.10, h: h - 0.30,
    fill: { color: ctx.T.acc[1] },
    line: { type: "none" },
    rectRadius: 0.05
  });
  const tx = ctx.rtl ? x : x + 0.24;
  slide.addText(heading, {
    x: tx, y, w: w - 0.28, h,
    fontFace: ctx.headFont,
    fontSize,
    bold: true,
    color: ctx.text,
    align: ctx.rtl ? "right" : "left",
    valign: "middle",
    rtlMode: ctx.rtl
  });
}

function addFooter(pptx, slide, ctx, text) {
  if (!text) return;
  slide.addShape(pptx.ShapeType.line, {
    x: 0.7, y: 6.42, w: W - 1.4, h: 0,
    line: { color: ctx.line, width: 1 }
  });
  slide.addText(text, {
    x: 0.7, y: 6.46, w: W - 1.4, h: 0.62,
    fontFace: ctx.headFont,
    fontSize: 15,
    bold: true,
    color: ctx.dark ? ctx.T.acc[0] : ctx.T.acc[2],
    align: ctx.rtl ? "right" : "left",
    valign: "middle",
    rtlMode: ctx.rtl
  });
}

function addPageNo(slide, ctx, idx, total) {
  slide.addText(`${idx} / ${total}`, {
    x: ctx.rtl ? 0.3 : W - 1.5,
    y: 7.08,
    w: 1.2,
    h: 0.28,
    fontFace: ctx.bodyFont,
    fontSize: 10,
    color: ctx.T.muted,
    align: ctx.rtl ? "left" : "right"
  });
}

/**
 * Draws a sleek dashed Screenshot Drop-Zone placeholder box on the slide
 * so the user knows exact timestamp & what screenshot to paste there!
 */
function drawScreenshotPlaceholder(pptx, slide, ctx, hint, timestamp, x, y, w, h) {
  // Outer card background
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: ctx.surface },
    line: { color: ctx.T.acc[1], width: 2, dashType: "dash" },
    rectRadius: 0.12
  });

  // Top timestamp pill
  const badgeW = 2.1;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + (w - badgeW) / 2,
    y: y + h * 0.22,
    w: badgeW,
    h: 0.42,
    fill: { color: ctx.T.acc[1] },
    line: { type: "none" },
    rectRadius: 0.2
  });
  slide.addText(`📸  ${timestamp || "VIDEO FRAME"}`, {
    x: x + (w - badgeW) / 2,
    y: y + h * 0.22,
    w: badgeW,
    h: 0.42,
    fontFace: ctx.headFont,
    fontSize: 12,
    bold: true,
    color: textOn(ctx.T, ctx.T.acc[1]),
    align: "center",
    valign: "middle"
  });

  // Main instruction text
  const label = hint || "Paste Screenshot from Video Here";
  slide.addText(label, {
    x: x + 0.35,
    y: y + h * 0.38,
    w: w - 0.7,
    h: 0.95,
    fontFace: ctx.headFont,
    fontSize: 17,
    bold: true,
    color: ctx.text,
    align: "center",
    valign: "middle"
  });

  // Helper caption
  slide.addText("Drag & drop or paste (Ctrl+V) your video frame inside this box", {
    x: x + 0.35,
    y: y + h * 0.62,
    w: w - 0.7,
    h: 0.55,
    fontFace: ctx.bodyFont,
    fontSize: 12,
    color: ctx.T.muted,
    align: "center",
    valign: "top"
  });
}

// ----------------------------------------------------------------------
// Visual Renderers
// ----------------------------------------------------------------------
function drawNested(pptx, slide, ctx, items, x, y, w, h) {
  const list = items.slice(0, 4);
  const n = list.length;
  const D = Math.min(w, h);
  const cx = x + w / 2;
  const bottom = y + (h + D) / 2;
  const ratios = { 2: [1, 0.62], 3: [1, 0.68, 0.36], 4: [1, 0.76, 0.52, 0.28] }[n] || [1, 0.65];
  const diam = ratios.map((r) => D * r);

  diam.forEach((d, i) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: cx - d / 2, y: bottom - d, w: d, h: d,
      fill: { color: ctx.pal[i % 4] },
      line: i === 0 && ctx.dark ? { color: ctx.line, width: 1.5 } : { type: "none" }
    });
  });

  diam.forEach((d, i) => {
    const fill = ctx.pal[i % 4];
    const isInner = i === n - 1;
    const band = isInner ? d : d - diam[i + 1];
    const ty = isInner ? bottom - d : bottom - d + 0.04;
    const th = isInner ? d : Math.max(band * 0.92, 0.32);
    const tw = d * 0.78;
    slide.addText(list[i], {
      x: cx - tw / 2, y: ty, w: tw, h: th,
      fontFace: ctx.headFont,
      fontSize: isInner ? 15 : 13,
      bold: true,
      color: textOn(ctx.T, fill),
      align: "center",
      valign: "middle"
    });
  });
}

function drawFlow(pptx, slide, ctx, items, x, y, w, h, direction = "vertical") {
  const list = items.slice(0, 6);
  const n = list.length;
  if (direction === "horizontal" && w > 7.5) {
    const gap = 0.48;
    const bw = Math.min((w - (n - 1) * gap) / n, 2.5);
    const bh = Math.min(h, 1.55);
    const total = n * bw + (n - 1) * gap;
    const x0 = x + (w - total) / 2;
    const y0 = y + (h - bh) / 2;
    list.forEach((txt, i) => {
      const bx = x0 + i * (bw + gap);
      const fill = ctx.pal[i % 4];
      slide.addShape(pptx.ShapeType.roundRect, {
        x: bx, y: y0, w: bw, h: bh,
        fill: { color: fill },
        line: { type: "none" },
        rectRadius: 0.12
      });
      slide.addText(txt, {
        x: bx + 0.08, y: y0 + 0.06, w: bw - 0.16, h: bh - 0.12,
        fontFace: ctx.headFont, fontSize: 14, bold: true,
        color: textOn(ctx.T, fill), align: "center", valign: "middle"
      });
      if (i < n - 1) {
        slide.addShape(pptx.ShapeType.rightArrow, {
          x: bx + bw + 0.08, y: y0 + bh / 2 - 0.15, w: gap - 0.16, h: 0.3,
          fill: { color: ctx.text }, line: { type: "none" }
        });
      }
    });
  } else {
    const gap = 0.36;
    const bw = Math.min(w, 5.1);
    const bh = Math.min((h - (n - 1) * gap) / n, 0.95);
    const total = n * bh + (n - 1) * gap;
    const x0 = x + (w - bw) / 2;
    const y0 = y + (h - total) / 2;
    list.forEach((txt, i) => {
      const by = y0 + i * (bh + gap);
      const fill = ctx.pal[i % 4];
      slide.addShape(pptx.ShapeType.roundRect, {
        x: x0, y: by, w: bw, h: bh,
        fill: { color: fill },
        line: { type: "none" },
        rectRadius: 0.14
      });
      slide.addText(txt, {
        x: x0 + 0.12, y: by + 0.05, w: bw - 0.24, h: bh - 0.1,
        fontFace: ctx.headFont, fontSize: 15, bold: true,
        color: textOn(ctx.T, fill), align: "center", valign: "middle"
      });
      if (i < n - 1) {
        slide.addShape(pptx.ShapeType.downArrow, {
          x: x0 + bw / 2 - 0.15, y: by + bh + 0.04, w: 0.3, h: gap - 0.08,
          fill: { color: ctx.text }, line: { type: "none" }
        });
      }
    });
  }
}

function drawCards(pptx, slide, ctx, items, x, y, w, h, numbered = false) {
  const list = items.slice(0, numbered ? 5 : 4);
  const n = list.length;
  const stacked = w < 8;

  if (!stacked) {
    const gap = 0.28;
    const cw = (w - (n - 1) * gap) / n;
    const ch = Math.min(h, 3.6);
    const cy = y + (h - ch) / 2;
    list.forEach((it, i) => {
      const cx = x + i * (cw + gap);
      const fill = numbered ? ctx.surface : ctx.cards[i % 4];
      const tc = numbered ? ctx.text : textOn(ctx.T, fill);
      slide.addShape(pptx.ShapeType.roundRect, {
        x: cx, y: cy, w: cw, h: ch,
        fill: { color: fill },
        line: numbered ? { color: ctx.line, width: 1 } : { type: "none" },
        rectRadius: 0.1
      });
      let top = cy + 0.25;
      if (numbered) {
        const badgeCol = ctx.cards[i % 4];
        slide.addShape(pptx.ShapeType.ellipse, {
          x: cx + 0.22, y: top, w: 0.5, h: 0.5,
          fill: { color: badgeCol }, line: { type: "none" }
        });
        slide.addText(String(i + 1), {
          x: cx + 0.22, y: top, w: 0.5, h: 0.5,
          fontFace: ctx.headFont, fontSize: 15, bold: true,
          color: textOn(ctx.T, badgeCol), align: "center", valign: "middle"
        });
        top += 0.65;
      } else if (it.icon) {
        slide.addText(it.icon, {
          x: cx + 0.2, y: top - 0.05, w: cw - 0.4, h: 0.7,
          fontSize: 28, align: "left"
        });
        top += 0.78;
      }
      slide.addText(it.title || "", {
        x: cx + 0.22, y: top, w: cw - 0.44, h: 0.7,
        fontFace: ctx.headFont, fontSize: 17, bold: true, color: tc, valign: "top"
      });
      if (it.text) {
        slide.addText(it.text, {
          x: cx + 0.22, y: top + 0.72, w: cw - 0.44, h: cy + ch - top - 0.85,
          fontFace: ctx.bodyFont, fontSize: 13.5, color: tc, valign: "top"
        });
      }
    });
  } else {
    const gap = 0.2;
    const rh = Math.min((h - (n - 1) * gap) / n, 1.35);
    const total = n * rh + (n - 1) * gap;
    const y0 = y + (h - total) / 2;
    list.forEach((it, i) => {
      const ry = y0 + i * (rh + gap);
      const fill = numbered ? ctx.surface : ctx.cards[i % 4];
      const tc = numbered ? ctx.text : textOn(ctx.T, fill);
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: ry, w, h: rh,
        fill: { color: fill },
        line: numbered ? { color: ctx.line, width: 1 } : { type: "none" },
        rectRadius: 0.1
      });
      const badgeCol = ctx.cards[i % 4];
      if (numbered) {
        slide.addShape(pptx.ShapeType.ellipse, {
          x: x + 0.2, y: ry + rh / 2 - 0.25, w: 0.5, h: 0.5,
          fill: { color: badgeCol }, line: { type: "none" }
        });
        slide.addText(String(i + 1), {
          x: x + 0.2, y: ry + rh / 2 - 0.25, w: 0.5, h: 0.5,
          fontFace: ctx.headFont, fontSize: 15, bold: true,
          color: textOn(ctx.T, badgeCol), align: "center", valign: "middle"
        });
      }
      const lead = numbered ? 0.85 : 0.25;
      slide.addText(
        [
          { text: (it.title || "") + (it.text ? "\n" : ""), options: { fontFace: ctx.headFont, fontSize: 15, bold: true, color: tc } },
          ...(it.text ? [{ text: it.text, options: { fontFace: ctx.bodyFont, fontSize: 12.5, color: tc } }] : [])
        ],
        { x: x + lead, y: ry + 0.05, w: w - lead - 0.2, h: rh - 0.1, valign: "middle" }
      );
    });
  }
}

function drawTable(pptx, slide, ctx, vis, x, y, w, h) {
  const headers = (vis.headers || []).slice(0, 4);
  const rows = (vis.rows || []).slice(0, 6);
  if (!headers.length || !rows.length) return;

  const headerFill = ctx.dark ? ctx.T.acc[2] : ctx.T.acc[3];
  const headerColor = textOn(ctx.T, headerFill);

  const tableRows = [
    headers.map((hd) => ({
      text: String(hd || ""),
      options: {
        fill: { color: headerFill },
        color: headerColor,
        bold: true,
        fontFace: ctx.headFont,
        fontSize: 15,
        align: ctx.rtl ? "right" : "left",
        valign: "middle"
      }
    })),
    ...rows.map((r, rIdx) =>
      headers.map((_, cIdx) => ({
        text: String((r && r[cIdx]) || ""),
        options: {
          fill: { color: rIdx % 2 === 0 ? ctx.surface : (ctx.dark ? ctx.T.dark : "EEF2F6") },
          color: ctx.text,
          bold: cIdx === 0,
          fontFace: ctx.bodyFont,
          fontSize: 14,
          align: ctx.rtl ? "right" : "left",
          valign: "middle"
        }
      }))
    )
  ];

  const rowH = Math.min(0.75, h / tableRows.length);
  slide.addTable(tableRows, {
    x,
    y: y + Math.max(0, (h - rowH * tableRows.length) / 2),
    w,
    rowH,
    border: { pt: 1, color: ctx.line }
  });
}

function drawTree(pptx, slide, ctx, root, x, y, w, h) {
  if (!root || !root.label) return;
  const kids = (root.children || []).slice(0, 4);
  const rootW = 3.2;
  const rootH = 0.8;
  const rx = x + (w - rootW) / 2;
  const ry = y + 0.25;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: rx, y: ry, w: rootW, h: rootH,
    fill: { color: ctx.pal[0] }, line: { type: "none" }, rectRadius: 0.14
  });
  slide.addText(root.label, {
    x: rx + 0.1, y: ry, w: rootW - 0.2, h: rootH,
    fontFace: ctx.headFont, fontSize: 16, bold: true,
    color: textOn(ctx.T, ctx.pal[0]), align: "center", valign: "middle"
  });

  if (!kids.length) return;
  const gap = 0.3;
  const kw = (w - (kids.length - 1) * gap) / kids.length;
  const kh = 0.78;
  const ky = ry + 1.5;

  kids.forEach((k, i) => {
    const kx = x + i * (kw + gap);
    const fill = ctx.cards[i % 4];
    slide.addShape(pptx.ShapeType.line, {
      x: rx + rootW / 2, y: ry + rootH, w: (kx + kw / 2) - (rx + rootW / 2), h: ky - (ry + rootH),
      line: { color: ctx.T.muted, width: 1.5 }
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: kx, y: ky, w: kw, h: kh,
      fill: { color: fill }, line: { type: "none" }, rectRadius: 0.12
    });
    slide.addText(k.label || "", {
      x: kx + 0.08, y: ky, w: kw - 0.16, h: kh,
      fontFace: ctx.headFont, fontSize: 14, bold: true,
      color: textOn(ctx.T, fill), align: "center", valign: "middle"
    });

    const sub = (k.children || []).slice(0, 3);
    sub.forEach((sc, j) => {
      const sy = ky + kh + 0.35 + j * 0.68;
      if (sy + 0.55 <= y + h) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: kx + 0.12, y: sy, w: kw - 0.24, h: 0.55,
          fill: { color: ctx.surface }, line: { color: ctx.line, width: 1 }, rectRadius: 0.1
        });
        slide.addText(sc.label || "", {
          x: kx + 0.18, y: sy, w: kw - 0.36, h: 0.55,
          fontFace: ctx.bodyFont, fontSize: 12,
          color: ctx.text, align: "center", valign: "middle"
        });
      }
    });
  });
}

function drawCode(pptx, slide, ctx, vis, x, y, w, h) {
  const lines = String(vis.code || "").replace(/\t/g, "    ").split("\n").slice(0, 15);
  const boxH = Math.min(h, 0.65 + lines.length * 0.27);
  const by = y + (h - boxH) / 2;

  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: by, w, h: boxH,
    fill: { color: "0F172A" }, line: { color: "334155", width: 1 }, rectRadius: 0.08
  });

  ["FF5F56", "FFBD2E", "27C93F"].forEach((dotCol, i) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.22 + i * 0.24, y: by + 0.16, w: 0.13, h: 0.13,
      fill: { color: dotCol }, line: { type: "none" }
    });
  });

  if (vis.language) {
    slide.addText(vis.language, {
      x: x + w - 1.5, y: by + 0.08, w: 1.3, h: 0.28,
      fontFace: "Consolas", fontSize: 10, color: "94A3B8", align: "right"
    });
  }

  slide.addText(lines.join("\n"), {
    x: x + 0.25, y: by + 0.45, w: w - 0.5, h: boxH - 0.55,
    fontFace: "Consolas", fontSize: 12.5, color: "E2E8F0", valign: "top"
  });
}

function drawCompare(pptx, slide, ctx, vis, x, y, w, h) {
  if (!vis.left || !vis.right) return;
  const gap = 0.35;
  const pw = (w - gap) / 2;
  const sides = [vis.left, vis.right];

  sides.forEach((side, i) => {
    const px = x + i * (pw + gap);
    const fill = ctx.cards[i];
    slide.addShape(pptx.ShapeType.roundRect, {
      x: px, y, w: pw, h,
      fill: { color: ctx.surface }, line: { color: ctx.line, width: 1 }, rectRadius: 0.1
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: px, y, w: pw, h: 0.8,
      fill: { color: fill }, line: { type: "none" }, rectRadius: 0.1
    });
    slide.addText(side.title || "", {
      x: px + 0.15, y, w: pw - 0.3, h: 0.8,
      fontFace: ctx.headFont, fontSize: 18, bold: true,
      color: textOn(ctx.T, fill), align: "center", valign: "middle"
    });
    const pts = (side.points || []).slice(0, 5).map((pt) => ({
      text: pt,
      options: { bullet: true, fontFace: ctx.bodyFont, fontSize: 14, color: ctx.text, breakLine: true }
    }));
    if (pts.length) {
      slide.addText(pts, {
        x: px + 0.25, y: y + 0.98, w: pw - 0.5, h: h - 1.15,
        valign: "top", rtlMode: ctx.rtl
      });
    }
  });
}

function drawNetwork(pptx, slide, ctx, vis, x, y, w, h) {
  const layers = (vis.layers || [3, 4, 2]).slice(0, 5).map((n) => Math.max(1, Math.min(7, Number(n) || 3)));
  const n = layers.length;
  const mx = Math.max(...layers);
  const d = Math.min(0.38, (h - 0.6) / (mx * 1.55));
  const xs = layers.map((_, i) => x + d / 2 + (i * (w - d)) / Math.max(n - 1, 1));
  const sp = Math.min(d * 1.7, (h - 0.6 - d) / Math.max(mx - 1, 1));

  const allY = layers.map((m) => {
    const tot = d + (m - 1) * sp;
    const top = y + (h - 0.5 - tot) / 2;
    return Array.from({ length: m }, (_, k) => top + d / 2 + k * sp);
  });

  for (let i = 0; i < n - 1; i++) {
    for (const ya of allY[i]) {
      for (const yb of allY[i + 1]) {
        slide.addShape(pptx.ShapeType.line, {
          x: xs[i], y: ya, w: xs[i + 1] - xs[i], h: yb - ya,
          line: { color: ctx.dark ? "4A5A8A" : "9FB0C8", width: 0.75 }
        });
      }
    }
  }

  layers.forEach((_, i) => {
    const fill = i === 0 ? ctx.T.acc[1] : (i === n - 1 ? ctx.text : ctx.T.acc[0]);
    allY[i].forEach((yy) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: xs[i] - d / 2, y: yy - d / 2, w: d, h: d,
        fill: { color: fill }, line: { type: "none" }
      });
    });
  });
}

function drawVisual(pptx, slide, ctx, vis, x, y, w, h) {
  if (!vis || !vis.type) return;
  const t = String(vis.type).toLowerCase();
  if (t === "nested" && Array.isArray(vis.items)) drawNested(pptx, slide, ctx, vis.items, x, y, w, h);
  else if (t === "flow" && Array.isArray(vis.items)) drawFlow(pptx, slide, ctx, vis.items, x, y, w, h, vis.direction);
  else if (t === "cards" && Array.isArray(vis.items)) drawCards(pptx, slide, ctx, vis.items, x, y, w, h, false);
  else if (t === "steps" && Array.isArray(vis.items)) drawCards(pptx, slide, ctx, vis.items, x, y, w, h, true);
  else if (t === "table") drawTable(pptx, slide, ctx, vis, x, y, w, h);
  else if (t === "tree") drawTree(pptx, slide, ctx, vis.root, x, y, w, h);
  else if (t === "code") drawCode(pptx, slide, ctx, vis, x, y, w, h);
  else if (t === "compare") drawCompare(pptx, slide, ctx, vis, x, y, w, h);
  else if (t === "network") drawNetwork(pptx, slide, ctx, vis, x, y, w, h);
}

function drawRows(pptx, slide, ctx, items, x, y, w, h, numbered = true) {
  const list = items.slice(0, 6);
  const n = list.length;
  if (!n) return;
  const gap = 0.18;
  const rh = Math.min((h - (n - 1) * gap) / n, 1.05);
  const y0 = y + (h - (n * rh + (n - 1) * gap)) / 2;

  list.forEach(([main, sub], i) => {
    const ry = y0 + i * (rh + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: ry, w, h: rh,
      fill: { color: ctx.surface }, line: { color: ctx.line, width: 1 }, rectRadius: 0.12
    });
    const col = ctx.cards[i % 4];
    const bx = ctx.rtl ? x + w - 0.72 : x + 0.22;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: bx, y: ry + rh / 2 - 0.24, w: 0.48, h: 0.48,
      fill: { color: col }, line: { type: "none" }
    });
    if (numbered) {
      slide.addText(String(i + 1), {
        x: bx, y: ry + rh / 2 - 0.24, w: 0.48, h: 0.48,
        fontFace: ctx.headFont, fontSize: 14, bold: true,
        color: textOn(ctx.T, col), align: "center", valign: "middle"
      });
    }
    const tx = ctx.rtl ? x + 0.25 : x + 0.88;
    const tw = w - 1.15;
    const runs = parseBoldRuns(main, {
      fontFace: ctx.bodyFont,
      fontSize: sub ? 15 : 16,
      bold: Boolean(sub),
      color: ctx.text
    });
    if (sub) {
      runs.push({
        text: "\n" + sub,
        options: { fontFace: ctx.bodyFont, fontSize: 13.5, color: ctx.dark ? ctx.T.acc[0] : ctx.T.acc[2] }
      });
    }
    slide.addText(runs, {
      x: tx, y: ry + 0.04, w: tw, h: rh - 0.08,
      align: ctx.rtl ? "right" : "left",
      valign: "middle",
      rtlMode: ctx.rtl
    });
  });
}

// ----------------------------------------------------------------------
// Main Deck Export Function
// ----------------------------------------------------------------------
async function generateAndDownloadPptx(deck) {
  const T = THEMES[deck.themeName] || THEMES["Classroom"];
  const rtl = Boolean(deck.rtl);
  const wantPlaceholders = Boolean(deck.wantPlaceholders);

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 inches
  pptx.title = deck.title;

  // 1. Title Slide
  const tCtx = makeCtx(T, true, rtl);
  const titleSlide = newStyledSlide(pptx, tCtx);
  const lw = 6.9;
  const lx = mx(tCtx, 0.8, lw);

  const titleRuns = [];
  if (deck.tagline) {
    titleRuns.push({
      text: deck.tagline.toUpperCase() + "\n\n",
      options: { fontFace: tCtx.headFont, fontSize: 16, bold: true, color: T.acc[0] }
    });
  }
  titleRuns.push({
    text: deck.title,
    options: {
      fontFace: tCtx.headFont,
      fontSize: deck.title.length <= 32 ? 40 : 32,
      bold: true,
      color: tCtx.text
    }
  });
  titleSlide.addText(titleRuns, {
    x: lx, y: 1.3, w: lw, h: 4.5,
    align: rtl ? "right" : "left", valign: "middle", rtlMode: rtl
  });

  if (deck.channel) {
    const credit = rtl ? `ماخذ: ${deck.channel}` : `Based on a lecture by ${deck.channel}`;
    titleSlide.addText(credit, {
      x: lx, y: 6.3, w: lw, h: 0.45,
      fontFace: tCtx.bodyFont, fontSize: 13, color: "9AA7C0",
      align: rtl ? "right" : "left", rtlMode: rtl
    });
  }

  const vx = mx(tCtx, 7.7, 5.0);
  if (deck.cover && deck.cover.type) {
    drawVisual(pptx, titleSlide, tCtx, deck.cover, vx, 1.0, 5.0, 5.5);
  } else {
    drawNested(pptx, titleSlide, tCtx, ["Core Concepts", "Key Examples", "Takeaways"], vx, 1.0, 5.0, 5.5);
  }

  // 2. Content Slides
  const total = deck.slides.length;
  const fullTypes = new Set(["table", "compare", "tree"]);

  deck.slides.forEach((s, idx) => {
    const slideNum = idx + 1;
    const ctx = makeCtx(T, slideNum % 3 === 0, rtl);
    const slide = newStyledSlide(pptx, ctx);

    const hasVis = Boolean(s.visual && s.visual.type);
    const hasShotSlot = Boolean(wantPlaceholders && s.needs_screenshot);
    const bullets = (s.bullets || []).slice(0, 5);
    const vtype = hasVis ? String(s.visual.type).toLowerCase() : null;

    if (!hasVis && !hasShotSlot) {
      // Pure designed bullet rows
      addHeaderWithPill(pptx, slide, ctx, s.heading, 0.7, 0.4, 11.93, 1.05, 28);
      const rows = bullets.length ? bullets.map((b) => [b, null]) : [[s.heading, null]];
      drawRows(pptx, slide, ctx, rows, 0.7, 1.75, 11.93, 4.5, false);
    } else if (hasVis && hasShotSlot) {
      // Slide has BOTH a diagram AND needs a screenshot -> Left: Diagram/Bullets, Right: Screenshot Drop-Zone!
      addHeaderWithPill(pptx, slide, ctx, s.heading, 0.7, 0.4, 11.93, 1.0, 26);
      const leftX = mx(ctx, 0.7, 5.75);
      const rightX = mx(ctx, 6.8, 5.83);
      drawVisual(pptx, slide, ctx, s.visual, leftX, 1.65, 5.75, 4.55);
      drawScreenshotPlaceholder(pptx, slide, ctx, s.screenshot_hint, s.timestamp, rightX, 1.65, 5.83, 4.55);
    } else if (hasShotSlot && !hasVis) {
      // Slide needs a screenshot -> Left: Heading + Bullets, Right: Clean Screenshot Drop-Zone!
      const colW = 5.65;
      const boxW = 5.95;
      const tx = mx(ctx, 0.7, colW);
      const bx = mx(ctx, 6.68, boxW);

      addHeaderWithPill(pptx, slide, ctx, s.heading, tx, 0.65, colW, 1.05, 25);
      const bulletObjs = bullets.flatMap((b) =>
        parseBoldRuns(b, {
          fontFace: ctx.bodyFont,
          fontSize: 16,
          color: ctx.text,
          bullet: true,
          breakLine: true
        })
      );
      if (bulletObjs.length) {
        slide.addText(bulletObjs, {
          x: tx, y: 1.9, w: colW, h: 4.3,
          align: rtl ? "right" : "left", valign: "top", rtlMode: rtl
        });
      }
      drawScreenshotPlaceholder(pptx, slide, ctx, s.screenshot_hint, s.timestamp, bx, 0.9, boxW, 5.25);
    } else {
      // Standard Visual Slide
      const isFull = fullTypes.has(vtype) || bullets.length === 0;
      if (isFull) {
        addHeaderWithPill(pptx, slide, ctx, s.heading, 0.7, 0.4, 11.93, 1.05, 28);
        const vh = s.footer ? 4.45 : 5.15;
        drawVisual(pptx, slide, ctx, s.visual, 0.7, 1.7, 11.93, vh);
      } else {
        const colW = 5.65;
        const visW = 5.95;
        const tx = mx(ctx, 0.7, colW);
        const vx2 = mx(ctx, 6.68, visW);

        addHeaderWithPill(pptx, slide, ctx, s.heading, tx, 0.65, colW, 1.05, 25);
        const bulletObjs = bullets.flatMap((b) =>
          parseBoldRuns(b, {
            fontFace: ctx.bodyFont,
            fontSize: 16,
            color: ctx.text,
            bullet: true,
            breakLine: true
          })
        );
        slide.addText(bulletObjs, {
          x: tx, y: 1.9, w: colW, h: 4.3,
          align: rtl ? "right" : "left", valign: "top", rtlMode: rtl
        });
        const vh = s.footer ? 4.8 : 5.45;
        drawVisual(pptx, slide, ctx, s.visual, vx2, 0.85, visW, vh);
      }
    }

    addFooter(pptx, slide, ctx, s.footer);
    addPageNo(slide, ctx, slideNum, total);

    if (s.notes) {
      slide.addNotes(s.notes);
    }
  });

  // 3. Key Takeaways Slide
  if (deck.takeaways && deck.takeaways.length) {
    const ctx = makeCtx(T, true, rtl);
    const s = newStyledSlide(pptx, ctx);
    addHeaderWithPill(pptx, s, ctx, rtl ? "اہم نکات" : "Key Takeaways", 0.7, 0.4, 11.93, 1.05, 28);
    drawRows(pptx, s, ctx, deck.takeaways.slice(0, 6).map((t) => [t, null]), 0.7, 1.75, 11.93, 5.1, true);
  }

  // 4. Quiz & Answers Slides
  if (deck.quiz && deck.quiz.length) {
    const qCtx = makeCtx(T, false, rtl);
    const qSlide = newStyledSlide(pptx, qCtx);
    addHeaderWithPill(pptx, qSlide, qCtx, rtl ? "کوئز" : "Quick Check Quiz", 0.7, 0.4, 11.93, 1.05, 28);
    drawRows(pptx, qSlide, qCtx, deck.quiz.slice(0, 5).map((q) => [q.q, null]), 0.7, 1.75, 11.93, 5.1, true);

    const aSlide = newStyledSlide(pptx, qCtx);
    addHeaderWithPill(pptx, aSlide, qCtx, rtl ? "جوابات" : "Quiz Answers", 0.7, 0.4, 11.93, 1.05, 28);
    drawRows(pptx, aSlide, qCtx, deck.quiz.slice(0, 5).map((q) => [q.q, q.a]), 0.7, 1.75, 11.93, 5.1, true);
  }

  const safeName = (deck.title || "lecture").replace(/[^\w\- ]/g, "").trim().slice(0, 55) || "lecture";
  await pptx.writeFile({ fileName: `${safeName}.pptx` });
}
