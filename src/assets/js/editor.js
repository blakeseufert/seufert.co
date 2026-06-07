const tokenKey = "seufert-editor-token";
const editorConfig = {
  owner: document.querySelector('meta[name="github-owner"]')?.content.trim() || "blakeseufert",
  repo: document.querySelector('meta[name="github-repo"]')?.content.trim() || "seufert.co",
  branch: document.querySelector('meta[name="github-branch"]')?.content.trim() || "main",
  postsDir: normalizeDir(document.querySelector('meta[name="github-posts-dir"]')?.content || "src/posts")
};
const siteBasePath = document.querySelector('meta[name="site-base-path"]')?.content.trim() || "/";
const defaultCoverPath = "/assets/uploads/article-office.webp";
const pendingImages = [];

const els = {
  authGate: document.querySelector("#authGate"),
  authTitle: document.querySelector("#authTitle"),
  authCopy: document.querySelector("#authCopy"),
  authHelp: document.querySelector(".auth-help"),
  editorApp: document.querySelector("#editorApp"),
  authButton: document.querySelector("#authButton"),
  token: document.querySelector("#tokenInput"),
  tokenField: document.querySelector("#tokenField"),
  publishPostButton: document.querySelector("#publishPostButton"),
  refreshPostsButton: document.querySelector("#refreshPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  coverImageInput: document.querySelector("#coverImageInput"),
  coverButtonText: document.querySelector("#coverButtonText"),
  coverPreview: document.querySelector("#coverPreview"),
  imageButton: document.querySelector("#imageButton"),
  imageInput: document.querySelector("#imageInput"),
  dirtyState: document.querySelector("#dirtyState"),
  status: document.querySelector("#statusLine"),
  editorUser: document.querySelector("#editorUser"),
  editor: document.querySelector("#editorCanvas"),
  postList: document.querySelector("#postList"),
  title: document.querySelector("#titleInput"),
  date: document.querySelector("#dateInput")
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let posts = [];
let currentPost = null;
let signedInUser = null;
let uploadTarget = "inline";
let activeGallery = null;
let activeImageForGallery = null;
let lastCleanSnapshot = "";
let isDirty = false;

function setStatus(message) {
  els.status.textContent = message;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled-note";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getTitle() {
  return els.title.textContent.trim() || "Untitled note";
}

function setTitle(value) {
  els.title.textContent = value || "Untitled note";
}

function currentSlug() {
  if (currentPost) return slugify(currentPost.name.replace(/\.md$/, ""));
  return slugify(getTitle());
}

function setPublishLabel() {
  const action = currentPost ? "Update" : "Publish";
  els.publishPostButton.textContent = isDirty ? `${action} *` : action;
}

function editorSnapshot() {
  return JSON.stringify({
    title: getTitle(),
    date: els.date.value || today(),
    cover: coverPath(),
    body: editorMarkdown()
  });
}

function setCleanState() {
  lastCleanSnapshot = editorSnapshot();
  isDirty = false;
  updateDirtyState();
}

function checkDirtyState() {
  const nextDirty = editorSnapshot() !== lastCleanSnapshot;
  if (nextDirty === isDirty) {
    setPublishLabel();
    return;
  }
  isDirty = nextDirty;
  updateDirtyState();
}

function updateDirtyState() {
  els.editorApp.classList.toggle("editor-app--dirty", isDirty);
  els.dirtyState.hidden = !isDirty;
  if (isDirty) {
    els.dirtyState.textContent = currentPost ? "Unpublished edits" : "Unpublished draft";
  }
  setPublishLabel();
  renderPostList();
}

function canDiscardChanges() {
  return !isDirty || confirm("You have unpublished changes. Discard them?");
}

function base64FromText(value) {
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function textFromBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return decoder.decode(bytes);
}

function normalizeDir(value) {
  return String(value || "src/posts").trim().replace(/^\/+|\/+$/g, "") || "src/posts";
}

function publicUrl(path) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path;
  const cleanBase = siteBasePath === "/" ? "" : siteBasePath.replace(/\/$/, "");
  if (cleanBase && path.startsWith(`${cleanBase}/`)) return path;
  return `${cleanBase}${path}`;
}

function getConfig() {
  return {
    ...editorConfig
  };
}

function loadConfig() {
  els.date.value = today();

  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hashParams.get("token") || hashParams.get("github_token");
    if (token) {
      localStorage.setItem(tokenKey, token.trim());
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    }
  } catch {
    setStatus("Editor settings could not be loaded.");
  }
}

function githubHeaders() {
  const token = localStorage.getItem(tokenKey);
  if (!token) {
    throw new Error("Sign in with GitHub first.");
  }

  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function apiPath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function githubApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...githubHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `GitHub returned ${response.status}.`);
  }

  return response;
}

async function githubRequest(path, options = {}) {
  const config = getConfig();
  if (!config.owner || !config.repo) {
    throw new Error("Add repository owner and repo.");
  }

  return githubApi(`https://api.github.com/repos/${config.owner}/${config.repo}/${path}`, options);
}

