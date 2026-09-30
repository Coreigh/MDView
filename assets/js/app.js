// SPDX-License-Identifier: MIT
//
// State Variables
let currentFileHandle = null;
let currentFileName = null;
let currentFileLastModified = null;
let sessionSaveTimeout = null;
let scrollSyncLocked = true;
let isScrollSyncing = false;
let focusedPane = null;  // null | 'editor' | 'preview'

// Mobile / Welcome State (v15.3)
const MOBILE_BREAKPOINT = 800;
let isMobile = window.innerWidth < MOBILE_BREAKPOINT;
let resizeTimer;
let isWelcome = false;  // initialized by updateWelcomeState() on init

// Fresh-document mode (Step 48 - mobile fresh-document entry point).
// Set when the user taps "Start new document" on the mobile welcome card, or
// when the hamburger is clicked on mobile welcome. Keeps hasContent truthy so
// the welcome screen hides and the action-bar stays visible. Reset when the
// user opens a real file (processFile) or saves a new one (Save As -> handle).
let inFreshDocumentMode = false;

// URL Loading State (Step 30)
let loadAbortController = null;
let loadInFlight = false;

// Storage Constants
const SESSION_KEY = 'mdview:session';
const LAST_KEY = 'mdview:lastKnown';
const IDB_NAME = 'mdview';
const IDB_STORE = 'fileHandles';
const IDB_KEY = 'lastFile';
const SESSION_SAVE_DEBOUNCE_MS = 500;
const USE_PROXY_KEY = 'mdview.useProxy';
const PROXY_HELP_SEEN_KEY = 'mdview.proxyHelpSeen';

// Opt-in PHP proxy flag (Step 29). Persists across reloads. Defaults to off
// so static-only deployments are unaffected. When on, loadFromUrl() routes
// every dragged URL through dev/proxy.php on the same origin, which fetches
// the upstream URL as the server and returns the body (sidestepping CORS).
function isProxyEnabled() {
  try { return localStorage.getItem(USE_PROXY_KEY) === '1'; }
  catch { return false; }
}
function setProxyEnabled(on) {
  try {
    if (on) localStorage.setItem(USE_PROXY_KEY, '1');
    else    localStorage.removeItem(USE_PROXY_KEY);
  } catch (err) {
    console.warn('Failed to persist proxy preference:', err);
  }
}

// DOM Element References
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const branding = document.getElementById('branding');
const toolbar = document.getElementById('toolbar');
const modal = document.getElementById('guide-modal');
const modalClose = document.getElementById('modal-close');
const menuBtn = document.getElementById('toolbar-right');
const menuDropdown = document.getElementById('menu-dropdown');
const menuOpen = document.getElementById('menu-open');
const menuSave = document.getElementById('menu-save');
const menuSaveAs = document.getElementById('menu-save-as');
const themeToggleItem = document.getElementById('theme-toggle-item');
const themeLabel = document.getElementById('theme-label');

// Theme Icon SVGs
const themeIconMoon = document.getElementById('theme-icon-moon');
const themeIconSun = document.getElementById('theme-icon-sun');

// Pane Action Buttons
const lockScrollBtn = document.getElementById('lock-scroll-btn');
const lockIconLocked = document.getElementById('lock-icon-locked');
const lockIconUnlocked = document.getElementById('lock-icon-unlocked');
const copyEditorBtn = document.getElementById('copy-editor-btn');
const copyEditorCopy = document.getElementById('copy-editor-copy');
const copyEditorCheck = document.getElementById('copy-editor-check');
const copyPreviewBtn = document.getElementById('copy-preview-btn');
const copyPreviewCopy = document.getElementById('copy-preview-copy');
const copyPreviewCheck = document.getElementById('copy-preview-check');
const selectEditorBtn = document.getElementById('select-editor-btn');
const selectEditorCursor = document.getElementById('select-editor-cursor');
const selectEditorCheck = document.getElementById('select-editor-check');
const selectPreviewBtn = document.getElementById('select-preview-btn');
const selectPreviewCursor = document.getElementById('select-preview-cursor');
const selectPreviewCheck = document.getElementById('select-preview-check');

// Pane Focus Buttons
const workspace = document.getElementById('workspace');
const focusEditorBtn = document.getElementById('focus-editor-btn');
const focusEditorIconOut = document.getElementById('focus-editor-icon-out');
const focusEditorIconIn = document.getElementById('focus-editor-icon-in');
const focusPreviewBtn = document.getElementById('focus-preview-btn');
const focusPreviewIconOut = document.getElementById('focus-preview-icon-out');
const focusPreviewIconIn = document.getElementById('focus-preview-icon-in');
const focusPreviewToggleEdit = document.getElementById('focus-preview-toggle-edit');
const focusPreviewTogglePreview = document.getElementById('focus-preview-toggle-preview');

// Address Bar
const actionBar = document.getElementById('action-bar');
const addressBarName = document.getElementById('address-bar-name');
const addressBarMeta = document.getElementById('address-bar-meta');

// Format Picker Modal
const formatPicker = document.getElementById('format-picker');
const fmtMd = document.getElementById('fmt-md');
const fmtHtml = document.getElementById('fmt-html');
const fmtTxt = document.getElementById('fmt-txt');
const fmtCancel = document.getElementById('fmt-cancel');

// Restore Banner
const restoreBanner = document.getElementById('restore-banner');
const restoreBannerText = document.getElementById('restore-banner-text');
const restoreBannerRestore = document.getElementById('restore-banner-restore');
const restoreBannerDismiss = document.getElementById('restore-banner-dismiss');

// Welcome Screen (v15.3)
const welcomeScreen = document.getElementById('welcome-screen');

// Credits Modal
const creditsBtn = document.getElementById('menu-credits');
const creditsModal = document.getElementById('credits-modal');
const creditsClose = document.getElementById('credits-close');

