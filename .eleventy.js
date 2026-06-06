module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

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

  eleventyConfig.addShortcode("youtube", (id, title = "Embedded video") => {
    const safeTitle = String(title).replace(/"/g, "&quot;");
    return `<figure class="media-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${safeTitle}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><figcaption>${safeTitle}</figcaption></figure>`;
  });

  eleventyConfig.addShortcode("video", (src, title = "Embedded video") => {
    const safeTitle = String(title).replace(/"/g, "&quot;");
    return `<figure class="media-embed"><video controls preload="metadata" src="${src}"></video><figcaption>${safeTitle}</figcaption></figure>`;
  });

  eleventyConfig.addShortcode("gallery", (...items) => {
    const figures = items
      .filter(Boolean)
      .map((item) => {
        const [src, alt = "", caption = ""] = String(item).split("|");
        return `<figure><img src="${src}" alt="${alt}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
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
