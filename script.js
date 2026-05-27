const editor = document.querySelector("#editor");
const titleInput = document.querySelector("#docTitle");
const saveStatus = document.querySelector("#saveStatus");
const selectionStatus = document.querySelector("#selectionStatus");
const wordCount = document.querySelector("#wordCount");
const charCount = document.querySelector("#charCount");
const pageEstimate = document.querySelector("#pageEstimate");
const readTime = document.querySelector("#readTime");
const storageKey = "project-word-document";
const versionsKey = "project-word-versions";
const fontLibraryKey = "project-word-fonts";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const encoder = new TextEncoder();
let saveTimer;
let lastAutoVersionAt = 0;
let activeFind = { query: "", endOffset: 0 };
let inkTool = "off";
let activeStroke = null;
let activePointerId = null;
let customFont = null;

const commands = {
  appTheme: document.querySelector("#appTheme"),
  blockFormat: document.querySelector("#blockFormat"),
  fontName: document.querySelector("#fontName"),
  fontSize: document.querySelector("#fontSize"),
  foreColor: document.querySelector("#foreColor"),
  hiliteColor: document.querySelector("#hiliteColor"),
  pageSize: document.querySelector("#pageSize"),
  pageMargin: document.querySelector("#pageMargin"),
  pageTheme: document.querySelector("#pageTheme"),
  lineHeight: document.querySelector("#lineHeight"),
  zoomLevel: document.querySelector("#zoomLevel"),
  dictionaryToggle: document.querySelector("#dictionaryToggle"),
  autoCorrectToggle: document.querySelector("#autoCorrectToggle"),
  customFontInput: document.querySelector("#customFontInput"),
  customFontPicker: document.querySelector("#customFontPicker"),
  customFontStatus: document.querySelector("#customFontStatus"),
  inkColor: document.querySelector("#inkColor"),
  inkSize: document.querySelector("#inkSize"),
  templatePicker: document.querySelector("#templatePicker"),
  versionPicker: document.querySelector("#versionPicker"),
};

const marginValues = {
  normal: "0.82in",
  narrow: "0.45in",
  wide: "1.15in",
};

const autoCorrections = {
  adress: "address",
  becuase: "because",
  definately: "definitely",
  dont: "don't",
  freind: "friend",
  goverment: "government",
  recieve: "receive",
  seperate: "separate",
  teh: "the",
  thier: "their",
  wierd: "weird",
  wont: "won't",
  youre: "you're",
};

const templates = {
  resume: {
    title: "Resume",
    html: `<h1>Your Name</h1><p>Email | Phone | City</p><h2>Summary</h2><p>Write a short professional summary here.</p><h2>Experience</h2><p><strong>Job Title</strong> - Company<br>Month Year - Present</p><ul><li>Describe your strongest result.</li><li>Describe another useful contribution.</li></ul><h2>Education</h2><p>Degree or certificate - School</p><h2>Skills</h2><p>Skill one, skill two, skill three</p>`,
  },
  letter: {
    title: "Letter",
    html: `<p>Your Name<br>Your Address<br>Date</p><p>Recipient Name<br>Recipient Address</p><p>Dear Recipient,</p><p>Write your letter here.</p><p>Sincerely,<br>Your Name</p>`,
  },
  assignment: {
    title: "Assignment",
    html: `<h1>Assignment Title</h1><p><strong>Name:</strong> Your Name<br><strong>Class:</strong> Class Name<br><strong>Date:</strong> Date</p><h2>Introduction</h2><p>Start your introduction here.</p><h2>Main Answer</h2><p>Write your work here.</p><h2>Conclusion</h2><p>Summarize your answer here.</p>`,
  },
  report: {
    title: "Report",
    html: `<h1>Report Title</h1><p><strong>Prepared by:</strong> Your Name<br><strong>Date:</strong> Date</p><h2>Executive Summary</h2><p>Summarize the report here.</p><h2>Findings</h2><ul><li>Finding one</li><li>Finding two</li></ul><h2>Recommendations</h2><p>Write the next steps here.</p>`,
  },
  invoice: {
    title: "Invoice",
    html: `<h1>Invoice</h1><p><strong>From:</strong> Your Name<br><strong>To:</strong> Client Name<br><strong>Date:</strong> Date</p><table><tbody><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr><tr><td>Service</td><td>1</td><td>$0.00</td><td>$0.00</td></tr><tr><td colspan="3"><strong>Total</strong></td><td>$0.00</td></tr></tbody></table><p>Payment notes go here.</p>`,
  },
};

function runCommand(command, value = null) {
  editor.focus();
  document.execCommand(command, false, value);
  refreshStats();
  queueSave();
}