// Docs Modal (Step 39): reusable container for externally-hosted markdown
// files referenced via [data-doc] links. Loaded by JS at click time;
// rendered through the marked -> DOMPurify chain. Cache keyed by href.
const docsModal = document.getElementById('docs-modal');
const docsModalBody = document.getElementById('docs-modal-body');
const docsClose = document.getElementById('docs-close');
const docCache = new Map();
let docsAbortController = null;

// Outbound link handler (v15.3.1): open external http(s) anchors in a new
// tab. Delegated on document so future outbound anchors (static HTML or
// user-rendered markdown via marked) inherit the behavior automatically.
// Right-click, modifier-clicks (Ctrl/Cmd/Shift/Alt), and middle-click pass
// through to native browser handling so "Copy link address" and friends
// remain available. Same-origin links fall through to default navigation.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  let url;
  try { url = new URL(a.href, location.href); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname === location.hostname) return;
  e.preventDefault();
  window.open(url.href, '_blank', 'noopener,noreferrer');
});

// Settings Modal (Step 29: opt-in PHP proxy)
const menuSettings = document.getElementById('menu-settings');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const useProxyCheckbox = document.getElementById('setting-use-proxy');
const proxyHelp = document.getElementById('proxy-help');

// URL Loading Indicator (Step 30)
const urlLoadingInline = document.getElementById('url-loading-inline');
const urlLoadingInlineLabel = document.getElementById('url-loading-inline-label');
const urlLoadingOverlay = document.getElementById('url-loading-overlay');
const urlLoadingOverlayLabel = document.getElementById('url-loading-overlay-label');
const urlLoadingCancel = document.getElementById('url-loading-cancel');

// Render Engine
function renderMarkdown() {
  if (typeof DOMPurify === 'undefined') {
    console.error('DOMPurify not loaded. Refusing to render untrusted markdown content.');
    return;
  }
  preview.innerHTML = DOMPurify.sanitize(marked.parse(editor.value));
}
editor.addEventListener('input', () => {
  renderMarkdown();
  if (currentFileName && editor.value === '') {
    currentFileName = null;
    currentFileLastModified = null;
    currentFileHandle = null;
    updateAddressBar();
    clearHandleInIDB();
    try {
      localStorage.removeItem(LAST_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (err) {
      console.warn('storage clear on editor empty failed:', err);
    }
  }
  scheduleSessionSave();
  updateWelcomeState();
});

// Scroll Sync Engine
function syncScroll(source, target) {
  if (!scrollSyncLocked) return;
  if (isScrollSyncing) return;
  const sourceMax = source.scrollHeight - source.clientHeight;
  const targetMax = target.scrollHeight - target.clientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return;
  isScrollSyncing = true;
  const ratio = source.scrollTop / sourceMax;
  target.scrollTop = ratio * targetMax;
  requestAnimationFrame(() => { isScrollSyncing = false; });
}

editor.addEventListener('scroll', () => syncScroll(editor, preview));
preview.addEventListener('scroll', () => syncScroll(preview, editor));

// Theme Engine
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function updateThemeUI(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeIconMoon.setAttribute('hidden', '');
    themeIconSun.removeAttribute('hidden');
    themeLabel.textContent = 'Light Mode';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIconMoon.removeAttribute('hidden');
    themeIconSun.setAttribute('hidden', '');
    themeLabel.textContent = 'Dark Mode';
  }
}

// Initial Theme Check
if (!document.documentElement.getAttribute('data-theme')) {
  updateThemeUI(systemPrefersDark.matches);
}

systemPrefersDark.addEventListener('change', (e) => {
  if (!document.documentElement.hasAttribute('data-theme-override')) {
    updateThemeUI(e.matches);
  }
});

// Menu Controls
//
// Step 48 (mobile fresh-document entry point): when the hamburger is clicked
// while the mobile welcome screen is showing, set inFreshDocumentMode so the
// welcome screen hides and the action-bar shows when the menu is dismissed.
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (isMobile && isWelcome) {
    inFreshDocumentMode = true;
    updateWelcomeState();
  }
  menuDropdown.classList.toggle('active');
});

// Start new document button (Step 48 - mobile fresh-document entry point).
// Mobile-only entry point: tap to set inFreshDocumentMode, hide the welcome
// screen, focus the editor, and force the mobile pane focus to editor so the
// user lands on a usable surface instead of the preview default.
const startNewDocBtn = document.getElementById('start-new-doc-btn');
startNewDocBtn.addEventListener('click', () => {
  inFreshDocumentMode = true;
  currentFileName = null;
  currentFileLastModified = null;
  updateWelcomeState();
  if (isMobile) {
    setFocusedPane('editor');
  }
  editor.focus();
});

themeToggleItem.addEventListener('click', (e) => {
  e.stopPropagation();
  const isCurrentlyDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.hasAttribute('data-theme') && systemPrefersDark.matches);

  document.documentElement.setAttribute('data-theme-override', 'true');
  updateThemeUI(!isCurrentlyDark);
  menuDropdown.classList.remove('active');
});

menuOpen.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.remove('active');
  openFile();
});

menuSave.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.remove('active');
  saveFile();
});

menuSaveAs.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.remove('active');
  saveFileAs();
});

// Close Menu on Outside Click
window.addEventListener('click', (e) => {
  if (!menuBtn.contains(e.target)) {
    menuDropdown.classList.remove('active');
  }
});

// Modal Controls (Guide)
branding.addEventListener('click', () => {
  modal.classList.add('active');
});

modalClose.addEventListener('click', () => {
  modal.classList.remove('active');
});

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
  if (e.target === creditsModal) {
    creditsModal.classList.remove('active');
  }
  if (e.target === docsModal) {
    closeDocsModal();
  }
  if (e.target === settingsModal) {
    closeSettings();
  }
});

