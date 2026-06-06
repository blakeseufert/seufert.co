const storageKey = "seufert-editor-config";
const tokenKey = "seufert-editor-token";
const pendingImages = [];

const els = {
  authButton: document.querySelector("#authButton"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  savePostButton: document.querySelector("#savePostButton"),
  imageInput: document.querySelector("#imageInput"),
  status: document.querySelector("#statusLine"),
  editor: document.querySelector("#editorCanvas"),
  title: document.querySelector("#titleInput"),
  slug: document.querySelector("#slugInput"),
  date: document.querySelector("#dateInput"),
  excerpt: document.querySelector("#excerptInput"),
  tags: document.querySelector("#tagsInput"),
  cover: document.querySelector("#coverInput"),
  owner: document.querySelector("#ownerInput"),
  repo: document.querySelector("#repoInput"),
  branch: document.querySelector("#branchInput"),
  client: document.querySelector("#clientInput")
};

const encoder = new TextEncoder();
let slugWasEdited = false;

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

function getConfig() {
  return {
    owner: els.owner.value.trim(),
    repo: els.repo.value.trim(),
    branch: els.branch.value.trim() || "main",
    clientId: els.client.value.trim()
  };
}

function saveConfig() {
  localStorage.setItem(storageKey, JSON.stringify(getConfig()));
  setStatus("Config saved.");
}

function loadConfig() {
  els.date.value = new Date().toISOString().slice(0, 10);

  try {
    const config = JSON.parse(localStorage.getItem(storageKey) || "{}");
    els.owner.value = config.owner || els.owner.value || "";
    els.repo.value = config.repo || els.repo.value || "";
    els.branch.value = config.branch || els.branch.value || "main";
    els.client.value = config.clientId || "";
  } catch {
    setStatus("Config could not be loaded.");
  }

  if (localStorage.getItem(tokenKey)) {
    els.authButton.textContent = "Connected";
  }
}

function githubHeaders() {
  const token = localStorage.getItem(tokenKey);
  if (!token) {
    throw new Error("Connect GitHub first.");
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

async function githubRequest(path, options = {}) {
  const config = getConfig();
  if (!config.owner || !config.repo) {
    throw new Error("Add repository owner and repo.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/${path}`,
    {
      ...options,
      headers: {
        ...githubHeaders(),
        ...(options.headers || {})
      }
    }
  );

  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `GitHub returned ${response.status}.`);
  }

  return response;
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
}

async function startDeviceAuth() {
  const { clientId } = getConfig();
  if (!clientId) {
    setStatus("Add an OAuth client ID first.");
    return;
  }

  saveConfig();
  setStatus("Requesting GitHub code...");

  const deviceResponse = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: "repo"
    })
  });

  if (!deviceResponse.ok) {
    throw new Error("GitHub did not return a device code.");
  }

  const device = await deviceResponse.json();
  window.open(device.verification_uri, "_blank", "noopener,noreferrer");
  setStatus(`Enter ${device.user_code} in the GitHub tab.`);

  const startedAt = Date.now();
  const intervalMs = (device.interval || 5) * 1000;

  while (Date.now() - startedAt < device.expires_in * 1000) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.access_token) {
      localStorage.setItem(tokenKey, tokenData.access_token);
      els.authButton.textContent = "Connected";
      setStatus("GitHub connected.");
      return;
    }

    if (tokenData.error && tokenData.error !== "authorization_pending") {
      throw new Error(tokenData.error_description || tokenData.error);
    }
  }

  throw new Error("GitHub code expired.");
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
      `<blockquote class="quote quote--pull"><p>${text}</p></blockquote><p><br></p>`
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
  await putFile(`src/posts/${slug}.md`, base64FromText(markdown), `Publish ${els.title.value}`);
  setStatus("Post saved. GitHub Pages will rebuild on push.");
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

els.editor.addEventListener("keyup", handleMarkdownShortcut);
els.imageInput.addEventListener("change", handleImageUpload);
els.saveConfigButton.addEventListener("click", saveConfig);
els.savePostButton.addEventListener("click", () => savePost().catch((error) => setStatus(error.message)));
els.authButton.addEventListener("click", () => startDeviceAuth().catch((error) => setStatus(error.message)));

loadConfig();