function queueSave() {
  saveStatus.textContent = "Saving...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDocument, 350);
}

function getDocumentData() {
  return {
    title: titleInput.value.trim() || "Untitled document",
    html: editor.innerHTML,
    appTheme: commands.appTheme.value,
    customFont,
    pageSize: commands.pageSize.value,
    pageMargin: commands.pageMargin.value,
    pageTheme: commands.pageTheme.value,
    lineHeight: commands.lineHeight.value,
    zoomLevel: commands.zoomLevel.value,
    dictionary: commands.dictionaryToggle.checked,
    autoCorrect: commands.autoCorrectToggle.checked,
    savedAt: new Date().toISOString(),
  };
}

function saveDocument() {
  const data = getDocumentData();
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    maybeAutoVersion(data);
    saveStatus.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    const withoutFont = { ...data, customFont: null };
    localStorage.setItem(storageKey, JSON.stringify(withoutFont));
    saveStatus.textContent = "Saved without font file; font was too large for browser storage";
  }
}

function loadDocument() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    titleInput.value = data.title || "Untitled document";
    editor.innerHTML = data.html || editor.innerHTML;
    resetInkAfterContentChange();
    commands.appTheme.value = data.appTheme || "system";
    customFont = data.customFont || null;
    if (customFont) upsertFont(customFont);
    commands.pageSize.value = data.pageSize || "letter";
    commands.pageMargin.value = data.pageMargin || "normal";
    commands.pageTheme.value = data.pageTheme || "white";
    commands.lineHeight.value = data.lineHeight || "1.45";
    commands.zoomLevel.value = data.zoomLevel || "100";
    commands.dictionaryToggle.checked = data.dictionary !== false;
    commands.autoCorrectToggle.checked = Boolean(data.autoCorrect);
    applyAppTheme();
    applyCustomFont();
    applyPageSettings();
    applyWritingSettings();
    saveStatus.textContent = "Restored saved document";
  } catch {
    saveStatus.textContent = "Saved document could not be restored";
  }
}

function getVersions() {
  try {
    return JSON.parse(localStorage.getItem(versionsKey)) || [];
  } catch {
    return [];
  }
}

function setVersions(versions) {
  localStorage.setItem(versionsKey, JSON.stringify(versions.slice(0, 12)));
  renderVersions();
}

function saveVersion(label = "Snapshot", data = getDocumentData()) {
  const versions = getVersions();
  const last = versions[0];
  if (last && last.html === data.html && last.title === data.title) {
    saveStatus.textContent = "Current version already saved";
    return;
  }

  versions.unshift({
    ...data,
    customFont: null,
    id: Date.now().toString(),
    label,
  });
  setVersions(versions);
  saveStatus.textContent = `${label} saved`;
}

function maybeAutoVersion(data) {
  const now = Date.now();
  if (now - lastAutoVersionAt < 180000) return;
  const versions = getVersions();
  if (versions[0] && versions[0].html === data.html) return;
  lastAutoVersionAt = now;
  versions.unshift({
    ...data,
    customFont: null,
    id: now.toString(),
    label: "Auto",
  });
  setVersions(versions);
}