// Credits Modal Controls
creditsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  creditsModal.classList.add('active');
  menuDropdown.classList.remove('active');
});

creditsClose.addEventListener('click', () => {
  creditsModal.classList.remove('active');
});

// Docs Modal Controls (Step 39)
function closeDocsModal() {
  if (docsAbortController) {
    docsAbortController.abort();
    docsAbortController = null;
  }
  docsModal.classList.remove('active');
}

async function openDocsModal(href) {
  if (!href) return;
  // Cancel any in-flight fetch from a previous open.
  if (docsAbortController) docsAbortController.abort();
  // Mutually exclusive with the Credits modal: opening docs closes credits.
  creditsModal.classList.remove('active');

  // Cache hit: render immediately, no fetch.
  if (docCache.has(href)) {
    docsModalBody.innerHTML = docCache.get(href);
    docsModal.classList.add('active');
    return;
  }

  docsAbortController = new AbortController();
  docsModalBody.innerHTML = '';
  docsModal.classList.add('active');

  try {
    const resp = await fetch(href, { signal: docsAbortController.signal });
    if (!resp.ok) {
      throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    }
    const text = await resp.text();

    // Render the full markdown content. The `# Heading` at the top of the file
    // becomes the body's first <h1> element -- the visible heading in the
    // modal. No separate <h3> heading element is needed in the modal template.
    const html = DOMPurify.sanitize(marked.parse(text));
    docCache.set(href, html);
    docsModalBody.innerHTML = html;
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('Failed to load doc:', href, err);
    const fallbackName = href.split('/').pop().replace(/\.[^.]+$/, '');
    docsModalBody.innerHTML = '<p><strong>Could not load this document.</strong></p>' +
      '<p>The file <code>' + fallbackName + '</code> could not be retrieved. Please try again later.</p>' +
      '<p>Technical detail: ' + err.message + '</p>';
  } finally {
    docsAbortController = null;
  }
}

docsClose.addEventListener('click', closeDocsModal);

// Delegated click handler for [data-doc] links. Catches any link with the
// attribute anywhere in the document; future doc links inherit behavior
// automatically. Right-click / middle-click / modifier-clicks pass through
// to native browser handling so "Copy link address" and "Open in new tab"
// remain available.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-doc]');
  if (!a) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  openDocsModal(a.getAttribute('data-doc'));
});

// Escape key closes the docs modal when open.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && docsModal.classList.contains('active')) {
    closeDocsModal();
  }
});

// Settings Modal Controls (Step 29: opt-in PHP proxy)
function openSettings() {
  // Sync checkbox from persisted state on open.
  useProxyCheckbox.checked = isProxyEnabled();
  // First-time disclosure: open the expandable help so the user sees
  // why the toggle exists and what it costs. Subsequent opens: collapsed.
  let helpSeen = false;
  try { helpSeen = localStorage.getItem(PROXY_HELP_SEEN_KEY) === '1'; } catch {}
  if (proxyHelp) proxyHelp.open = !helpSeen;
  settingsModal.classList.add('active');
}
function closeSettings() {
  if (proxyHelp && proxyHelp.open) {
    try { localStorage.setItem(PROXY_HELP_SEEN_KEY, '1'); } catch {}
  }
  settingsModal.classList.remove('active');
}

menuSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.remove('active');
  openSettings();
});

settingsClose.addEventListener('click', closeSettings);

useProxyCheckbox.addEventListener('change', () => {
  setProxyEnabled(useProxyCheckbox.checked);
});

// Format Picker Controls
let pendingFormat = null;

function showFormatPicker() {
  formatPicker.classList.add('active');
  return new Promise((resolve) => {
    pendingFormat = resolve;
  });
}

function hideFormatPicker() {
  formatPicker.classList.remove('active');
  pendingFormat = null;
}

fmtMd.addEventListener('click', () => {
  const resolve = pendingFormat;
  hideFormatPicker();
  if (resolve) resolve('md');
});

fmtHtml.addEventListener('click', () => {
  const resolve = pendingFormat;
  hideFormatPicker();
  if (resolve) resolve('html');
});

fmtTxt.addEventListener('click', () => {
  const resolve = pendingFormat;
  hideFormatPicker();
  if (resolve) resolve('txt');
});

fmtCancel.addEventListener('click', () => {
  const resolve = pendingFormat;
  hideFormatPicker();
  if (resolve) resolve(null);
});

window.addEventListener('click', (e) => {
  if (e.target === formatPicker) {
    const resolve = pendingFormat;
    hideFormatPicker();
    if (resolve) resolve(null);
  }
});

// File I/O Operations
const allowedExtensions = ['.md', '.txt'];
const allowedMimes = ['text/markdown', 'text/plain', 'application/octet-stream', ''];

function isValidExtension(filename) {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return allowedExtensions.includes(ext);
}

function isAllowedMime(mime) {
  return allowedMimes.includes(mime);
}

async function openFile() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Markdown and Text Files',
          accept: {
            'text/markdown': ['.md'],
            'text/plain': ['.txt']
          }
        }],
        multiple: false
      });

      currentFileHandle = handle;
      const file = await handle.getFile();
      const content = await file.text();

      editor.value = content;
      currentFileName = file.name;
      currentFileLastModified = file.lastModified;
      renderMarkdown();
      await storeHandleInIDB(handle);
      persistSession({ immediate: true });
      updateAddressBar();
      if (isMobile && focusedPane === null) {
        setFocusedPane('preview');
      }
      updateWelcomeState();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('File Open Error:', err);
      }
    }
  } else {
    fileInput.click();
  }
}