async function putFile(repoPath, base64Content, message) {
  const config = getConfig();
  const encodedPath = apiPath(repoPath);
  let sha;

  const existing = await githubRequest(`contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`);
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }

  const response = await githubRequest(`contents/${encodedPath}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: config.branch,
      sha
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "GitHub save failed.");
  }

  return response.json();
}

async function deleteFile(repoPath, sha, message) {
  const config = getConfig();
  const response = await githubRequest(`contents/${apiPath(repoPath)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      branch: config.branch,
      sha
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "GitHub delete failed.");
  }
}

async function validateSession() {
  const token = localStorage.getItem(tokenKey);
  if (!token) {
    showAuthGate();
    return;
  }

  try {
    const response = await githubApi("https://api.github.com/user");
    if (!response.ok) throw new Error("GitHub token is no longer valid.");
    signedInUser = await response.json();
    showEditor();
    await loadPostList();
    if (posts.length && !currentPost) {
      await loadSelectedPost(posts[0].path);
    }
  } catch (error) {
    localStorage.removeItem(tokenKey);
    signedInUser = null;
    showAuthGate();
    setStatus(error.message || "Please sign in again.");
  }
}

function showAuthGate() {
  els.authGate.hidden = false;
  els.authGate.classList.remove("editor-auth--connected");
  els.editorApp.hidden = true;
  els.editorUser.hidden = true;
  els.tokenField.hidden = false;
  els.authHelp.hidden = false;
  els.authTitle.textContent = "Sign in";
  els.authCopy.hidden = false;
  els.authButton.textContent = "Connect token";
  setStatus("Paste a repo-scoped GitHub token once. It stays in this browser until you sign out.");
}

function showEditor() {
  els.authGate.hidden = false;
  els.authGate.classList.add("editor-auth--connected");
  els.editorApp.hidden = false;
  els.editorUser.hidden = false;
  els.tokenField.hidden = true;
  els.authHelp.hidden = true;
  els.authTitle.textContent = "Editor";
  els.authCopy.hidden = true;
  els.editorUser.textContent = signedInUser ? `Signed in as ${signedInUser.login}` : "";
  els.authButton.textContent = "Sign out";
  setStatus("GitHub connected.");
}

async function connectToken() {
  const token = els.token.value.trim();
  if (!token) {
    setStatus("Paste a GitHub token first.");
    return;
  }

  localStorage.setItem(tokenKey, token);
  els.token.value = "";
  setStatus("Checking token...");
  await validateSession();
}

function signOut() {
  localStorage.removeItem(tokenKey);
  signedInUser = null;
  posts = [];
  currentPost = null;
  renderPostList();
  showAuthGate();
  setStatus("Signed out.");
}

function selectedText() {
  return window.getSelection()?.toString() || "";
}

function plainParagraphFromBlock(block) {
  const paragraph = document.createElement("p");
  const onlyChild = block?.children.length === 1 ? block.children[0] : null;
  if (onlyChild?.tagName === "P") {
    paragraph.innerHTML = onlyChild.innerHTML;
  } else if (block) {
    paragraph.innerHTML = block.innerHTML;
  }
  if (!paragraph.textContent.trim()) paragraph.innerHTML = "<br>";
  return paragraph;
}

function applyQuoteBlock(className = "") {
  const block = currentBlock();
  if (!block) return;

  if (block.tagName === "BLOCKQUOTE" && (!className || block.classList.contains(className))) {
    replaceBlock(block, plainParagraphFromBlock(block));
    return;
  }

  const quote = document.createElement("blockquote");
  if (className) quote.className = `quote ${className}`;
  quote.innerHTML = block.innerHTML || escapeHtml(selectedText() || "Quote text");
  replaceBlock(block, quote);
}

function runCommand(command) {
  els.editor.focus();

  if (command === "h2") document.execCommand("formatBlock", false, "h2");
  if (command === "h3") document.execCommand("formatBlock", false, "h3");
  if (command === "bold") document.execCommand("bold");
  if (command === "ul") document.execCommand("insertUnorderedList");
  if (command === "link") {
    const url = prompt("URL");
    if (url) document.execCommand("createLink", false, url);
  }
  if (command === "quote") {
    applyQuoteBlock();
  }
  if (command === "pullquote") {
    applyQuoteBlock("quote--pull");
  }
  if (command === "embed") {
    const input = prompt("Paste a YouTube URL, iframe, or embed HTML. It will be saved into the post markdown.");
    if (input) insertEmbed(input);
  }

  checkDirtyState();
  updateToolbarState();
}

function insertEmbed(input) {
  const youtubeId = parseYoutubeId(input);
  const galleryItems = parseGalleryShortcode(input);

  if (galleryItems) {
    document.execCommand("insertHTML", false, `${galleryEditorHtml(galleryItems)}<p><br></p>`);
    return;
  }

  const markdown = youtubeId ? `{% youtube "${youtubeId}", "Embedded video" %}` : input;
  document.execCommand("insertHTML", false, `${embedEditorHtml(markdown, youtubeId)}<p><br></p>`);
}

function parseYoutubeId(value) {
  const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : "";
}

function embedEditorHtml(markdown, youtubeId = "") {
  if (youtubeId) {
    return mediaEditorHtml(markdown, `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}" title="Embedded video"></iframe>`);
  }

  return `<figure class="editor-embed" contenteditable="false" data-md="${escapeHtml(markdown)}"><div class="editor-embed__label">Embed saved</div><pre>${escapeHtml(markdown)}</pre></figure>`;
}

