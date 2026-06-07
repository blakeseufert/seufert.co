# seufert.co

Static personal blog built with Eleventy and designed for GitHub Pages.

## Run locally

```sh
npm install
npm run start
```

Build the production site with:

```sh
npm run build
```

The generated site is written to `_site/`.

## Content

Posts live in `src/posts/` as markdown files. The latest dated post is rendered as the homepage, and each post uses the same article layout.

Post front matter:

```yaml
---
layout: layouts/post.njk
title: "Post title"
date: 2026-06-06
excerpt: "Short summary."
cover: "/assets/uploads/image.png"
coverAlt: "Image description"
tags:
  - posts
  - Systems
---
```

Supported markdown patterns:

- `#`, `##`, and `###` headings
- Automatic drop cap on the first paragraph
- Ordered and unordered lists
- Links and images
- Standard markdown blockquotes
- Gallery shortcode:

```njk
{% gallery "/assets/uploads/a.png|Alt text|Caption", "/assets/uploads/b.png|Alt text|Caption" %}
```

- Video shortcode:

```njk
{% youtube "VIDEO_ID", "Caption" %}
```

- Quote styles:

```njk
{% pullquote "Optional cite" %}
Large pull quote.
{% endpullquote %}

{% quietquote "Optional cite" %}
Quieter boxed quote.
{% endquietquote %}
```

## Editor

The editor is available at `/editor/`. It is fully client-side and reads/writes markdown through the GitHub Contents API.

When a valid GitHub token is not active in the browser session, the editor shows only a GitHub sign-in gate. After sign-in it lists every markdown file in the configured posts directory, loads existing posts for editing, overwrites the same file on save, supports renaming by changing the slug, and can delete posts.

Create a GitHub OAuth app and enable device flow. The editor carries the static repository settings in page metadata and can carry the public OAuth client ID there too. The sign-in button opens GitHub with the device code pre-filled where GitHub supports it. Uploaded images are saved to `src/assets/uploads/`; posts are saved to `src/posts/` by default.

## Design Standards

Core styles live in `src/assets/css/styles.css`. Reuse the shared `.pill` classes for tags, compact links, editor controls, and small action buttons:

- `.pill`
- `.pill--soft`
- `.pill--small`
- `.pill--button`

Avoid recreating pill-like styles in new components.

## Deploy

`.github/workflows/pages.yml` builds the site and deploys `_site/` to GitHub Pages on pushes to `main`.