// Preview-rendered markdown element CSS (Step 47, 2026-09-23;
// code/pre/glyph extension 2026-09-23):
// Mirrors the WHATWG HTML Living Standard / browser UA defaults. Embedded in
// the Save As HTML export wrapper so exported files carry meaningful styling
// into Word, LibreOffice Writer, Google Docs, and email clients. The code and
// pre rules preserve the live-preview's code-block styling (Steps 45 + 46)
// using a layered @media query for dark-theme browser recipients. The
// outbound-link ::after glyph preserves the live-preview's outbound-link
// affordance (Step 35). Keep this string in sync with the matching rule
// block in styles_v15.3.2.css.
const HTML_EXPORT_CSS = `
h1 { font-size: 2.00em; margin: 0.67em 0; font-weight: bold; }
h2 { font-size: 1.50em; margin: 0.83em 0; font-weight: bold; }
h3 { font-size: 1.17em; margin: 1.00em 0; font-weight: bold; }
h4 { font-size: 1.00em; margin: 1.33em 0; font-weight: bold; }
h5 { font-size: 0.83em; margin: 1.67em 0; font-weight: bold; }
h6 { font-size: 0.67em; margin: 2.33em 0; font-weight: bold; }
p     { margin: 1em 0; }
blockquote { margin: 1em 40px; }
ul, ol { margin: 1em 0; padding-left: 40px; }
li     { display: list-item; }
ul ul, ol ol, ul ol, ol ul { margin-top: 0; margin-bottom: 0; }
table  { border-collapse: collapse; }
th, td { border: 1px solid #cccccc; padding: 1px; vertical-align: top; }
a      { color: -webkit-link; text-decoration: underline; }
img    { max-width: 100%; }
hr     { border: none; border-top: 1px solid #cccccc; margin: 1em 0; }
dl, dd { margin: 0; }
dt     { font-weight: bold; }
code   { display: inline-block; background-color: #f1f3f5; padding: 2px 4px; border-radius: 3px; }
pre code { display: block; padding: 0; background-color: transparent; }
pre    { padding: 16px; background-color: #f1f3f5; border-radius: 6px; overflow-x: auto; }
a[href^="http://"]::after, a[href^="https://"]::after { content: " \\2197"; margin-left: 0.15em; font-size: 0.85em; opacity: 0.6; }
@media (prefers-color-scheme: dark) {
  code, pre { background-color: #2d2d2d; }
}
`.trim();

function wrapHtmlDocument(bodyHtml) {
  return '<!DOCTYPE html>\n'
    + '<html lang="en">\n'
    + '<head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="generator" content="mdview v1.0.15">\n'
    + '<title>document</title>\n'
    + '<style>\n' + HTML_EXPORT_CSS + '\n</style>\n'
    + '</head>\n'
    + '<body>\n'
    + bodyHtml + '\n'
    + '</body>\n'
    + '</html>\n';
}

function exportContent(format) {
  switch (format) {
    case 'md':
      return editor.value;
    case 'html':
      return wrapHtmlDocument(preview.innerHTML);
    case 'txt':
      return preview.innerText;
    default:
      return editor.value;
  }
}

async function saveFileAs() {
  const format = await showFormatPicker();
  if (!format) return;

  const extMap = { md: '.md', html: '.html', txt: '.txt' };
  const acceptMap = {
    md: { 'text/markdown': ['.md'] },
    html: { 'text/html': ['.html'] },
    txt: { 'text/plain': ['.txt'] }
  };
  const descMap = {
    md: 'Markdown',
    html: 'HTML',
    txt: 'Plain Text'
  };

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'document' + extMap[format],
        types: [{
          description: descMap[format],
          accept: acceptMap[format]
        }]
      });

      await writeToFile(handle, exportContent(format));
      await storeHandleInIDB(handle);
      currentFileHandle = handle;
      try {
        const file = await handle.getFile();
        currentFileName = file.name;
        currentFileLastModified = file.lastModified;
      } catch (err) {
        console.debug('saveFileAs: handle.getFile() failed, using fallback timestamp:', err);
        currentFileLastModified = Date.now();
      }
      // Step 48: real file saved via FSA -> leave fresh-document mode.
      inFreshDocumentMode = false;
      updateAddressBar();
      persistSession({ immediate: true });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Save As Error:', err);
      }
    }
  } else {
    const fname = 'document' + extMap[format];
    fallbackDownloadSave(exportContent(format), fname);
    currentFileName = fname;
    currentFileLastModified = null;
    currentFileHandle = null;
    // Step 48: legacy fallback save -> leave fresh-document mode (a file
    // with currentFileName now drives hasContent naturally).
    inFreshDocumentMode = false;
    updateAddressBar();
    clearHandleInIDB();
    persistSession({ immediate: true });
  }
}

async function saveFile() {
  if (!currentFileHandle) {
    const handle = await loadHandleFromIDB();
    if (handle) {
      try {
        const status = await ensureHandlePermission(handle, 'readwrite');
        if (status === 'granted') {
          currentFileHandle = handle;
        }
      } catch (err) {
        console.debug('saveFile: ensureHandlePermission failed:', err);
      }
    }
  }

  if (!currentFileHandle) {
    await saveFileAs();
    return;
  }

    try {
      await writeToFile(currentFileHandle, editor.value);
      try {
        const file = await currentFileHandle.getFile();
        currentFileLastModified = file.lastModified;
      } catch (err) {
        console.debug('saveFile: post-write getFile() failed, using fallback timestamp:', err);
        currentFileLastModified = Date.now();
      }
      updateAddressBar();
  } catch (err) {
    console.error('Save Error:', err);
    await saveFileAs();
  }
}