function mediaEditorHtml(markdown, mediaHtml) {
  return `
    <figure class="media-embed editor-embed editor-media" contenteditable="false" data-md="${escapeHtml(markdown)}">
      ${mediaHtml}
      <button class="editor-media__hit" data-media-action="select" type="button" aria-label="Select video"></button>
      <div class="editor-media__actions">
        <button class="pill pill--button" data-media-action="remove-media" type="button">Remove video</button>
      </div>
    </figure>`;
}

function parseVideoShortcode(value) {
  const match = String(value || "")
    .trim()
    .match(/^\{%\s*video\s+"([^"]+)"(?:,\s*"([^"]*)")?\s*%\}$/);

  if (!match) return null;
  return {
    src: match[1],
    title: match[2] || "Embedded video"
  };
}

function parseGalleryShortcode(value) {
  const match = String(value || "").trim().match(/^\{%\s*gallery\s+([\s\S]*?)\s*%\}$/);
  if (!match) return null;

  const items = [];
  const quotedValue = /"((?:\\.|[^"\\])*)"/g;
  let item;
  while ((item = quotedValue.exec(match[1]))) {
    const [src = "", alt = ""] = item[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .split("|");
    if (src.trim()) items.push({ src: src.trim(), alt: alt.trim() });
  }

  return items.length ? items : null;
}

