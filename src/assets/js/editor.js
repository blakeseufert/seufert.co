const tokenKey = "seufert-editor-token";
const editorConfig = {
  owner: document.querySelector('meta[name="github-owner"]')?.content.trim() || "blakeseufert",
  repo: document.querySelector('meta[name="github-repo"]')?.content.trim() || "seufert.co",
  branch: document.querySelector('meta[name="github-branch"]')?.content.trim() || "main",
  postsDir: normalizeDir(document.querySelector('meta[name="github-posts-dir"]')?.content || "src/posts")
};
const siteBasePath = document.querySelector('meta[name="site-base-path"]')?.content.trim() || "/";
const pendingImages = [];

const els = {
  authGate: document.querySelector("#authGate"),
  editorApp: document.querySelector("#editorApp"),
  authButton: document.querySelector("#authButton"),
  token: document.querySelector("#tokenInput"),
  signOutButton: document.querySelector("#signOutButton"),
  savePostButton: document.querySelector("#savePostButton"),
  refreshPostsButton: document.querySelector("#refreshPostsButton"),
  newPostButton: document.querySelector("#newPostButton"),
  deletePostButton: document.querySelector("#deletePostButton"),
  imageInput: document.querySelector("#imageInput"),
  status: document.querySelector("#statusLine"),
  editorUser: document.querySelector("#editorUser"),
  editor: document.querySelector("#editorCanvas"),
  postSelect: document.querySelector("#postSelect"),
  title: document.querySelector("#titleInput"),
  slug: document.querySelector("#slugInput"),
  date: document.querySelector("#dateInput"),
  excerpt: document.querySelector("#excerptInput"),
  tags: document.querySelector("#tagsInput"),
  cover: document.querySelector("#coverInput"),
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let slugWasEdited = false;
let posts = [];
let currentPost = null;
let signedInUser = null;

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
  els.date.value = new Date().toISOString().slice(0, 10);

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
  } catch (error) {
    localStorage.removeItem(tokenKey);
    signedInUser = null;
    showAuthGate();
    setStatus(error.message || "Please sign in again.");
  }
}

function showAuthGate() {
  els.authGate.hidden = false;
  els.editorApp.hidden = true;
  els.editorUser.hidden = true;
  els.authButton.textContent = "Connect token";
  setStatus("Paste a repo-scoped GitHub token once. It stays in this browser until you sign out.");
}

function showEditor() {
  els.authGate.hidden = true;
  els.editorApp.hidden = false;
  els.editorUser.hidden = false;
  els.editorUser.textContent = signedInUser ? `Signed in as ${signedInUser.login}` : "";
  setStatus("");
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
    document.execCommand("formatBlock", false, "blockquote");
  }
  if (command === "pullquote") {
    const text = selectedText() || "Quote text";
    document.execCommand(
      "insertHTML",
      false,
      `<blockquote class="quote quote--pull"><p>${escapeHtml(text)}</p></blockquote><p><br></p>`
    );
  }
  if (command === "embed") {
    const input = prompt("YouTube URL, iframe, or embed HTML");
    if (input) insertEmbed(input);
  }
}

function insertEmbed(input) {
  const youtubeId = parseYoutubeId(input);
  const markdown = youtubeId ? `{% youtube "${youtubeId}", "Embedded video" %}` : input;
  const html = youtubeId
    ? `<figure class="media-embed" data-md="${escapeHtml(markdown)}"><iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}" title="Embedded video"></iframe><figcaption>Embedded video</figcaption></figure>`
    : `<div data-md="${escapeHtml(markdown)}">${input}</div>`;

  document.execCommand("insertHTML", false, `${html}<p><br></p>`);
}