async function writeToFile(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

function fallbackDownloadSave(content, defaultFilename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  a.click();
  URL.revokeObjectURL(url);
}

function processFile(file) {
  if (!file) return;

  if (!isValidExtension(file.name)) {
    alert('Invalid file extension. Please select a .md or .txt file.');
    return;
  }
  if (!isAllowedMime(file.type)) {
    alert('Invalid file type. Please select a .md or .txt file.');
    return;
  }

  // Step 48: real file acquired -> leave fresh-document mode.
  inFreshDocumentMode = false;

  const reader = new FileReader();
  reader.onload = (e) => {
    editor.value = e.target.result;
    currentFileName = file.name;
    currentFileLastModified = file.lastModified;
    renderMarkdown();
    persistSession({ immediate: true });
    updateAddressBar();
    if (isMobile && focusedPane === null) {
      setFocusedPane('preview');
    }
    updateWelcomeState();
  };
  reader.readAsText(file);
}

// File Input Change
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  currentFileHandle = null;
  processFile(file);
});

// Drag and Drop
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', async (e) => {
  const dt = e.dataTransfer;
  // File drop -> existing path
  if (dt.files && dt.files.length > 0) {
    const file = dt.files[0];
    currentFileHandle = null;
    processFile(file);
    return;
  }
  // URL drop -> fetch + display-only render
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain');
  if (raw) {
    const urlLine = raw.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    if (urlLine) await loadFromUrl(urlLine.trim());
  }
}, false);

// Load markdown from a user-supplied URL (drag-drop payload). Display-only:
// the response body is treated as plain text and flows through the existing
// marked -> DOMPurify -> preview.innerHTML chain. No script execution path.
//
// CHALLENGE: cross-origin fetch is gated by CORS. The browser only hands a
// response to JS if the server returned Access-Control-Allow-Origin matching
// this page's origin (or *). If it didn't, fetch() rejects with the generic
// "Failed to fetch" and the browser refuses to say why. Hosts that gate on
// CORS include github.com (HTML viewer pages), gitlab.com, most CDNs, and
// virtually every corporate wiki. The only way to bypass CORS from outside
// the server is a proxy (not available - this app is hosting-environment-
// independent) or a browser extension (out of scope per session).
//
// We work around the most common user error - dragging a github.com/.../blob/
// viewer URL instead of the raw file - via normalizeMarkdownUrl() below.
// CORS-friendly raw hosts (raw.githubusercontent.com, gist.githubusercontent.com,
// cdn.jsdelivr.net) work as-is. Everything else either works (CORS-open) or
// fails with a clearer error message that points the user at the manual path.
const SIZE_WARN_BYTES = 5 * 1024 * 1024;

// URL Loading Indicator helpers (Step 30).
// Compact label = host + last path segment, ellipsized. Keeps the spinner
// row narrow in the drop-zone (which is height-constrained) and on the
// floating overlay (which is width-constrained).
function shortUrlLabel(urlString) {
  try {
    const u = new URL(urlString);
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs.length ? segs[segs.length - 1] : '';
    const compact = last ? u.host + '/' + last : u.host;
    return compact.length > 40 ? compact.slice(0, 37) + '...' : compact;
  } catch {
    return urlString.length > 40 ? urlString.slice(0, 37) + '...' : urlString;
  }
}

function showLoadingIndicator(urlString) {
  const label = shortUrlLabel(urlString);
  urlLoadingInlineLabel.textContent = 'Loading ' + label + '...';
  urlLoadingOverlayLabel.textContent = 'Loading ' + label + '...';
  // Pick a spinner: inline if drop-zone is currently rendered, overlay otherwise.
  // offsetParent is null when the element or any ancestor is display:none.
  if (dropZone.offsetParent !== null) {
    urlLoadingInline.classList.remove('hidden');
    urlLoadingOverlay.classList.add('hidden');
  } else {
    urlLoadingInline.classList.add('hidden');
    urlLoadingOverlay.classList.remove('hidden');
  }
}

function hideLoadingIndicator() {
  urlLoadingInline.classList.add('hidden');
  urlLoadingOverlay.classList.add('hidden');
}

function cancelLoad() {
  if (loadAbortController) loadAbortController.abort();
}

urlLoadingCancel.addEventListener('click', cancelLoad);