function galleryId() {
  return `gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function galleryItemHtml({ src = "", alt = "" }, displaySrc = "") {
  const safeSrc = escapeHtml(src);
  const safeAlt = escapeHtml(alt);

  return `
    <figure class="editor-gallery__item" data-gallery-item>
      <img src="${escapeHtml(displaySrc || publicUrl(src))}" alt="${safeAlt}" data-md-src="${safeSrc}">
      <div class="editor-gallery__actions">
        <button class="pill pill--button" data-gallery-action="remove-item" type="button">Remove image</button>
      </div>
    </figure>`;
}

function galleryEditorHtml(items = []) {
  return `
    <section class="editor-gallery" contenteditable="false" data-gallery-id="${galleryId()}">
      <div class="gallery editor-gallery__grid">
        ${items.map((item) => galleryItemHtml(item, item.displaySrc)).join("")}
      </div>
      <div class="editor-gallery__controls">
        <button class="pill pill--button" data-gallery-action="add-image" type="button">Add image</button>
      </div>
    </section>`;
}

function appendGalleryImage(gallery, dataUrl, publicPath) {
  const grid = gallery.querySelector(".editor-gallery__grid");
  if (!grid) return;
  grid.insertAdjacentHTML("beforeend", galleryItemHtml({ src: publicPath }, dataUrl));
}

function handleGalleryAction(event) {
  const action = event.target.closest("[data-gallery-action]");
  const selectedItem = event.target.closest("[data-gallery-item]");

  if (!action && selectedItem && event.target.tagName === "IMG") {
    selectedItem
      .closest(".editor-gallery")
      ?.querySelectorAll("[data-gallery-item].editor-gallery__item--selected")
      .forEach((item) => item.classList.remove("editor-gallery__item--selected"));
    selectedItem.classList.add("editor-gallery__item--selected");
    return;
  }

  if (!action) return;

  event.preventDefault();
  const gallery = action.closest(".editor-gallery");
  const item = action.closest("[data-gallery-item]");

  if (action.dataset.galleryAction === "add-image" && gallery) {
    activeGallery = gallery;
    uploadTarget = "gallery";
    els.imageInput.click();
    return;
  }

  if (action.dataset.galleryAction === "remove-item" && item) {
    item.remove();
  }

  checkDirtyState();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineHtml(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function currentBlock() {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return null;

  let node = selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
  while (node && node.parentElement !== els.editor) {
    node = node.parentElement;
  }
  return node;
}

function isSelectionInEditor() {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return false;
  const node = selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
  return node === els.editor || els.editor.contains(node);
}

function updateToolbarState() {
  if (!isSelectionInEditor()) return;

  const block = currentBlock();
  const blockTag = block?.tagName?.toLowerCase() || "";
  const inBlockquote = block?.tagName === "BLOCKQUOTE";
  const commandStates = {
    bold: document.queryCommandState("bold"),
    ul: document.queryCommandState("insertUnorderedList"),
    h2: blockTag === "h2",
    h3: blockTag === "h3",
    quote: inBlockquote && !block.classList.contains("quote--pull"),
    pullquote: inBlockquote && block.classList.contains("quote--pull")
  };

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.classList.toggle("pill--active", Boolean(commandStates[button.dataset.command]));
  });
}

function replaceBlock(block, replacement) {
  block.replaceWith(replacement);
  const range = document.createRange();
  range.selectNodeContents(replacement);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleMarkdownShortcut(event) {
  if (event.key !== " ") return;

  const block = currentBlock();
  if (!block || block.tagName !== "P") return;

  const text = block.textContent;
  const transforms = [
    { prefix: "### ", tag: "h3" },
    { prefix: "## ", tag: "h2" },
    { prefix: "# ", tag: "h1" },
    { prefix: "> ", tag: "blockquote" }
  ];
  const transform = transforms.find((item) => text.startsWith(item.prefix));

  if (transform) {
    const replacement = document.createElement(transform.tag);
    replacement.textContent = text.slice(transform.prefix.length) || "";
    replaceBlock(block, replacement);
    return;
  }

  if (text.startsWith("- ")) {
    const list = document.createElement("ul");
    const item = document.createElement("li");
    item.textContent = text.slice(2);
    list.append(item);
    replaceBlock(block, list);
  }
}

function safeFileName(name) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "upload.png";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setCoverPreview(src = "", mdSrc = "") {
  if (!src && !mdSrc) {
    els.coverPreview.hidden = true;
    els.coverPreview.removeAttribute("src");
    delete els.coverPreview.dataset.mdSrc;
    els.coverButtonText.textContent = "Add image";
    return;
  }

  els.coverPreview.src = src || publicUrl(mdSrc);
  els.coverPreview.dataset.mdSrc = mdSrc || src;
  els.coverPreview.hidden = false;
  els.coverButtonText.textContent = "Change image";
}

function firstInlineImagePath() {
  const image = els.editor.querySelector("img[data-md-src]");
  return image?.dataset.mdSrc || "";
}

function coverPath() {
  return els.coverPreview.dataset.mdSrc || firstInlineImagePath() || defaultCoverPath;
}

function selectedImageBlock() {
  return els.editor.querySelector(".editor-image--selected");
}

function rememberSelectedImageForUpload() {
  const selectedImage = selectedImageBlock();
  activeImageForGallery = selectedImage && els.editor.contains(selectedImage) ? selectedImage : null;
}

function imageBlockItem(imageBlock) {
  const image = imageBlock.querySelector("img");
  return {
    src: image?.dataset.mdSrc || "",
    alt: image?.alt || ""
  };
}

function convertImageToGallery(imageBlock, dataUrl, publicPath) {
  const firstItem = imageBlockItem(imageBlock);
  if (!firstItem.src) return false;

  imageBlock.insertAdjacentHTML(
    "beforebegin",
    galleryEditorHtml([
      firstItem,
      {
        src: publicPath,
        displaySrc: dataUrl
      }
    ])
  );

  const gallery = imageBlock.previousElementSibling;
  imageBlock.remove();
  gallery?.querySelector("[data-gallery-item]:last-child")?.classList.add("editor-gallery__item--selected");
  return true;
}

function insertInlineImage(dataUrl, publicPath) {
  const html = `${imageEditorHtml({ src: publicPath }, dataUrl)}<p><br></p>`;
  const selectedImage = activeImageForGallery && els.editor.contains(activeImageForGallery)
    ? activeImageForGallery
    : selectedImageBlock();

  if (selectedImage) {
    if (convertImageToGallery(selectedImage, dataUrl, publicPath)) {
      activeImageForGallery = null;
      return;
    }
  }

  els.editor.focus();
  document.execCommand("insertHTML", false, html);
}

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const extensionPath = `/assets/uploads/${currentSlug()}-${safeFileName(file.name)}`;
  const [, base64Content] = String(dataUrl).split(",");

  pendingImages.push({
    repoPath: `src${extensionPath}`,
    publicPath: extensionPath,
    base64Content
  });

  if (uploadTarget === "cover") {
    setCoverPreview(dataUrl, extensionPath);
  } else if (uploadTarget === "gallery" && activeGallery) {
    appendGalleryImage(activeGallery, dataUrl, extensionPath);
  } else {
    insertInlineImage(dataUrl, extensionPath);
  }

  checkDirtyState();
  setStatus(`Queued ${file.name}.`);
  event.target.value = "";
  uploadTarget = "inline";
  activeGallery = null;
  activeImageForGallery = null;
}

function inlineMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const content = Array.from(node.childNodes).map(inlineMarkdown).join("");

  if (node.tagName === "A") return `[${content}](${node.getAttribute("href")})`;
  if (node.tagName === "B" || node.tagName === "STRONG") return `**${content}**`;
  if (node.tagName === "I" || node.tagName === "EM") return `_${content}_`;
  if (node.tagName === "BR") return "\n";
  return content;
}

function imageEditorHtml({ src = "", alt = "", layout = "left" }, displaySrc = "") {
  const imageLayout = layout === "full" ? "full" : "left";
  const toggleLabel = imageLayout === "full" ? "Left align" : "Full width";

  return `
    <figure class="editor-image editor-image--${imageLayout}" contenteditable="false" data-image-layout="${imageLayout}">
      <img src="${escapeHtml(displaySrc || publicUrl(src))}" alt="${escapeHtml(alt)}" data-md-src="${escapeHtml(src)}">
      <div class="editor-image__actions">
        <button class="pill pill--button" data-image-action="toggle-layout" type="button">${toggleLabel}</button>
        <label class="pill pill--button">Add to gallery <input data-image-gallery-file type="file" accept="image/*" hidden></label>
        <button class="pill pill--button" data-image-action="remove-image" type="button">Remove image</button>
      </div>
    </figure>`;
}

function parseImageShortcode(value) {
  const match = String(value || "")
    .trim()
    .match(/^\{%\s*image\s+"([^"]+)"(?:,\s*"([^"]*)")?(?:,\s*"([^"]*)")?\s*%\}$/);

  if (!match) return null;
  return {
    src: match[1],
    alt: match[2] || "",
    layout: match[3] === "full" ? "full" : "left"
  };
}

function imageMarkdown(node) {
  const image = node.querySelector("img");
  const src = image?.dataset.mdSrc || "";
  const alt = image?.alt || "";
  const layout = node.dataset.imageLayout === "full" ? "full" : "left";
  if (!src) return "";

  if (layout === "full") {
    return `{% image "${galleryField(src)}", "${galleryField(alt)}", "full" %}`;
  }

  return `![${alt}](${src})`;
}

function setImageLayout(node, layout) {
  const imageLayout = layout === "full" ? "full" : "left";
  const button = node.querySelector("[data-image-action='toggle-layout']");
  node.dataset.imageLayout = imageLayout;
  node.classList.toggle("editor-image--full", imageLayout === "full");
  node.classList.toggle("editor-image--left", imageLayout !== "full");
  if (button) button.textContent = imageLayout === "full" ? "Left align" : "Full width";
}

function handleImageAction(event) {
  const action = event.target.closest("[data-image-action]");
  const imageBlock = event.target.closest(".editor-image");

  if (!action && imageBlock && event.target.tagName === "IMG") {
    els.editor
      .querySelectorAll(".editor-image--selected")
      .forEach((item) => item.classList.remove("editor-image--selected"));
    imageBlock.classList.add("editor-image--selected");
    return;
  }

  if (!action || !imageBlock) return;

  event.preventDefault();
  if (action.dataset.imageAction === "toggle-layout") {
    const nextLayout = imageBlock.dataset.imageLayout === "full" ? "left" : "full";
    setImageLayout(imageBlock, nextLayout);
  }

  if (action.dataset.imageAction === "remove-image") {
    if (activeImageForGallery === imageBlock) activeImageForGallery = null;
    imageBlock.remove();
    if (!els.editor.children.length) els.editor.innerHTML = "<p><br></p>";
  }

  checkDirtyState();
}

function handleEditorImageUpload(event) {
  if (!event.target.matches("[data-image-gallery-file]")) return;

  activeImageForGallery = event.target.closest(".editor-image");
  uploadTarget = "inline";
  handleImageUpload(event).catch((error) => setStatus(error.message));
}

function handleMediaAction(event) {
  const action = event.target.closest("[data-media-action]");
  const media = event.target.closest(".editor-media");
  if (!action || !media) return;

  event.preventDefault();

  if (action.dataset.mediaAction === "select") {
    els.editor
      .querySelectorAll(".editor-media--selected")
      .forEach((item) => item.classList.remove("editor-media--selected"));
    media.classList.add("editor-media--selected");
    return;
  }

  if (action.dataset.mediaAction === "remove-media") {
    media.remove();
    if (!els.editor.children.length) els.editor.innerHTML = "<p><br></p>";
    checkDirtyState();
  }
}

function blockMarkdown(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const text = inlineMarkdown(node).trim();
  if (node.classList.contains("editor-gallery")) return galleryMarkdown(node);
  if (node.classList.contains("editor-image")) return imageMarkdown(node);
  if (node.dataset.md) return node.dataset.md;
  if (node.tagName === "H1") return `# ${text}`;
  if (node.tagName === "H2") return `## ${text}`;
  if (node.tagName === "H3") return `### ${text}`;
  if (node.tagName === "P") return text;
  if (node.tagName === "IMG") return `![${node.alt || ""}](${node.dataset.mdSrc || node.src})`;

  if (node.tagName === "UL") {
    return Array.from(node.children)
      .map((item) => `- ${inlineMarkdown(item).trim()}`)
      .join("\n");
  }

  if (node.tagName === "OL") {
    return Array.from(node.children)
      .map((item, index) => `${index + 1}. ${inlineMarkdown(item).trim()}`)
      .join("\n");
  }

  if (node.tagName === "BLOCKQUOTE") {
    if (node.classList.contains("quote--pull")) {
      return `{% pullquote %}\n${text}\n{% endpullquote %}`;
    }
    if (node.classList.contains("quote--quiet")) {
      return `{% quietquote %}\n${text}\n{% endquietquote %}`;
    }
    return text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (node.tagName === "FIGURE") {
    const image = node.querySelector("img");
    if (image) return `![${image.alt || ""}](${image.dataset.mdSrc || image.src})`;
  }

  return text;
}

function galleryField(value) {
  return String(value || "")
    .trim()
    .replace(/\|/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function galleryMarkdown(node) {
  const items = Array.from(node.querySelectorAll("[data-gallery-item]"))
    .map((item) => {
      const image = item.querySelector("img");
      const src = image?.dataset.mdSrc || "";
      const alt = image?.alt || "";
      if (!src) return "";

      return `"${[src, alt].map(galleryField).join("|")}"`;
    })
    .filter(Boolean);

  return items.length ? `{% gallery ${items.join(", ")} %}` : "";
}

function editorMarkdown() {
  return Array.from(els.editor.children)
    .map(blockMarkdown)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function yamlString(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlValue(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: markdown };

  const data = {};
  const tags = [];
  const lines = match[1].split("\n");
  let inTags = false;

  lines.forEach((line) => {
    if (line.trim() === "tags:") {
      inTags = true;
      return;
    }

    if (inTags && line.startsWith("  - ")) {
      const tag = yamlValue(line.slice(4));
      if (tag && tag !== "posts") tags.push(tag);
      return;
    }

    inTags = false;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) data[pair[1]] = yamlValue(pair[2]);
  });

  data.tags = tags;
  return { data, body: match[2].trim() };
}

function plainEditorText() {
  return Array.from(els.editor.children)
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(" ");
}

function excerptText() {
  return plainEditorText().replace(/\s+/g, " ").slice(0, 180);
}

function publishDate() {
  if (!els.date.value) els.date.value = today();
  return els.date.value;
}

function frontmatter() {
  const lines = [
    "---",
    "layout: layouts/post.njk",
    `title: ${yamlString(getTitle())}`,
    `date: ${publishDate()}`,
    `excerpt: ${yamlString(excerptText())}`,
    `cover: ${yamlString(coverPath())}`,
    `coverAlt: ${yamlString(getTitle())}`,
    "---"
  ];

  return lines.join("\n");
}

function markdownToEditorHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/).filter((block) => block.trim());

  return blocks.map((block) => {
    const value = block.trim();
    const image = value.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const imageShortcode = parseImageShortcode(value);
    const youtube = value.match(/^\{%\s*youtube\s+"([^"]+)"(?:,\s*"([^"]+)")?\s*%\}$/);
    const video = parseVideoShortcode(value);
    const gallery = parseGalleryShortcode(value);
    const pullquote = value.match(/^\{%\s*pullquote[^%]*%\}\n?([\s\S]*?)\n?\{%\s*endpullquote\s*%\}$/);
    const quietquote = value.match(/^\{%\s*quietquote[^%]*%\}\n?([\s\S]*?)\n?\{%\s*endquietquote\s*%\}$/);

    if (imageShortcode) {
      return imageEditorHtml(imageShortcode);
    }

    if (gallery) {
      return galleryEditorHtml(gallery);
    }

    if (youtube) {
      const title = youtube[2] || "Embedded video";
      const shortcode = `{% youtube "${youtube[1]}", "${title}" %}`;
      return mediaEditorHtml(shortcode, `<iframe src="https://www.youtube-nocookie.com/embed/${youtube[1]}" title="${escapeHtml(title)}"></iframe>`);
    }

    if (video) {
      const shortcode = `{% video "${video.src}", "${video.title}" %}`;
      return mediaEditorHtml(shortcode, `<video controls preload="metadata" src="${escapeHtml(publicUrl(video.src))}" title="${escapeHtml(video.title)}"></video>`);
    }

    if (pullquote) {
      return `<blockquote class="quote quote--pull"><p>${inlineHtml(pullquote[1].trim())}</p></blockquote>`;
    }

    if (quietquote) {
      return `<blockquote class="quote quote--quiet"><p>${inlineHtml(quietquote[1].trim())}</p></blockquote>`;
    }

    if (image) {
      return imageEditorHtml({ src: image[2], alt: image[1] });
    }

    if (value.startsWith("### ")) return `<h3>${inlineHtml(value.slice(4))}</h3>`;
    if (value.startsWith("## ")) return `<h2>${inlineHtml(value.slice(3))}</h2>`;
    if (value.startsWith("# ")) return `<h1>${inlineHtml(value.slice(2))}</h1>`;

    if (/^- /.test(value)) {
      const items = value.split("\n").map((line) => line.replace(/^- /, "").trim());
      return `<ul>${items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`;
    }

    if (/^\d+\. /.test(value)) {
      const items = value.split("\n").map((line) => line.replace(/^\d+\. /, "").trim());
      return `<ol>${items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ol>`;
    }

    if (value.startsWith("> ")) {
      const quote = value.split("\n").map((line) => line.replace(/^> ?/, "")).join("\n");
      return `<blockquote>${inlineHtml(quote)}</blockquote>`;
    }

    if (value.startsWith("{% video") || value.startsWith("<")) {
      return embedEditorHtml(value);
    }

    return `<p>${inlineHtml(value)}</p>`;
  }).join("");
}

