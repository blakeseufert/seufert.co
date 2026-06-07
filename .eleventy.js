const fs = require("fs");
const path = require("path");

function normalizeBasePath(value) {
  const raw = String(value || "/").trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}/`;
}

const basePath = normalizeBasePath(process.env.BASE_PATH);

function withBasePath(url) {
  if (!url || !url.startsWith("/") || url.startsWith("//") || basePath === "/") return url;
  if (url === basePath.slice(0, -1) || url.startsWith(basePath)) return url;
  return `${basePath.slice(0, -1)}${url}`;
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
  match[1].split("\n").forEach((line) => {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) data[pair[1]] = yamlValue(pair[2]);
  });

  return { data, body: match[2].trim() };
}

function localPostManifest() {
  const postsDir = path.join(__dirname, "src", "posts");
  if (!fs.existsSync(postsDir)) return [];

  return fs.readdirSync(postsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const repoPath = `src/posts/${name}`;
      const markdown = fs.readFileSync(path.join(postsDir, name), "utf8");
      const parsed = parseFrontmatter(markdown);
      return {
        name,
        path: repoPath,
        markdown,
        data: parsed.data,
        body: parsed.body
      };
    })
    .sort((a, b) => {
      const dateDiff = (Date.parse(b.data.date) || 0) - (Date.parse(a.data.date) || 0);
      return dateDiff || a.name.localeCompare(b.name);
    });
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addGlobalData("localPostManifest", localPostManifest);

  eleventyConfig.addCollection("posts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addFilter("readableDate", (date) => {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);
  });

  eleventyConfig.addFilter("isoDate", (date) => {
    return date.toISOString().slice(0, 10);
  });

  eleventyConfig.addFilter("firstPost", (posts) => posts && posts[0]);

  eleventyConfig.addFilter("withBasePath", withBasePath);

  eleventyConfig.addFilter("json", (value) => JSON.stringify(value, null, 2));

  eleventyConfig.addTransform("prefixRootRelativeUrls", function (content) {
    if (!this.page.outputPath || !this.page.outputPath.endsWith(".html")) return content;

    return content.replace(/\b(href|src|action)=(")(\/(?!\/)[^"]*)(")/g, (_match, attr, open, url, close) => {
      return `${attr}=${open}${withBasePath(url)}${close}`;
    });
  });

  eleventyConfig.addShortcode("youtube", (id, title = "Embedded video") => {
    const safeTitle = String(title).replace(/"/g, "&quot;");
    return `<figure class="media-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${safeTitle}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure>`;
  });

  eleventyConfig.addShortcode("video", (src, title = "Embedded video") => {
    const safeTitle = String(title).replace(/"/g, "&quot;");
    return `<figure class="media-embed"><video controls preload="metadata" src="${src}" title="${safeTitle}"></video></figure>`;
  });

  eleventyConfig.addShortcode("image", (src, alt = "", layout = "left") => {
    const safeSrc = withBasePath(src);
    const safeAlt = String(alt).replace(/"/g, "&quot;");
    const imageLayout = layout === "full" ? "full" : "left";
    return `<figure class="image-block image-block--${imageLayout}"><img src="${safeSrc}" alt="${safeAlt}" loading="lazy"></figure>`;
  });

  eleventyConfig.addShortcode("gallery", (...items) => {
    const figures = items
      .filter(Boolean)
      .map((item) => {
        const [src, alt = ""] = String(item).split("|");
        return `<figure><img src="${withBasePath(src)}" alt="${alt}" loading="lazy"></figure>`;
      })
      .join("");

    return `<div class="gallery">${figures}</div>`;
  });

  eleventyConfig.addPairedShortcode("pullquote", (content, cite = "") => {
    return `<blockquote class="quote quote--pull"><p>${content.trim()}</p>${cite ? `<cite>${cite}</cite>` : ""}</blockquote>`;
  });

  eleventyConfig.addPairedShortcode("quietquote", (content, cite = "") => {
    return `<blockquote class="quote quote--quiet"><p>${content.trim()}</p>${cite ? `<cite>${cite}</cite>` : ""}</blockquote>`;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"]
  };
};