function parseYoutubeId(value) {
  const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : "";
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

async function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const extensionPath = `/assets/uploads/${slugify(els.slug.value)}-${safeFileName(file.name)}`;
  const [, base64Content] = String(dataUrl).split(",");

  pendingImages.push({
    repoPath: `src${extensionPath}`,
    publicPath: extensionPath,
    base64Content
  });

  if (!els.cover.value) {
    els.cover.value = extensionPath;
  }

  document.execCommand(
    "insertHTML",
    false,
    `<img src="${dataUrl}" alt="" data-md-src="${extensionPath}"><p><br></p>`
  );

  setStatus(`Queued ${file.name}.`);
  event.target.value = "";
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

function blockMarkdown(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const text = inlineMarkdown(node).trim();
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

function frontmatter() {
  const tags = els.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const lines = [
    "---",
    "layout: layouts/post.njk",
    `title: ${yamlString(els.title.value)}`,
    `date: ${els.date.value}`,
    `excerpt: ${yamlString(els.excerpt.value)}`,
    `cover: ${yamlString(els.cover.value)}`,
    "tags:",
    "  - posts",
    ...tags.map((tag) => `  - ${yamlString(tag)}`),
    "---"
  ];

  return lines.join("\n");
}

function markdownToEditorHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/).filter((block) => block.trim());

  return blocks.map((block) => {
    const value = block.trim();
    const image = value.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const youtube = value.match(/^\{%\s*youtube\s+"([^"]+)"(?:,\s*"([^"]+)")?\s*%\}$/);
    const pullquote = value.match(/^\{%\s*pullquote[^%]*%\}\n?([\s\S]*?)\n?\{%\s*endpullquote\s*%\}$/);
    const quietquote = value.match(/^\{%\s*quietquote[^%]*%\}\n?([\s\S]*?)\n?\{%\s*endquietquote\s*%\}$/);

    if (youtube) {
      const title = youtube[2] || "Embedded video";
      const shortcode = `{% youtube "${youtube[1]}", "${title}" %}`;
      return `<figure class="media-embed" data-md="${escapeHtml(shortcode)}"><iframe src="https://www.youtube-nocookie.com/embed/${youtube[1]}" title="${escapeHtml(title)}"></iframe><figcaption>${escapeHtml(title)}</figcaption></figure>`;
    }

    if (pullquote) {
      return `<blockquote class="quote quote--pull"><p>${inlineHtml(pullquote[1].trim())}</p></blockquote>`;
    }

    if (quietquote) {
      return `<blockquote class="quote quote--quiet"><p>${inlineHtml(quietquote[1].trim())}</p></blockquote>`;
    }

    if (image) {
      return `<img src="${escapeHtml(publicUrl(image[2]))}" alt="${escapeHtml(image[1])}" data-md-src="${escapeHtml(image[2])}">`;
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

    if (value.startsWith("{% gallery") || value.startsWith("<")) {
      return `<div data-md="${escapeHtml(value)}">${escapeHtml(value)}</div>`;
    }

    return `<p>${inlineHtml(value)}</p>`;
  }).join("");
}

function resetEditor() {
  currentPost = null;
  pendingImages.splice(0);
  slugWasEdited = false;
  els.title.value = "Untitled note";
  els.slug.value = "untitled-note";
  els.date.value = new Date().toISOString().slice(0, 10);
  els.excerpt.value = "";
  els.tags.value = "Systems, Notes";
  els.cover.value = "";
  els.editor.innerHTML = "<p>Start with a short opening paragraph. The public post layout will automatically apply the drop cap.</p>";
  els.postSelect.value = "";
  setStatus("New post ready.");
}

function postPathFromSlug(slug) {
  return `${getConfig().postsDir}/${slug}.md`;
}

function renderPostList() {
  els.postSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = posts.length ? "Select a post..." : "No posts found";
  els.postSelect.append(placeholder);

  posts.forEach((post) => {
    const option = document.createElement("option");
    option.value = post.path;
    option.textContent = `${post.data.date || "No date"} - ${post.data.title || post.name}`;
    els.postSelect.append(option);
  });

  if (currentPost) els.postSelect.value = currentPost.path;
}