function resetEditor() {
  currentPost = null;
  pendingImages.splice(0);
  setTitle("Untitled note");
  els.date.value = today();
  setCoverPreview();
  els.editor.innerHTML = "<p>Start writing...</p>";
  setCleanState();
  setStatus("New post ready.");
}

function postPathFromSlug(slug) {
  return `${getConfig().postsDir}/${slug}.md`;
}

function renderPostList() {
  els.postList.innerHTML = "";

  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "post-list__empty";
    empty.textContent = "No posts found.";
    els.postList.append(empty);
    return;
  }

  posts.forEach((post) => {
    const item = document.createElement("div");
    item.className = "post-list__item";
    if (currentPost && currentPost.path === post.path) {
      item.classList.add("post-list__item--active");
      if (isDirty) item.classList.add("post-list__item--dirty");
    }

    const button = document.createElement("button");
    button.className = "post-list__select";
    button.type = "button";
    button.dataset.path = post.path;
    if (currentPost && currentPost.path === post.path) {
      button.setAttribute("aria-current", "true");
    }

    const title = document.createElement("span");
    title.className = "post-list__title";
    title.textContent = post.data.title || post.name.replace(/\.md$/, "");

    const meta = document.createElement("span");
    meta.className = "post-list__meta";
    meta.textContent = currentPost && currentPost.path === post.path && isDirty
      ? `${post.data.date || "No date"} - unpublished edits`
      : `${post.data.date || "No date"}${post.localOnly ? " - local only" : ""}`;

    button.append(title, meta);
    const actions = document.createElement("details");
    actions.className = "post-list__actions";

    const summary = document.createElement("summary");
    summary.className = "post-list__actions-toggle";
    summary.setAttribute("aria-label", `Actions for ${title.textContent}`);
    summary.textContent = "...";

    const menu = document.createElement("div");
    menu.className = "post-list__actions-menu";

    const duplicate = document.createElement("button");
    duplicate.className = "post-list__action";
    duplicate.type = "button";
    duplicate.dataset.action = "duplicate";
    duplicate.dataset.path = post.path;
    duplicate.textContent = "Duplicate";

    const remove = document.createElement("button");
    remove.className = "post-list__action post-list__action--danger";
    remove.type = "button";
    remove.dataset.action = "delete";
    remove.dataset.path = post.path;
    remove.textContent = "Delete";

    if (post.localOnly) {
      remove.disabled = true;
      remove.textContent = "Delete on GitHub only";
    }

    menu.append(duplicate, remove);
    actions.append(summary, menu);
    item.append(button, actions);
    els.postList.append(item);
  });
}

