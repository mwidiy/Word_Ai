/**
 * SKRIPSI FORMATTER
 * 
 * Mengkonversi Markdown menjadi HTML yang sudah di-style
 * sesuai standar format skripsi Indonesia:
 * - Font: Times New Roman, 12pt
 * - Paragraf: Justify, indent 1.27cm, line-height 1.5
 * - Heading 1 (BAB): 14pt, Bold, Center, Uppercase
 * - Heading 2 (Sub-bab): 12pt, Bold, Left
 */

import Showdown from 'showdown';

const converter = new Showdown.Converter({
  tables: true,
  simpleLineBreaks: true,
  strikethrough: true,
});

// CSS inline — HANYA properti yang 100% didukung Word insertHtml()
export const SKRIPSI_STYLES = {
  h1: `font-family: 'Times New Roman', Times, serif; font-size: 14pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 24pt; margin-bottom: 12pt;`,
  h2: `font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-weight: bold; text-align: left; margin-top: 18pt; margin-bottom: 6pt;`,
  h3: `font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-weight: bold; font-style: italic; text-align: left; margin-top: 12pt; margin-bottom: 6pt;`,
  p: `font-family: 'Times New Roman', Times, serif; font-size: 12pt; text-align: justify; line-height: 1.5; text-indent: 1.27cm; margin-bottom: 0pt; margin-top: 0pt;`,
  li: `font-family: 'Times New Roman', Times, serif; font-size: 12pt; text-align: justify; line-height: 1.5;`,
  table: `font-family: 'Times New Roman', Times, serif; font-size: 11pt; border-collapse: collapse; width: 100%;`,
  th: `font-family: 'Times New Roman', Times, serif; font-size: 11pt; font-weight: bold; border: 1px solid #000; padding: 4pt 8pt; text-align: center;`,
  td: `font-family: 'Times New Roman', Times, serif; font-size: 11pt; border: 1px solid #000; padding: 4pt 8pt;`,
};

/**
 * Konversi Markdown → HTML berformat skripsi.
 */
export function markdownToSkripsiHtml(markdown: string): string {
  if (!markdown) return "";
  
  let html = converter.makeHtml(markdown);
  if (!html) return "";

  html = html
    .replace(/<h1>/g, `<h1 style="${SKRIPSI_STYLES.h1}">`)
    .replace(/<h2>/g, `<h2 style="${SKRIPSI_STYLES.h2}">`)
    .replace(/<h3>/g, `<h3 style="${SKRIPSI_STYLES.h3}">`)
    .replace(/<p>/g, `<p style="${SKRIPSI_STYLES.p}">`)
    .replace(/<li>/g, `<li style="${SKRIPSI_STYLES.li}">`)
    .replace(/<table>/g, `<table style="${SKRIPSI_STYLES.table}">`)
    .replace(/<th>/g, `<th style="${SKRIPSI_STYLES.th}">`)
    .replace(/<td>/g, `<td style="${SKRIPSI_STYLES.td}">`);

  return html;
}

/**
 * Buat HTML OOXML Equation sederhana.
 */
export function buildEquationHtml(latex: string, label: string = ""): string {
  let formatted = latex
    .replace(/\^{([^}]+)}/g, '<sup>$1</sup>')
    .replace(/\^(\w)/g, '<sup>$1</sup>')
    .replace(/_{([^}]+)}/g, '<sub>$1</sub>')
    .replace(/_(\w)/g, '<sub>$1</sub>')
    .replace(/\\frac{([^}]+)}{([^}]+)}/g, '($1/$2)')
    .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ').replace(/\\epsilon/g, 'ε').replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ').replace(/\\pi/g, 'π')
    .replace(/\\sigma/g, 'σ').replace(/\\omega/g, 'ω').replace(/\\rho/g, 'ρ')
    .replace(/\\Delta/g, 'Δ').replace(/\\Sigma/g, 'Σ').replace(/\\Omega/g, 'Ω')
    .replace(/\\sqrt{([^}]+)}/g, '√($1)')
    .replace(/\\infty/g, '∞')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·');

  const labelHtml = label ? `<span style="float: right; font-family: 'Times New Roman', Times, serif; font-size: 12pt;">${label}</span>` : "";

  return `<p style="text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-style: italic; margin-top: 12pt; margin-bottom: 12pt;">
    ${formatted} ${labelHtml}
  </p>`;
}

/**
 * Buat HTML Daftar Pustaka dengan format APA Style (Hanging Indent).
 */
export function buildBibliographyHtml(references: string[], includeTitle: boolean = true): string {
  if (!references || references.length === 0) return "";
  
  // Custom style dengan specificity tinggi agar tidak tertimpa style default Word
  const pStyle = `font-family: 'Times New Roman', Times, serif; font-size: 12pt; text-align: justify; line-height: 1.5; margin-left: 36pt; text-indent: -36pt; margin-bottom: 6pt; margin-top: 0pt; display: block;`;
  const titleStyle = `font-family: 'Times New Roman', Times, serif; font-size: 14pt; font-weight: bold; text-align: center; margin-top: 24pt; margin-bottom: 12pt; text-transform: uppercase;`;

  let html = "";
  if (includeTitle) {
    html += `<h1 style="${titleStyle}">DAFTAR PUSTAKA</h1>\n`;
  }

  references.forEach(ref => {
    let safeRef = ref.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html += `<p style="${pStyle}">${safeRef}</p>\n`;
  });

  return html;
}