async function loadFromUrl(url) {
  // Concurrent-load refusal (per Step 30 user direction): a load that's
  // already in flight takes precedence; the user must Cancel it via the
  // indicator before starting a new one. Prevents indicator flicker and
  // avoids two AbortControllers racing for the indicator state.
  if (loadInFlight) {
    alert('A URL load is already in progress. Click Cancel in the loading indicator to stop it before starting a new one.');
    return;
  }

  let parsed;
  try { parsed = new URL(url); }
  catch { alert('Invalid URL.'); return; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    alert('Only http and https URLs are accepted.');
    return;
  }

  // Normalize known viewer-page URL patterns to their raw-equivalent hosts.
  // Silent on success - the user just sees the file load from the raw host.
  const normalizedUrl = normalizeMarkdownUrl(parsed);
  const baseUrl = normalizedUrl.href;

  // Route through the bundled PHP proxy when the user has opted in. Same-
  // origin fetch sidesteps CORS; the proxy fetches the upstream URL on the
  // server. Static-only deployments leave this off (default).
  const fetchUrl = isProxyEnabled()
    ? 'proxy.php?url=' + encodeURIComponent(baseUrl)
    : baseUrl;

  // Acquire an AbortController for this load. The cancel button calls
  // .abort() to abort the fetch mid-flight.
  loadAbortController = new AbortController();
  loadInFlight = true;
  showLoadingIndicator(baseUrl);

  let resp;
  try {
    resp = await fetch(fetchUrl, {
      signal: loadAbortController.signal,
      redirect: 'follow'
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      alert('Load cancelled.');
      loadInFlight = false;
      loadAbortController = null;
      hideLoadingIndicator();
      return;
    }
    if (isProxyEnabled()) {
      // When proxied, CORS is no longer in play; the failure is genuine
      // (DNS, network, proxy misconfigured). Different message.
      alert(
        'Couldn\'t load this URL.\n\n' +
        'The proxy at proxy.php could not reach the server. ' +
        'Check the URL, your server\'s connectivity, and that proxy.php is ' +
        'present and PHP-enabled on this host.\n\n' +
        'Disable the proxy in Settings if you don\'t have a PHP host.\n\n' +
        'Technical detail: ' + err.message
      );
    } else {
      // The browser reports CORS failures and genuine network failures with
      // the same opaque "Failed to fetch" error. We don't probe to
      // distinguish them (saves one request per load) and instead give a
      // richer message that covers both, with concrete next steps.
      alert(
        'Couldn\'t load this URL.\n\n' +
        'The browser blocked the response. This usually means the link ' +
        'points to an HTML viewer page (such as github.com/.../blob/...) ' +
        'rather than the raw file, or the remote server doesn\'t allow ' +
        'cross-origin reads from this app.\n\n' +
        'Try one of:\n' +
        '  - Use the raw file URL. On GitHub, swap github.com for ' +
        'raw.githubusercontent.com and remove /blob/ from the path.\n' +
        '  - Download the file, then drag the saved copy into mdview.\n' +
        '  - Enable the bundled PHP proxy in Settings (requires PHP on host).\n\n' +
        'Technical detail: ' + err.message
      );
    }
    loadInFlight = false;
    loadAbortController = null;
    hideLoadingIndicator();
    return;
  }
  if (!resp.ok) {
    // Read the proxy's reason text (if any) for the alert.
    let reason = '';
    try { reason = (await resp.text()).slice(0, 200); } catch {}
    alert('Fetch returned HTTP ' + resp.status + (reason ? ' (' + reason + ')' : '') + '.');
    loadInFlight = false;
    loadAbortController = null;
    hideLoadingIndicator();
    return;
  }

  const contentLength = resp.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > SIZE_WARN_BYTES) {
    const mb = Math.round(Number(contentLength) / 1048576);
    if (!confirm(`Unusually large file (~${mb} MB). Continue loading?`)) {
      loadInFlight = false;
      loadAbortController = null;
      hideLoadingIndicator();
      return;
    }
  }

  const text = await resp.text();

  editor.value = text;
  currentFileName = deriveFilenameFromUrl(normalizedUrl, resp);
  currentFileLastModified = parseLastModified(resp.headers.get('Last-Modified'));
  currentFileHandle = null;
  renderMarkdown();
  persistSession({ immediate: true });
  updateAddressBar();
  if (isMobile && focusedPane === null) {
    setFocusedPane('preview');
  }
  updateWelcomeState();
  loadInFlight = false;
  loadAbortController = null;
  hideLoadingIndicator();
}

// Normalize known HTML-viewer URL patterns to their raw-equivalent hosts.
// Covers github.com (blob pages -> raw.githubusercontent.com) and
// gist.github.com (gist page -> gist raw). Returns the original URL object
// unchanged when no rule matches or the input is unparseable. Pure function:
// no network calls, no DOM access.
function normalizeMarkdownUrl(parsed) {
  const host = parsed.hostname.toLowerCase();
  if ((host === 'github.com' || host === 'www.github.com') &&
      parsed.pathname.includes('/blob/')) {
    // github.com/<owner>/<repo>/blob/<branch>/<path>
    //   -> raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
    const newPath = parsed.pathname.replace('/blob/', '/');
    return new URL('https://raw.githubusercontent.com' + newPath +
                    parsed.search + parsed.hash);
  }
  if (host === 'gist.github.com') {
    // gist.github.com/<user>/<id>  (or just gist.github.com/<id>)
    //   -> gist.githubusercontent.com/<user>/<id>/raw
    // (or gist.githubusercontent.com/<id>/raw)
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return new URL('https://gist.githubusercontent.com/' + parts[0] + '/' +
                      parts[1] + '/raw' + parsed.search + parsed.hash);
    }
    if (parts.length === 1) {
      return new URL('https://gist.githubusercontent.com/' + parts[0] +
                      '/raw' + parsed.search + parsed.hash);
    }
  }
  return parsed;
}

function deriveFilenameFromUrl(parsed, resp) {
  // 1) Last path segment (strip query/hash)
  let pathname = parsed.pathname || '';
  const lastSlash = pathname.lastIndexOf('/');
  let lastSeg = lastSlash >= 0 ? pathname.substring(lastSlash + 1) : pathname;
  lastSeg = lastSeg.split('?')[0].split('#')[0];
  if (lastSeg && lastSeg !== '/' && lastSeg.length > 0) {
    return lastSeg;
  }
  // 2) Content-Disposition header (CDNs)
  const cd = resp && resp.headers ? resp.headers.get('Content-Disposition') : null;
  if (cd) {
    const m = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (m && m[1]) {
      return m[1].replace(/[\\/]/g, '_');
    }
  }
  // 3) Fallback
  return 'loaded-from-url.md';
}

function parseLastModified(headerValue) {
  if (!headerValue) return null;
  const t = Date.parse(headerValue);
  return Number.isNaN(t) ? null : t;
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (e.shiftKey) {
      saveFileAs();
    } else {
      saveFile();
    }
  }
});

// Copy Feedback Visualizer
function triggerCopyFeedback(button, copyIcon, checkIcon) {
  button.classList.add('copied');
  copyIcon.setAttribute('hidden', '');
  checkIcon.removeAttribute('hidden');

  setTimeout(() => {
    button.classList.remove('copied');
    copyIcon.removeAttribute('hidden');
    checkIcon.setAttribute('hidden', '');
  }, 1500);
}

// Click callbacks use the per-button icon references.