async function loadLocalPostManifest() {
  try {
    const response = await fetch(publicUrl("/editor/posts.json"), { cache: "no-store" });
    if (!response.ok) return [];
    const localPosts = await response.json();
    return Array.isArray(localPosts) ? localPosts : [];
  } catch (_error) {
    return [];
  }
}

async function loadPostList() {
  setStatus("Loading posts...");
  const config = getConfig();
  const localPosts = await loadLocalPostManifest();
  const response = await githubRequest(`contents/${apiPath(config.postsDir)}?ref=${encodeURIComponent(config.branch)}`);

  if (response.status === 404) {
    posts = localPosts.map((post) => ({ ...post, localOnly: true }));
    renderPostList();
    setStatus(`Loaded ${posts.length} local post${posts.length === 1 ? "" : "s"}. Saving will create files in GitHub.`);
    return;
  }

  const entries = await response.json();
  const markdownEntries = entries
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const loaded = await Promise.all(markdownEntries.map(async (entry) => {
    const file = await githubRequest(`contents/${apiPath(entry.path)}?ref=${encodeURIComponent(config.branch)}`);
    const data = await file.json();
    const markdown = textFromBase64(data.content || "");
    const parsed = parseFrontmatter(markdown);
    return {
      name: entry.name,
      path: entry.path,
      sha: data.sha,
      markdown,
      data: parsed.data,
      body: parsed.body,
      localOnly: false
    };
  }));

  const githubPaths = new Set(loaded.map((post) => post.path));
  const localOnlyPosts = localPosts
    .filter((post) => !githubPaths.has(post.path))
    .map((post) => ({ ...post, localOnly: true }));

  posts = [...loaded, ...localOnlyPosts].sort((a, b) => {
    const dateDiff = (Date.parse(b.data.date) || 0) - (Date.parse(a.data.date) || 0);
    return dateDiff || a.name.localeCompare(b.name);
  });
  renderPostList();
  const localOnlyCount = localOnlyPosts.length;
  setStatus(`Loaded ${posts.length} post${posts.length === 1 ? "" : "s"}${localOnlyCount ? ` (${localOnlyCount} local only)` : ""}.`);
}

