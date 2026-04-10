function sanitizeFilenamePart(s: string): string {
  return (
    s.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "report"
  );
}

/** Values html2canvas cannot parse (Tailwind v4 / modern browsers may emit these). */
const UNSAFE_CSS_COLOR = /lab\(|oklch\(|color-mix\(/i;

/**
 * Force a color string to something html2canvas can parse (rgb/hex).
 * Tries canvas, then a temporary element + getComputedStyle.
 */
function resolveCssColorToRgb(value: string): string {
  const v = value.trim();
  if (!UNSAFE_CSS_COLOR.test(v)) return v;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    try {
      ctx.fillStyle = v;
      const out = ctx.fillStyle;
      if (typeof out === "string" && !UNSAFE_CSS_COLOR.test(out)) return out;
    } catch {
      /* continue */
    }
  }

  const asColor = document.createElement("div");
  asColor.style.color = v;
  document.body.appendChild(asColor);
  let resolved = getComputedStyle(asColor).color;
  document.body.removeChild(asColor);
  if (!UNSAFE_CSS_COLOR.test(resolved)) return resolved;

  const asBg = document.createElement("div");
  asBg.style.backgroundColor = v;
  document.body.appendChild(asBg);
  resolved = getComputedStyle(asBg).backgroundColor;
  document.body.removeChild(asBg);
  if (!UNSAFE_CSS_COLOR.test(resolved)) return resolved;

  /* Last resort: dark gray text on white, not pure black (reads better in PDFs) */
  return "rgb(31, 41, 55)";
}

/** When lab()/oklch() cannot be resolved, pick a safe rgb by property name. */
function fallbackSafeColor(prop: string): string {
  const p = prop.toLowerCase();
  if (/shadow|filter|backdrop/i.test(p)) return "none";
  if (p.includes("background")) return "rgb(255, 255, 255)";
  if (p === "color") return "rgb(31, 41, 55)";
  if (p.includes("border") || p.includes("outline")) return "rgb(209, 213, 219)";
  if (p.includes("fill") || p.includes("stroke")) return "rgb(55, 65, 81)";
  return "rgb(255, 255, 255)";
}

/**
 * Second pass: some properties may still contain lab()/oklch() after copy.
 * Also sanitize SVG presentation attributes.
 */
function sanitizeLabLikeColorsInSubtree(root: Element): void {
  const walk = (node: Element) => {
    if (node instanceof HTMLElement || node instanceof SVGElement) {
      if ("style" in node && node.style) {
        const st = node.style;
        const names = new Set<string>();
        for (let i = 0; i < st.length; i++) {
          names.add(st.item(i));
        }
        for (const prop of names) {
          const val = st.getPropertyValue(prop);
          if (!val || !UNSAFE_CSS_COLOR.test(val)) continue;
          let next = resolveCssColorToRgb(val);
          if (UNSAFE_CSS_COLOR.test(next)) {
            next = fallbackSafeColor(prop);
            if (next === "none") {
              st.setProperty(prop, "none");
              continue;
            }
          }
          st.setProperty(prop, next);
        }
      }
      if (node instanceof SVGElement) {
        for (const attr of ["fill", "stroke", "stop-color", "flood-color"]) {
          const raw = node.getAttribute(attr);
          if (raw && UNSAFE_CSS_COLOR.test(raw)) {
            let fixed = resolveCssColorToRgb(raw);
            if (UNSAFE_CSS_COLOR.test(fixed)) {
              fixed = attr === "fill" ? "currentColor" : "none";
            }
            node.setAttribute(attr, fixed);
          }
        }
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(root);
}

/** Ensure the report root paints a light page (avoids transparent → black with JPEG). */
function ensurePdfRootBackground(cloneRoot: HTMLElement): void {
  cloneRoot.style.setProperty("background-color", "rgb(249, 250, 251)", "important");
  cloneRoot.style.setProperty("color", "rgb(17, 24, 39)", "important");
}

function stripClonedDocumentStylesheets(clonedDoc: Document): void {
  clonedDoc
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => {
      node.parentNode?.removeChild(node);
    });
  const sheets = clonedDoc.adoptedStyleSheets;
  if (sheets?.length) {
    try {
      sheets.splice(0, sheets.length);
    } catch {
      /* ignore if not mutable */
    }
  }
}

/**
 * html2canvas cannot parse modern CSS color functions (e.g. `lab()`, `oklch()`)
 * that Tailwind v4 emits. Copy resolved computed styles from the live DOM onto
 * the clone as inline styles so the canvas never has to parse those values.
 */
function copyComputedStylesOntoClone(
  originalRoot: HTMLElement,
  cloneRoot: HTMLElement
): void {
  const walk = (orig: Element, clone: Element) => {
    const cs = window.getComputedStyle(orig);
    if (
      clone instanceof HTMLElement ||
      (clone instanceof SVGElement && "style" in clone)
    ) {
      const el = clone as HTMLElement | SVGElement;
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        const value = cs.getPropertyValue(prop);
        if (value) {
          try {
            el.style.setProperty(prop, value);
          } catch {
            /* ignore unsupported props */
          }
        }
      }
      clone.removeAttribute("class");
    }

    const n = Math.min(orig.children.length, clone.children.length);
    for (let i = 0; i < n; i++) {
      const oChild = orig.children[i];
      const cChild = clone.children[i];
      if (oChild && cChild) walk(oChild, cChild);
    }
  };

  walk(originalRoot, cloneRoot);
}

export function buildRenewalAnalysisFilename(businessName: string): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return `renewal-analysis-${sanitizeFilenamePart(businessName)}-${datePart}.pdf`;
}

/**
 * Renders the given element to a letter PDF (1" margins, scale 2), then adds
 * a centered footer on every page with page number + generation timestamp.
 */
export async function generateRenewalAnalysisPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;

  const opt = {
    margin: [1, 1, 1, 1] as [number, number, number, number],
    filename,
    /* PNG avoids JPEG flattening transparent pixels to black; quality still applies to raster embed */
    image: { type: "png" as const, quality: 1 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      /* Opaque canvas: transparent areas become light gray, not black */
      backgroundColor: "#f9fafb",
      onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
        stripClonedDocumentStylesheets(clonedDoc);
        const od = clonedElement.ownerDocument;
        if (od && od !== clonedDoc) {
          stripClonedDocumentStylesheets(od);
        }
        copyComputedStylesOntoClone(element, clonedElement);
        sanitizeLabLikeColorsInSubtree(clonedElement);
        ensurePdfRootBackground(clonedElement);
      },
    },
    jsPDF: {
      unit: "in",
      format: "letter",
      orientation: "portrait" as const,
    },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  const worker = html2pdf().set(opt).from(element);
  await worker.toPdf();

  const pdf = (await worker.get("pdf")) as {
    internal?: {
      getNumberOfPages?: () => number;
      pageSize?: { getWidth: () => number; getHeight: () => number };
    };
    getNumberOfPages?: () => number;
    setPage: (n: number) => void;
    setFontSize: (n: number) => void;
    setTextColor: (r: number, g: number, b: number) => void;
    text: (
      text: string,
      x: number,
      y: number,
      options?: { align?: "center" | "left" | "right" }
    ) => void;
    save: (name?: string) => void;
  };

  const totalPages =
    typeof pdf.getNumberOfPages === "function"
      ? pdf.getNumberOfPages()
      : typeof pdf.internal?.getNumberOfPages === "function"
        ? pdf.internal.getNumberOfPages()
        : 1;
  const generatedAt = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const pageW = pdf.internal?.pageSize?.getWidth?.() ?? 8.5;
  const pageH = pdf.internal?.pageSize?.getHeight?.() ?? 11;

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    const w = pageW;
    const h = pageH;
    pdf.setFontSize(8);
    pdf.setTextColor(90, 90, 90);
    const footerText = `Page ${i} of ${totalPages}  ·  Generated ${generatedAt}`;
    pdf.text(footerText, w / 2, h - 0.65, { align: "center" });
  }

  pdf.save(filename);
}