function renderVersions() {
  const versions = getVersions();
  commands.versionPicker.innerHTML = "";
  if (!versions.length) {
    commands.versionPicker.innerHTML = '<option value="">No versions yet</option>';
    return;
  }

  versions.forEach((version) => {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = `${version.label} - ${new Date(version.savedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
    commands.versionPicker.append(option);
  });
}

function restoreVersion() {
  const versions = getVersions();
  const version = versions.find((item) => item.id === commands.versionPicker.value);
  if (!version) return;
  if (!confirm("Restore this saved version? Current edits will be saved as a snapshot first.")) return;

  saveVersion("Before restore");
  titleInput.value = version.title || "Untitled document";
  editor.innerHTML = version.html || "<p><br></p>";
  resetInkAfterContentChange();
  commands.appTheme.value = version.appTheme || commands.appTheme.value;
  customFont = version.customFont || customFont;
  if (customFont) upsertFont(customFont);
  commands.pageSize.value = version.pageSize || "letter";
  commands.pageMargin.value = version.pageMargin || "normal";
  commands.pageTheme.value = version.pageTheme || "white";
  commands.lineHeight.value = version.lineHeight || "1.45";
  commands.zoomLevel.value = version.zoomLevel || "100";
  commands.dictionaryToggle.checked = version.dictionary !== false;
  commands.autoCorrectToggle.checked = Boolean(version.autoCorrect);
  applyAppTheme();
  applyCustomFont();
  applyPageSettings();
  applyWritingSettings();
  refreshStats();
  saveDocument();
  saveStatus.textContent = "Version restored";
}

function refreshStats() {
  const text = editor.innerText.replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  const forcedBreaks = editor.querySelectorAll(".page-break").length;
  wordCount.textContent = words.toLocaleString();
  charCount.textContent = editor.innerText.length.toLocaleString();
  pageEstimate.textContent = Math.max(1, Math.ceil(words / 520) + forcedBreaks).toLocaleString();
  readTime.textContent = Math.max(1, Math.ceil(words / 220)).toLocaleString();
}

function updateToolbarState() {
  document.querySelectorAll(".format-btn").forEach((button) => {
    button.classList.toggle("active", document.queryCommandState(button.dataset.command));
  });

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.toString().length === 0) {
    selectionStatus.textContent = "No selection";
    return;
  }

  selectionStatus.textContent = `${selection.toString().length.toLocaleString()} selected`;
}

function applyAppTheme() {
  const choice = commands.appTheme.value;
  const resolved = choice === "system" ? (systemTheme.matches ? "dark" : "light") : choice;
  document.documentElement.dataset.appTheme = resolved;
  saveStatus.textContent = choice === "system" ? `Theme follows system (${resolved})` : `${choice[0].toUpperCase()}${choice.slice(1)} theme`;
  queueSave();
}

function applyPageSettings() {
  editor.dataset.size = commands.pageSize.value;
  editor.dataset.margin = commands.pageMargin.value === "normal" ? "" : commands.pageMargin.value;
  editor.dataset.theme = commands.pageTheme.value === "white" ? "" : commands.pageTheme.value;
  editor.style.lineHeight = commands.lineHeight.value;
  editor.style.setProperty("--zoom", Number(commands.zoomLevel.value) / 100);
  queueSave();
}

function applyWritingSettings() {
  editor.spellcheck = commands.dictionaryToggle.checked;
  saveStatus.textContent = commands.dictionaryToggle.checked ? "Dictionary on" : "Dictionary off";
  queueSave();
}

function customFontFamily() {
  return customFont ? `'${customFont.family}', Arial, sans-serif` : "";
}

function getFontLibrary() {
  try {
    return JSON.parse(localStorage.getItem(fontLibraryKey)) || [];
  } catch {
    return [];
  }
}

function setFontLibrary(fonts) {
  try {
    localStorage.setItem(fontLibraryKey, JSON.stringify(fonts));
    renderFontLibrary();
    return true;
  } catch {
    saveStatus.textContent = "Font library is full; remove an old font and try again";
    return false;
  }
}

function upsertFont(font) {
  const fonts = getFontLibrary().filter((item) => item.id !== font.id);
  fonts.unshift(font);
  return setFontLibrary(fonts);
}

function renderFontLibrary() {
  const fonts = getFontLibrary();
  commands.customFontPicker.innerHTML = "";

  if (!fonts.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No uploaded fonts";
    commands.customFontPicker.append(option);
    return;
  }

  fonts.forEach((font) => {
    const option = document.createElement("option");
    option.value = font.id;
    option.textContent = font.name;
    commands.customFontPicker.append(option);
  });

  commands.customFontPicker.value = customFont ? customFont.id : fonts[0].id;
}

function fontNameFromFile(file) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[^\w\s-]/g, "").trim() || "Uploaded font";
}

function fontFormatFromFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "otf") return "opentype";
  if (extension === "ttf") return "truetype";
  if (extension === "woff") return "woff";
  if (extension === "woff2") return "woff2";
  return "";
}

function registerCustomFont() {
  if (!customFont || !customFont.dataUrl) return Promise.resolve(false);
  if (!("FontFace" in window)) return Promise.resolve(false);

  const source = `url("${customFont.dataUrl}")${customFont.format ? ` format("${customFont.format}")` : ""}`;
  const face = new FontFace(customFont.family, source);
  return face.load().then((loadedFace) => {
    document.fonts.add(loadedFace);
    return true;
  });
}

function syncCustomFontOption() {
  const existing = commands.fontName.querySelector("option[data-custom-font]");
  if (existing) existing.remove();
  if (!customFont) return;

  const option = document.createElement("option");
  option.dataset.customFont = "true";
  option.value = customFontFamily();
  option.textContent = customFont.name;
  commands.fontName.append(option);
}

function applyCustomFont() {
  renderFontLibrary();
  syncCustomFontOption();
  if (!customFont) {
    editor.style.fontFamily = "";
    commands.customFontStatus.textContent = "No uploaded font";
    queueSave();
    return;
  }

  const applyLoadedFont = () => {
    editor.style.fontFamily = customFontFamily();
    commands.customFontStatus.textContent = customFont.name;
    saveStatus.textContent = `${customFont.name} applied`;
    queueSave();
  };

  registerCustomFont().then(applyLoadedFont).catch(() => {
    applyLoadedFont();
    saveStatus.textContent = `${customFont.name} applied, but browser could not preload it`;
  });
}

function loadCustomFontFile(file) {
  if (!file) return;
  if (!/\.(otf|ttf|woff2?)$/i.test(file.name)) {
    saveStatus.textContent = "Please choose an OTF, TTF, WOFF, or WOFF2 font file";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const name = fontNameFromFile(file);
    const uploadedFont = {
      id: `font-${Date.now()}`,
      name,
      family: `ProjectWord-${Date.now()}`,
      format: fontFormatFromFile(file),
      dataUrl: reader.result,
    };
    if (!upsertFont(uploadedFont)) return;
    customFont = uploadedFont;
    applyCustomFont();
    saveDocument();
  };
  reader.onerror = () => {
    saveStatus.textContent = "Font file could not be loaded";
  };
  reader.readAsDataURL(file);
}

function applySelectedCustomFont() {
  const font = getFontLibrary().find((item) => item.id === commands.customFontPicker.value);
  if (!font) {
    saveStatus.textContent = "Choose an uploaded font first";
    return;
  }

  customFont = font;
  applyCustomFont();
  saveDocument();
}

function deleteSelectedCustomFont() {
  const fontId = commands.customFontPicker.value;
  if (!fontId) return;
  const font = getFontLibrary().find((item) => item.id === fontId);
  if (!font || !confirm(`Delete ${font.name} from uploaded fonts?`)) return;

  const fonts = getFontLibrary().filter((item) => item.id !== fontId);
  setFontLibrary(fonts);
  if (customFont && customFont.id === fontId) {
    customFont = fonts[0] || null;
    applyCustomFont();
    saveDocument();
  }
  saveStatus.textContent = `${font.name} deleted`;
}

function clearCustomFont() {
  customFont = null;
  applyCustomFont();
  saveDocument();
  saveStatus.textContent = "Default font restored";
}

function ensureInkLayer() {
  let layer = editor.querySelector(":scope > .ink-layer");
  if (layer) {
    updateInkLayerSize(layer);
    return layer;
  }

  layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.classList.add("ink-layer");
  layer.setAttribute("contenteditable", "false");
  layer.setAttribute("aria-hidden", "true");
  editor.prepend(layer);
  updateInkLayerSize(layer);
  return layer;
}

function updateInkLayerSize(layer = editor.querySelector(":scope > .ink-layer")) {
  if (!layer) return;
  const width = Math.max(1, editor.offsetWidth);
  const height = Math.max(1, editor.scrollHeight, editor.offsetHeight);
  layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
}

function setInkTool(tool) {
  inkTool = inkTool === tool ? "off" : tool;
  editor.classList.toggle("ink-mode", inkTool !== "off");
  editor.classList.toggle("eraser-mode", inkTool === "eraser");
  document.querySelector("#pencilMode").classList.toggle("active", inkTool === "pencil");
  document.querySelector("#eraserMode").classList.toggle("active", inkTool === "eraser");
  if (inkTool !== "off") ensureInkLayer();
  saveStatus.textContent = inkTool === "pencil" ? "Pencil ready" : inkTool === "eraser" ? "Eraser ready" : "Typing mode";
}

function pagePoint(event) {
  const rect = editor.getBoundingClientRect();
  const scale = rect.width / Math.max(1, editor.offsetWidth);
  return {
    x: Math.max(0, Math.min(editor.offsetWidth, (event.clientX - rect.left) / scale)),
    y: Math.max(0, Math.min(editor.scrollHeight, (event.clientY - rect.top) / scale)),
  };
}

function strokePath(points) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.01} ${points[0].y + 0.01}`;
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function beginInkStroke(event) {
  if (inkTool === "off") return;
  if (event.pointerType === "mouse" && !event.shiftKey) return;

  event.preventDefault();
  editor.focus();
  activePointerId = event.pointerId;
  if (editor.setPointerCapture) editor.setPointerCapture(activePointerId);
  updateInkLayerSize();

  if (inkTool === "eraser") {
    eraseInkAt(pagePoint(event));
    return;
  }

  const layer = ensureInkLayer();
  const start = pagePoint(event);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add("ink-stroke");
  path.setAttribute("stroke", commands.inkColor.value);
  path.setAttribute("stroke-width", commands.inkSize.value);
  path.setAttribute("d", strokePath([start]));
  layer.append(path);
  activeStroke = { path, points: [start] };
}

function continueInkStroke(event) {
  if (event.pointerId !== activePointerId || inkTool === "off") return;
  event.preventDefault();

  if (inkTool === "eraser") {
    eraseInkAt(pagePoint(event));
    return;
  }

  if (!activeStroke) return;
  const point = pagePoint(event);
  const previous = activeStroke.points[activeStroke.points.length - 1];
  const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
  if (distance < 1.5) return;
  activeStroke.points.push(point);
  activeStroke.path.setAttribute("d", strokePath(activeStroke.points));
}

function finishInkStroke(event) {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  if (activeStroke) {
    refreshStats();
    queueSave();
  }
  activeStroke = null;
  activePointerId = null;
}

function eraseInkAt(point) {
  const strokes = [...editor.querySelectorAll(".ink-stroke")];
  const eraserSize = Math.max(10, Number(commands.inkSize.value) * 2.2);
  const target = strokes.find((stroke) => isPointNearStroke(stroke, point, eraserSize));
  if (!target) return;
  target.remove();
  cleanupInkLayer();
  refreshStats();
  queueSave();
}

function isPointNearStroke(stroke, point, radius) {
  if (!stroke.getTotalLength) return false;
  const length = stroke.getTotalLength();
  const samples = Math.max(8, Math.ceil(length / 10));
  for (let index = 0; index <= samples; index += 1) {
    const sample = stroke.getPointAtLength((length * index) / samples);
    if (Math.hypot(sample.x - point.x, sample.y - point.y) <= radius) return true;
  }
  return false;
}

function cleanupInkLayer() {
  const layer = editor.querySelector(":scope > .ink-layer");
  if (layer && !layer.querySelector(".ink-stroke")) layer.remove();
}

function clearInk() {
  const layer = editor.querySelector(":scope > .ink-layer");
  if (!layer) {
    saveStatus.textContent = "No ink to clear";
    return;
  }
  if (!confirm("Clear all pencil marks from this document?")) return;
  layer.remove();
  refreshStats();
  queueSave();
  saveStatus.textContent = "Ink cleared";
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function documentName(extension) {
  const clean = (titleInput.value || "document").trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
  return `${clean || "document"}.${extension}`;
}

function exportHtml() {
  download(documentName("html"), buildExportDocument(), "text/html");
}

function exportWord() {
  download(documentName("doc"), buildExportDocument(), "application/msword");
}

function exportDocx() {
  const blob = buildDocx();
  downloadBlob(documentName("docx"), blob);
}

function buildExportDocument() {
  const margin = marginValues[commands.pageMargin.value] || marginValues.normal;
  const fontFamily = customFontFamily() || "Arial, sans-serif";
  const fontFace = customFont ? `@font-face { font-family: "${customFont.family}"; src: url("${customFont.dataUrl}")${customFont.format ? ` format("${customFont.format}")` : ""}; }` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(titleInput.value || "Document")}</title>
  <style>
    ${fontFace}
    body { font-family: ${fontFamily}; line-height: ${commands.lineHeight.value}; margin: 0; padding: ${margin}; }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #9aa4b2; padding: 8px; }
    .ink-layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 2; }
    .ink-stroke { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .page-break { page-break-after: always; break-after: page; }
    .page-break::after { content: ""; }
  </style>
</head>
<body>
${editor.innerHTML}
</body>
</html>`;
  return html;
}

function buildDocx() {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": buildDocxDocumentXml(),
  };

  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function buildDocxDocumentXml() {
  const fontName = customFont ? customFont.name : "Arial";
  const runProperties = `<w:rPr><w:rFonts w:ascii="${escapeXml(fontName)}" w:hAnsi="${escapeXml(fontName)}" w:eastAsia="${escapeXml(fontName)}" w:cs="${escapeXml(fontName)}"/></w:rPr>`;
  const paragraphs = editor.innerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const body = (paragraphs.length ? paragraphs : [""]).map((line) => {
    return `<w:p><w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1180" w:right="1180" w:bottom="1180" w:left="1180" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const crc = crc32(contentBytes);
    const localHeader = zipHeader(0x04034b50, [
      [20, 2], [0, 2], [0, 2], [0, 2], [0, 2], [crc, 4],
      [contentBytes.length, 4], [contentBytes.length, 4], [nameBytes.length, 2], [0, 2],
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = zipHeader(0x02014b50, [
      [20, 2], [20, 2], [0, 2], [0, 2], [0, 2], [0, 2], [crc, 4],
      [contentBytes.length, 4], [contentBytes.length, 4], [nameBytes.length, 2], [0, 2],
      [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4],
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const end = zipHeader(0x06054b50, [
    [0, 2], [0, 2], [Object.keys(files).length, 2], [Object.keys(files).length, 2],
    [centralSize, 4], [offset, 4], [0, 2],
  ]);
  return new Blob([...localParts, ...centralParts, end]);
}

function zipHeader(signature, fields) {
  const length = 4 + fields.reduce((total, [, bytes]) => total + bytes, 0);
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint32(offset, signature, true);
  offset += 4;
  fields.forEach(([value, bytes]) => {
    if (bytes === 2) view.setUint16(offset, value, true);
    if (bytes === 4) view.setUint32(offset, value >>> 0, true);
    offset += bytes;
  });
  return new Uint8Array(buffer);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function createTable() {
  const rows = Math.max(1, Math.min(12, Number(prompt("Rows", "3")) || 3));
  const cols = Math.max(1, Math.min(8, Number(prompt("Columns", "3")) || 3));
  let html = "<table><tbody>";
  for (let row = 0; row < rows; row += 1) {
    html += "<tr>";
    for (let col = 0; col < cols; col += 1) {
      html += "<td><br></td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table><p><br></p>";
  runCommand("insertHTML", html);
}

function insertPageBreak() {
  runCommand("insertHTML", '<div class="page-break" contenteditable="false"></div><p><br></p>');
}

function insertImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => runCommand("insertImage", reader.result);
  reader.readAsDataURL(file);
}

function resetInkAfterContentChange() {
  activeStroke = null;
  activePointerId = null;
  if (inkTool !== "off") ensureInkLayer();
}

function getTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_SKIP;
      if (node.parentElement.closest(".ink-layer")) return NodeFilter.FILTER_SKIP;
      if (!editor.contains(node.parentElement)) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function getSearchText() {
  return getTextNodes().map((node) => node.nodeValue).join("");
}

function locateTextOffset(offset) {
  let current = 0;
  for (const node of getTextNodes()) {
    const next = current + node.nodeValue.length;
    if (offset <= next) {
      return { node, offset: Math.max(0, offset - current) };
    }
    current = next;
  }

  const nodes = getTextNodes();
  const last = nodes[nodes.length - 1];
  return last ? { node: last, offset: last.nodeValue.length } : null;
}

function selectionEndOffset() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return activeFind.endOffset;

  const range = selection.getRangeAt(0);
  let offset = 0;

  for (const node of getTextNodes()) {
    if (node === range.endContainer) return offset + range.endOffset;
    offset += node.nodeValue.length;
  }

  return activeFind.endOffset;
}

function findMatch(query, startOffset = 0) {
  const text = getSearchText();
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let index = haystack.indexOf(needle, startOffset);
  let wrapped = false;

  if (index === -1 && startOffset > 0) {
    index = haystack.indexOf(needle, 0);
    wrapped = index !== -1;
  }

  if (index === -1) return null;
  return { start: index, end: index + query.length, wrapped };
}

function selectMatch(match) {
  const start = locateTextOffset(match.start);
  const end = locateTextOffset(match.end);
  if (!start || !end) return false;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const selection = window.getSelection();
  editor.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  start.node.parentElement.scrollIntoView({ block: "center", behavior: "smooth" });
  activeFind.endOffset = match.end;
  return true;
}

function countMatches(query) {
  if (!query) return 0;
  const pattern = query.toLowerCase();
  let count = 0;
  let position = 0;
  const text = getSearchText().toLowerCase();

  while (position < text.length) {
    const index = text.indexOf(pattern, position);
    if (index === -1) break;
    count += 1;
    position = index + pattern.length;
  }

  return count;
}

function findText() {
  const query = document.querySelector("#findText").value;
  if (!query) return;

  if (activeFind.query !== query) {
    activeFind = { query, endOffset: 0 };
  }

  const match = findMatch(query, selectionEndOffset());
  if (!match || !selectMatch(match)) {
    saveStatus.textContent = "No match";
    return;
  }

  const total = countMatches(query);
  saveStatus.textContent = match.wrapped ? `Match found, wrapped (${total} total)` : `Match found (${total} total)`;
}

function replaceText() {
  const query = document.querySelector("#findText").value;
  const replacement = document.querySelector("#replaceText").value;
  const selection = window.getSelection();
  if (!query) return;

  if (selection && selection.rangeCount && selection.toString().toLowerCase() === query.toLowerCase()) {
    document.execCommand("insertText", false, replacement);
    activeFind.endOffset = selectionEndOffset();
    refreshStats();
    queueSave();
    findText();
    return;
  }

  findText();
}

function replaceAllText() {
  const query = document.querySelector("#findText").value;
  const replacement = document.querySelector("#replaceText").value;
  if (!query) return;

  let replaced = 0;
  activeFind = { query, endOffset: 0 };
  let match = findMatch(query, 0);

  while (match && replaced < 1000) {
    selectMatch(match);
    document.execCommand("insertText", false, replacement);
    replaced += 1;
    activeFind.endOffset = match.start + replacement.length;
    match = findMatch(query, activeFind.endOffset);
  }

  refreshStats();
  queueSave();
  saveStatus.textContent = replaced ? `Replaced ${replaced.toLocaleString()} match${replaced === 1 ? "" : "es"}` : "No match";
}

function autoCorrectLastWord() {
  if (!commands.autoCorrectToggle.checked) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return;
  if (selection.anchorNode.nodeType !== Node.TEXT_NODE) return;

  const node = selection.anchorNode;
  const caret = selection.anchorOffset;
  const beforeCaret = node.nodeValue.slice(0, caret);
  const match = beforeCaret.match(/([A-Za-z']+)$/);
  if (!match) return;

  const original = match[1];
  const correction = autoCorrections[original.toLowerCase()];
  if (!correction || correction === original) return;

  const range = document.createRange();
  range.setStart(node, caret - original.length);
  range.setEnd(node, caret);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, correction);
  saveStatus.textContent = `Auto-corrected ${original}`;
}

function useTemplate() {
  const selected = commands.templatePicker.value;
  if (!selected || !templates[selected]) return;
  if (!confirm("Use this template? Current edits will be saved as a snapshot first.")) return;

  saveVersion("Before template");
  titleInput.value = templates[selected].title;
  editor.innerHTML = templates[selected].html;
  resetInkAfterContentChange();
  refreshStats();
  saveDocument();
  saveStatus.textContent = "Template applied";
}

function setToolbarTab(tab) {
  document.body.dataset.toolbarTab = tab;
  document.querySelectorAll("[data-toolbar-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.toolbarTab === tab);
  });
}

let installPromptEvent = null;

function registerPwa() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {
      saveStatus.textContent = "Offline install is unavailable in this browser";
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    document.querySelector("#installApp").hidden = false;
  });
}

async function installApp() {
  if (!installPromptEvent) {
    saveStatus.textContent = location.protocol === "file:" ? "Open through the local server to install" : "Install option is not available yet";
    return;
  }

  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  document.querySelector("#installApp").hidden = true;
}

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => runCommand(button.dataset.command));
});

commands.blockFormat.addEventListener("change", () => runCommand("formatBlock", commands.blockFormat.value));
commands.fontName.addEventListener("change", () => runCommand("fontName", commands.fontName.value));
commands.fontSize.addEventListener("change", () => runCommand("fontSize", commands.fontSize.value));
document.querySelector("#uploadFontToolbar").addEventListener("click", () => commands.customFontInput.click());
document.querySelector("#uploadFont").addEventListener("click", () => commands.customFontInput.click());
document.querySelector("#applyCustomFont").addEventListener("click", applySelectedCustomFont);
document.querySelector("#deleteCustomFont").addEventListener("click", deleteSelectedCustomFont);
document.querySelector("#clearCustomFont").addEventListener("click", clearCustomFont);
commands.customFontInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  loadCustomFontFile(file);
  event.target.value = "";
});
commands.customFontPicker.addEventListener("change", applySelectedCustomFont);
commands.foreColor.addEventListener("input", () => runCommand("foreColor", commands.foreColor.value));
commands.hiliteColor.addEventListener("input", () => runCommand("hiliteColor", commands.hiliteColor.value));
commands.appTheme.addEventListener("change", applyAppTheme);
commands.pageSize.addEventListener("change", applyPageSettings);
commands.pageMargin.addEventListener("change", applyPageSettings);
commands.pageTheme.addEventListener("change", applyPageSettings);
commands.lineHeight.addEventListener("input", applyPageSettings);
commands.zoomLevel.addEventListener("input", applyPageSettings);
commands.dictionaryToggle.addEventListener("change", applyWritingSettings);
commands.autoCorrectToggle.addEventListener("change", queueSave);
systemTheme.addEventListener("change", () => {
  if (commands.appTheme.value === "system") applyAppTheme();
});

document.querySelector("#insertLink").addEventListener("click", () => {
  const url = prompt("Link URL", "https://");
  if (url) runCommand("createLink", url);
});

document.querySelector("#insertImage").addEventListener("click", () => document.querySelector("#imageInput").click());
document.querySelector("#imageInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) insertImageFromFile(file);
  event.target.value = "";
});

document.querySelector("#insertTable").addEventListener("click", createTable);
document.querySelector("#insertPageBreak").addEventListener("click", insertPageBreak);
document.querySelector("#pencilMode").addEventListener("click", () => setInkTool("pencil"));
document.querySelector("#eraserMode").addEventListener("click", () => setInkTool("eraser"));
document.querySelector("#clearInk").addEventListener("click", clearInk);
commands.inkColor.addEventListener("input", queueSave);
commands.inkSize.addEventListener("input", queueSave);
document.querySelector("#saveDoc").addEventListener("click", saveDocument);
document.querySelector("#downloadWord").addEventListener("click", exportWord);
document.querySelector("#downloadDocx").addEventListener("click", exportDocx);
document.querySelector("#downloadDoc").addEventListener("click", exportHtml);
document.querySelector("#downloadText").addEventListener("click", () => download(documentName("txt"), editor.innerText, "text/plain"));
document.querySelector("#printDoc").addEventListener("click", () => window.print());
document.querySelector("#installApp").addEventListener("click", installApp);
document.querySelector("#findNext").addEventListener("click", findText);
document.querySelector("#replaceNext").addEventListener("click", replaceText);
document.querySelector("#replaceAll").addEventListener("click", replaceAllText);
document.querySelector("#useTemplate").addEventListener("click", useTemplate);
document.querySelector("#saveVersion").addEventListener("click", () => saveVersion("Snapshot"));
document.querySelector("#restoreVersion").addEventListener("click", restoreVersion);
document.querySelector("#focusFind").addEventListener("click", () => document.querySelector("#findText").focus());
document.querySelector("#saveVersionToolbar").addEventListener("click", () => saveVersion("Snapshot"));
document.querySelectorAll("[data-toolbar-tab]").forEach((button) => {
  button.addEventListener("click", () => setToolbarTab(button.dataset.toolbarTab));
});
document.querySelector("#findText").addEventListener("input", () => {
  activeFind = { query: "", endOffset: 0 };
});

document.querySelector("#newDoc").addEventListener("click", () => {
  if (!confirm("Create a new blank document? Unsaved edits in this page will be replaced.")) return;
  saveVersion("Before new");
  titleInput.value = "Untitled document";
  editor.innerHTML = "<p><br></p>";
  resetInkAfterContentChange();
  refreshStats();
  queueSave();
});

document.querySelector("#openDoc").addEventListener("click", () => document.querySelector("#fileInput").click());
document.querySelector("#fileInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.name.toLowerCase().endsWith(".docx")) {
    saveStatus.textContent = "DOCX export is supported; DOCX import is coming next";
    alert("This offline build can export real DOCX files. DOCX import is not available yet, so please open HTML, DOC, or TXT files here for now.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    titleInput.value = file.name.replace(/\.[^.]+$/, "");
    saveVersion("Before open");
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      editor.innerHTML = `<p>${escapeHtml(reader.result).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
    } else {
      const parsed = new DOMParser().parseFromString(reader.result, "text/html");
      editor.innerHTML = parsed.body.innerHTML || reader.result;
    }
    resetInkAfterContentChange();
    refreshStats();
    queueSave();
  };
  reader.readAsText(file);
  event.target.value = "";
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const usingShortcut = event.ctrlKey || event.metaKey;
  if (!usingShortcut) return;

  if (key === "s") {
    event.preventDefault();
    saveDocument();
  }

  if (key === "p") {
    event.preventDefault();
    window.print();
  }

  if (key === "k") {
    event.preventDefault();
    document.querySelector("#insertLink").click();
  }
});

editor.addEventListener("input", () => {
  updateInkLayerSize();
  refreshStats();
  queueSave();
});

editor.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "." || event.key === "," || event.key === "Enter") {
    autoCorrectLastWord();
  }
});

editor.addEventListener("keyup", updateToolbarState);
editor.addEventListener("mouseup", updateToolbarState);
editor.addEventListener("pointerdown", beginInkStroke);
editor.addEventListener("pointermove", continueInkStroke);
editor.addEventListener("pointerup", finishInkStroke);
editor.addEventListener("pointercancel", finishInkStroke);
titleInput.addEventListener("input", queueSave);
window.addEventListener("resize", () => updateInkLayerSize());
document.addEventListener("selectionchange", updateToolbarState);

loadDocument();
applyAppTheme();
renderFontLibrary();
applyCustomFont();
applyPageSettings();
applyWritingSettings();
renderVersions();
setToolbarTab("text");
registerPwa();
refreshStats();