async function loadPostList() {
  saveConfig();
  setStatus("Loading posts...");
  const config = getConfig();
  const response = await githubRequest(`contents/${apiPath(config.postsDir)}?ref=${encodeURIComponent(config.branch)}`);

  if (response.status === 404) {
    posts = [];
    renderPostList();
    setStatus(`No directory found at ${config.postsDir}. Saving will create files there.`);
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
      body: parsed.body
    };
  }));

  posts = loaded.sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));
  renderPostList();
  setStatus(`Loaded ${posts.length} post${posts.length === 1 ? "" : "s"}.`);
}

async function loadSelectedPost() {
  const path = els.postSelect.value;
  if (!path) return;

  let post = posts.find((item) => item.path === path);
  if (!post) return;

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
  slugWasEdited = true;
  els.title.value = post.data.title || "";
  els.slug.value = slugify(post.name.replace(/\.md$/, ""));
  els.date.value = post.data.date || new Date().toISOString().slice(0, 10);
  els.excerpt.value = post.data.excerpt || "";
  els.tags.value = (post.data.tags || []).join(", ");
  els.cover.value = post.data.cover || "";
  els.editor.innerHTML = markdownToEditorHtml(post.body);
  els.postSelect.value = post.path;
  setStatus(`Editing ${post.name}.`);
}

async function savePost() {
  saveConfig();
  const slug = slugify(els.slug.value);
  els.slug.value = slug;

  setStatus("Uploading images...");
  for (const image of pendingImages.splice(0)) {
    await putFile(image.repoPath, image.base64Content, `Upload ${image.publicPath}`);
  }

  setStatus("Saving post...");
  const markdown = `${frontmatter()}\n\n${editorMarkdown()}\n`;
  const newPath = postPathFromSlug(slug);
  await putFile(newPath, base64FromText(markdown), `${currentPost ? "Update" : "Publish"} ${els.title.value}`);

  if (currentPost && currentPost.path !== newPath) {
    await deleteFile(currentPost.path, currentPost.sha, `Remove renamed post ${currentPost.name}`);
  }

  await loadPostList();
  currentPost = posts.find((post) => post.path === newPath) || null;
  renderPostList();
  setStatus("Post saved. GitHub Pages will rebuild on push.");
}

async function deleteCurrentPost() {
  if (!currentPost) {
    setStatus("Select a post to delete.");
    return;
  }

  const confirmed = confirm(`Delete "${currentPost.data.title || currentPost.name}" from ${currentPost.path}?`);
  if (!confirmed) return;

  setStatus("Deleting post...");
  await deleteFile(currentPost.path, currentPost.sha, `Delete ${currentPost.data.title || currentPost.name}`);
  resetEditor();
  await loadPostList();
  setStatus("Post deleted. GitHub Pages will rebuild on push.");
}

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => runCommand(button.dataset.command));
});

els.title.addEventListener("input", () => {
  if (!slugWasEdited) {
    els.slug.value = slugify(els.title.value);
  }
});

els.slug.addEventListener("input", () => {
  slugWasEdited = true;
});

els.postSelect.addEventListener("change", () => loadSelectedPost().catch((error) => setStatus(error.message)));
els.editor.addEventListener("keyup", handleMarkdownShortcut);
els.imageInput.addEventListener("change", (event) => handleImageUpload(event).catch((error) => setStatus(error.message)));
els.savePostButton.addEventListener("click", () => savePost().catch((error) => setStatus(error.message)));
els.refreshPostsButton.addEventListener("click", () => loadPostList().catch((error) => setStatus(error.message)));
els.newPostButton.addEventListener("click", resetEditor);
els.deletePostButton.addEventListener("click", () => deleteCurrentPost().catch((error) => setStatus(error.message)));
els.signOutButton.addEventListener("click", signOut);
els.authButton.addEventListener("click", () => connectToken().catch((error) => setStatus(error.message)));

loadConfig();
validateSession();