// Toggle Scroll Sync Lock
lockScrollBtn.addEventListener('click', () => {
  scrollSyncLocked = !scrollSyncLocked;
  if (scrollSyncLocked) {
    lockIconLocked.removeAttribute('hidden');
    lockIconUnlocked.setAttribute('hidden', '');
    lockScrollBtn.title = 'Scroll Sync: Locked (click to unlock)';
    lockScrollBtn.classList.add('locked');
  } else {
    lockIconLocked.setAttribute('hidden', '');
    lockIconUnlocked.removeAttribute('hidden');
    lockScrollBtn.title = 'Scroll Sync: Unlocked (click to lock)';
    lockScrollBtn.classList.remove('locked');
  }
});

// Pane Focus Mode
function setFocusedPane(panel) {
  focusedPane = panel;
  // Always remove both focus classes before deciding the new state, so
  // toggling from preview -> editor doesn't leave both focus-editor and
  // focus-preview stacked on workspace (which would hide both panes via
  // conflicting CSS rules). Pre-existing bug from v15.2 surfaced by the
  // mobile toggle, which flips between modes on every click.
  workspace.classList.remove('focus-editor', 'focus-preview');
  if (panel === null) {
    focusEditorIconIn.setAttribute('hidden', '');
    focusPreviewIconIn.setAttribute('hidden', '');
    focusEditorIconOut.removeAttribute('hidden', '');
    focusPreviewIconOut.removeAttribute('hidden', '');
    focusEditorBtn.title = 'Focus Editor';
    focusPreviewBtn.title = 'Focus Preview';
  } else {
    workspace.classList.add('focus-' + panel);
    if (panel === 'editor') {
      focusEditorIconIn.removeAttribute('hidden');
      focusEditorIconOut.setAttribute('hidden', '');
      focusEditorBtn.title = 'Restore Split View';
    } else {
      focusPreviewIconIn.removeAttribute('hidden');
      focusPreviewIconOut.setAttribute('hidden', '');
      focusPreviewBtn.title = 'Restore Split View';
    }
    // Mobile toggle button title (v15.3 post-load UX): focus-preview-btn is a
    // single mobile toggle. Title reflects what the click will do, not the
    // current state. On desktop the title stays 'Restore Split View' (set
    // above) - the button retains its original toggle behavior.
    if (isMobile) {
      focusPreviewBtn.title = panel === 'editor' ? 'Switch to Preview' : 'Switch to Edit';
    }
  }
}

// Welcome State (v15.3): toggles welcome screen and address-bar visibility.
// Welcome screen is mobile-only (< 800px); on desktop, the empty editor+toolbar
// drop-zone is sufficient greeter UX. The drop-zone is always visible when the
// toolbar is visible (no JS-driven hide) - matches v15.2 behavior. On mobile
// welcome, the toolbar is hidden by parent display:none, so the drop-zone is
// naturally invisible regardless of its own class.
//
// Step 48 (mobile fresh-document entry point): toolbar is now kept visible on
// mobile welcome so the hamburger menu (Open File / Save / Save As / Theme /
// Credits / Guide) is accessible. The drop-zone is hidden on mobile via CSS
// regardless; the mobile-toolbar-spacer shows in its place. The hamburger
// position is unchanged (upper-right default).
function updateWelcomeState() {
  const hasContent = currentFileName || editor.value.trim() || inFreshDocumentMode;
  isWelcome = isMobile && !hasContent;
  if (isWelcome) {
    welcomeScreen.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    actionBar.classList.add('hidden');
  } else {
    welcomeScreen.classList.add('hidden');
    toolbar.classList.remove('hidden');
    actionBar.classList.toggle('hidden', !hasContent);
  }
}

focusEditorBtn.addEventListener('click', () => {
  if (isMobile) {
    setFocusedPane('editor');
  } else {
    setFocusedPane(focusedPane === 'editor' ? null : 'editor');
  }
});

focusPreviewBtn.addEventListener('click', () => {
  if (isMobile) {
    // Mobile toggle (v15.3 post-load UX): focus-preview-btn is a single
    // mobile toggle between preview and editor modes. Click flips state.
    setFocusedPane(focusedPane === 'preview' ? 'editor' : 'preview');
  } else {
    setFocusedPane(focusedPane === 'preview' ? null : 'preview');
  }
});

// Copy Raw Markdown (Left Pane)
copyEditorBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    triggerCopyFeedback(copyEditorBtn, copyEditorCopy, copyEditorCheck);
  } catch (err) {
    console.error('Failed to copy editor content:', err);
  }
});

// Copy Rendered Content (Right Pane - Multi-MIME HTML & Text)
copyPreviewBtn.addEventListener('click', async () => {
  try {
    const htmlContent = preview.innerHTML;
    const plainContent = preview.innerText;

    const blobHtml = new Blob([htmlContent], { type: 'text/html' });
    const blobText = new Blob([plainContent], { type: 'text/plain' });

    const data = [
      new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      })
    ];

    await navigator.clipboard.write(data);
    triggerCopyFeedback(copyPreviewBtn, copyPreviewCopy, copyPreviewCheck);
  } catch (err) {
    // Fallback for restricted ClipboardItem environments
    try {
      await navigator.clipboard.writeText(preview.innerText);
      triggerCopyFeedback(copyPreviewBtn, copyPreviewCopy, copyPreviewCheck);
    } catch (fallbackErr) {
      console.error('Failed to copy preview content:', fallbackErr);
    }
  }
});

// Select Feedback Visualizer
function triggerSelectFeedback(button, cursorIcon, checkIcon) {
  button.classList.add('selected');
  cursorIcon.setAttribute('hidden', '');
  checkIcon.removeAttribute('hidden');

  setTimeout(() => {
    button.classList.remove('selected');
    cursorIcon.removeAttribute('hidden');
    checkIcon.setAttribute('hidden', '');
  }, 1500);
}