async function loadSelectedPost(path) {
  if (!path) return;

  let post = posts.find((item) => item.path === path);
  if (!post) return;

  if (post.localOnly) {
    currentPost = post;
    pendingImages.splice(0);
    setTitle(post.data.title || post.name.replace(/\.md$/, ""));
    els.date.value = post.data.date || today();
    setCoverPreview(post.data.cover ? publicUrl(post.data.cover) : "", post.data.cover || "");
    els.editor.innerHTML = markdownToEditorHtml(post.body);
    setCleanState();
    setStatus("Loaded local-only post. Publishing will create it in GitHub.");
    return;
  }

  const config = getConfig();
  const response = await githubRequest(`contents/${apiPath(path)}?ref=${encodeURIComponent(config.branch)}`);
  const data = await response.json();
  const markdown = textFromBase64(data.content || "");
  const parsed = parseFrontmatter(markdown);

  post = {
    ...post,
    sha: data.sha,
    markdown,
    data: parsed.data,
    body: parsed.body
  };

  currentPost = post;
  pendingImages.splice(0);
  setTitle(post.data.title || post.name.replace(/\.md$/, ""));
  els.date.value = post.data.date || today();
  setCoverPreview(post.data.cover ? publicUrl(post.data.cover) : "", post.data.cover || "");
  els.editor.innerHTML = markdownToEditorHtml(post.body);
  setCleanState();
}

async function fetchPost(path) {
  const post = posts.find((item) => item.path === path);
  if (!post) throw new Error("Post not found.");

  if (post.localOnly) return post;

  const response = await githubRequest(`contents/${apiPath(path)}?ref=${encodeURIComponent(getConfig().branch)}`);
  const data = await response.json();
  const markdown = textFromBase64(data.content || "");
  const parsed = parseFrontmatter(markdown);

  return {
    ...post,
    sha: data.sha,
    markdown,
    data: parsed.data,
    body: parsed.body
  };
}

