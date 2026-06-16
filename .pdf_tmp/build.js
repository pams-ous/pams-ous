const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const mdPath = path.resolve(__dirname, '..', 'USER_MANUAL.md');
const htmlPath = path.resolve(__dirname, 'USER_MANUAL.html');

const md = fs.readFileSync(mdPath, 'utf8');
const body = marked.parse(md, { gfm: true, headerIds: true });

const css = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 11px; line-height: 1.55; color: #1f2328;
    max-width: 100%; margin: 0;
  }
  h1, h2, h3, h4 { color: #6B0A1A; line-height: 1.25; }
  h1 { font-size: 26px; border-bottom: 3px solid #6B0A1A; padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 18px; border-bottom: 1px solid #e3c7cc; padding-bottom: 4px; margin-top: 26px; page-break-after: avoid; }
  h3 { font-size: 14px; margin-top: 18px; page-break-after: avoid; }
  h4 { font-size: 12px; }
  p { margin: 8px 0; }
  a { color: #6B0A1A; text-decoration: none; }
  code {
    font-family: "Cascadia Code", Consolas, "Courier New", monospace;
    background: #f4eef0; color: #6B0A1A; padding: 1px 5px; border-radius: 4px; font-size: 10px;
  }
  pre {
    background: #2b2b2b; color: #f5f5f5; padding: 12px 14px; border-radius: 6px;
    overflow-x: auto; font-size: 10px; line-height: 1.45; page-break-inside: avoid;
  }
  pre code { background: transparent; color: #f5f5f5; padding: 0; }
  table {
    border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10px;
    page-break-inside: avoid;
  }
  th, td { border: 1px solid #d6c2c6; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #6B0A1A; color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #faf5f6; }
  blockquote {
    border-left: 4px solid #d8a0a8; background: #fbf4f5; margin: 10px 0;
    padding: 6px 14px; color: #5a3a40; page-break-inside: avoid;
  }
  blockquote p { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #e3c7cc; margin: 22px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  h1 + blockquote, h1 + p strong { font-size: 12px; }
`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>PAMS-OUS User Manual</title>
<style>${css}</style>
</head><body>${body}</body></html>`;

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML written to', htmlPath);