// Select All Raw Markdown (Left Pane)
selectEditorBtn.addEventListener('click', () => {
  editor.focus();
  editor.select();
  triggerSelectFeedback(selectEditorBtn, selectEditorCursor, selectEditorCheck);
});

// Select All Rendered Content (Right Pane)
selectPreviewBtn.addEventListener('click', () => {
  const range = document.createRange();
  range.selectNodeContents(preview);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  triggerSelectFeedback(selectPreviewBtn, selectPreviewCursor, selectPreviewCheck);
});

// IndexedDB Helpers
function openIDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandleInIDB(handle) {
  if (!handle) return;
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('IDB store failed:', err);
  }
}

async function loadHandleFromIDB() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const result = await new Promise((resolve, reject) => {
      const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.warn('IDB load failed:', err);
    return null;
  }
}

async function clearHandleInIDB() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('IDB clear failed:', err);
  }
}

async function ensureHandlePermission(handle, mode = 'readwrite') {
  if (!handle) return null;
  try {
    const opts = { mode };
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(opts);
      if (current === 'granted') return 'granted';
    }
    if (typeof handle.requestPermission === 'function') {
      return await handle.requestPermission(opts);
    }
    return 'prompt';
  } catch (err) {
    console.warn('Permission check failed:', err);
    return null;
  }
}

async function tryReacquireHandle() {
  const handle = await loadHandleFromIDB();
  if (!handle) return null;
  try {
    const status = await ensureHandlePermission(handle, 'readwrite');
      if (status === 'granted') {
        currentFileHandle = handle;
        if (!currentFileName) {
          try {
            const file = await handle.getFile();
            currentFileName = file.name;
            currentFileLastModified = file.lastModified;
          } catch (err) {
            console.debug('tryReacquireHandle: handle.getFile() failed:', err);
          }
        }
        updateAddressBar();
        return handle;
      }
      await clearHandleInIDB();
      return null;
    } catch (err) {
      console.debug('tryReacquireHandle: handle re-acquisition failed:', err);
      await clearHandleInIDB();
      return null;
    }
}

// Session Persistence
function buildSnapshot() {
  return {
    content: editor.value,
    fileName: currentFileName,
    fileLastModified: currentFileLastModified,
    savedAt: Date.now()
  };
}

function persistSession({ immediate = false } = {}) {
  const snap = buildSnapshot();
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snap));
  } catch (err) {
    console.warn('sessionStorage write failed:', err);
  }
  if (snap.content.length > 0 || snap.fileName) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(snap));
    } catch (err) {
      console.warn('localStorage write failed:', err);
    }
  }
}

function scheduleSessionSave() {
  if (sessionSaveTimeout) {
    clearTimeout(sessionSaveTimeout);
  }
  sessionSaveTimeout = setTimeout(() => {
    persistSession();
    sessionSaveTimeout = null;
  }, SESSION_SAVE_DEBOUNCE_MS);
}

function readSnapshot(store, key) {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch (err) {
    console.debug('readSnapshot: JSON parse failed, returning null:', err);
    return null;
  }
}

// Address Bar Indicator
function updateAddressBar() {
  if (currentFileName) {
    addressBarName.textContent = currentFileName;
    if (currentFileLastModified) {
      const dateStr = new Date(currentFileLastModified).toLocaleString();
      addressBarMeta.textContent = ` · ${dateStr}`;
    } else {
      addressBarMeta.textContent = '';
    }
    actionBar.classList.add('has-file');
  } else {
    addressBarName.textContent = 'No File Loaded';
    addressBarMeta.textContent = '';
    actionBar.classList.remove('has-file');
  }
}

// Restore Banner
function showRestoreBanner(snap) {
  if (!snap) return;
  restoreBannerText.textContent = '';
  if (snap.fileName) {
    restoreBannerText.append(
      'Restore previous document ',
      Object.assign(document.createElement('strong'), { textContent: String(snap.fileName) }),
      '?'
    );
  } else {
    restoreBannerText.textContent = 'Restore previous document?';
  }
  restoreBanner.classList.remove('hidden');

  restoreBannerRestore.onclick = async () => {
    editor.value = snap.content || '';
    currentFileName = snap.fileName || null;
    currentFileLastModified = snap.fileLastModified || null;
    renderMarkdown();
    persistSession({ immediate: true });
    updateAddressBar();
    await tryReacquireHandle();
    updateWelcomeState();
    hideRestoreBanner();
  };

  restoreBannerDismiss.onclick = () => {
    try {
      localStorage.removeItem(LAST_KEY);
    } catch (err) {
      console.warn('localStorage remove failed:', err);
    }
    hideRestoreBanner();
  };
}

function hideRestoreBanner() {
  restoreBanner.classList.add('hidden');
  restoreBannerRestore.onclick = null;
  restoreBannerDismiss.onclick = null;
}

// Startup: Restore Session + Handle + Banner
(async function init() {
  let sessionSnap = readSnapshot(sessionStorage, SESSION_KEY);

  if (sessionSnap && typeof sessionSnap.content === 'string') {
    editor.value = sessionSnap.content;
    currentFileName = sessionSnap.fileName || null;
    currentFileLastModified = sessionSnap.fileLastModified || null;
    renderMarkdown();
    updateAddressBar();
  }

  if (sessionSnap) {
    await tryReacquireHandle();
  }

  if (!sessionSnap) {
    const lastSnap = readSnapshot(localStorage, LAST_KEY);
    if (lastSnap && (lastSnap.content || lastSnap.fileName)) {
      showRestoreBanner(lastSnap);
    }
  }

  updateWelcomeState();
})();

// Mobile viewport handling (v15.3): debounced resize listener
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (wasMobile !== isMobile) {
      if (isMobile && focusedPane === null) {
        setFocusedPane('preview');
      }
      updateWelcomeState();
    }
  }, 100);
});