async function duplicatePost(path) {
  if (!canDiscardChanges()) return;

  const post = await fetchPost(path);
  currentPost = null;
  pendingImages.splice(0);
  setTitle(`Copy of ${post.data.title || post.name.replace(/\.md$/, "")}`);
  els.date.value = today();
  setCoverPreview(post.data.cover ? publicUrl(post.data.cover) : "", post.data.cover || "");
  els.editor.innerHTML = markdownToEditorHtml(post.body);
  lastCleanSnapshot = "";
  isDirty = true;
  updateDirtyState();
  setStatus("Duplicated as an unpublished draft. Publish when ready.");
}

async function savePost() {
  const slug = currentSlug();
  const wasUpdate = Boolean(currentPost && !currentPost.localOnly);

  setStatus("Uploading images...");
  for (const image of pendingImages.splice(0)) {
    await putFile(image.repoPath, image.base64Content, `Upload ${image.publicPath}`);
  }

  setStatus("Saving post...");
  const markdown = `${frontmatter()}\n\n${editorMarkdown()}\n`;
  const newPath = postPathFromSlug(slug);
  await putFile(newPath, base64FromText(markdown), `${wasUpdate ? "Update" : "Publish"} ${getTitle()}`);

  if (currentPost && !currentPost.localOnly && currentPost.path !== newPath) {
    await deleteFile(currentPost.path, currentPost.sha, `Remove renamed post ${currentPost.name}`);
  }

  await loadPostList();
  currentPost = posts.find((post) => post.path === newPath) || null;
  setCleanState();
  setStatus(`${wasUpdate ? "Post updated" : "Post published"}. GitHub Pages will rebuild on push.`);
}

async function deletePost(path) {
  const post = await fetchPost(path);
  const confirmed = confirm(`Delete "${post.data.title || post.name}" from ${post.path}?`);
  if (!confirmed) return;

  const deletingCurrent = currentPost && currentPost.path === post.path;

  setStatus("Deleting post...");
  await deleteFile(post.path, post.sha, `Delete ${post.data.title || post.name}`);
  if (deletingCurrent) resetEditor();
  await loadPostList();
  setStatus("Post deleted. GitHub Pages will rebuild on push.");
}

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => runCommand(button.dataset.command));
});

els.title.addEventListener("input", setPublishLabel);
els.title.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.editor.focus();
});
els.postList.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    event.preventDefault();
    action.closest("details")?.removeAttribute("open");
    const path = action.dataset.path;
    const promise = action.dataset.action === "duplicate" ? duplicatePost(path) : deletePost(path);
    promise.catch((error) => setStatus(error.message));
    return;
  }

  const item = event.target.closest("[data-path]");
  if (!item) return;
  if (currentPost && currentPost.path === item.dataset.path) return;
  if (!canDiscardChanges()) return;
  loadSelectedPost(item.dataset.path).catch((error) => setStatus(error.message));
});
els.editor.addEventListener("keyup", handleMarkdownShortcut);
els.editor.addEventListener("click", handleGalleryAction);
els.editor.addEventListener("click", handleImageAction);
els.editor.addEventListener("click", handleMediaAction);
els.editor.addEventListener("change", handleEditorImageUpload);
els.editor.addEventListener("input", () => {
  checkDirtyState();
  updateToolbarState();
});
els.editor.addEventListener("mouseup", updateToolbarState);
els.title.addEventListener("input", checkDirtyState);
els.date.addEventListener("input", checkDirtyState);
els.coverImageInput.addEventListener("change", (event) => {
  uploadTarget = "cover";
  handleImageUpload(event).catch((error) => setStatus(error.message));
});
els.imageButton.addEventListener("pointerdown", () => {
  if (uploadTarget !== "gallery") rememberSelectedImageForUpload();
});
els.imageInput.addEventListener("change", (event) => {
  if (uploadTarget !== "gallery") uploadTarget = "inline";
  handleImageUpload(event).catch((error) => setStatus(error.message));
});
els.publishPostButton.addEventListener("click", () => savePost().catch((error) => setStatus(error.message)));
els.refreshPostsButton.addEventListener("click", () => loadPostList().catch((error) => setStatus(error.message)));
els.newPostButton.addEventListener("click", () => {
  if (canDiscardChanges()) resetEditor();
});
els.authButton.addEventListener("click", () => {
  if (signedInUser) {
    signOut();
    return;
  }
  connectToken().catch((error) => setStatus(error.message));
});
document.addEventListener("selectionchange", updateToolbarState);
document.addEventListener("click", (event) => {
  if (event.target.closest(".post-list__actions")) return;
  document.querySelectorAll(".post-list__actions[open]").forEach((menu) => menu.removeAttribute("open"));

  if (!event.target.closest(".editor-gallery")) {
    document
      .querySelectorAll(".editor-gallery__item--selected")
      .forEach((item) => item.classList.remove("editor-gallery__item--selected"));
  }

  if (!event.target.closest(".editor-image")) {
    document
      .querySelectorAll(".editor-image--selected")
      .forEach((item) => item.classList.remove("editor-image--selected"));
  }

  if (!event.target.closest(".editor-media")) {
    document
      .querySelectorAll(".editor-media--selected")
      .forEach((item) => item.classList.remove("editor-media--selected"));
  }
});

loadConfig();
validateSession();
