# seufert.co

This is the source for [seufert.co](https://seufert.co), a static personal blog built with Eleventy and published with GitHub Pages.

Blog posts are kept as Markdown files in [`src/posts/`](src/posts/), so they can be read directly in the repository as well as through the website.

## About

The site uses one article layout for every post. The most recent dated Markdown post becomes the homepage, and each post also gets its own URL.

Supported post content includes:

- `h1`, `h2`, and `h3` headings
- Drop caps on the first paragraph
- Lists, links, images, and galleries
- YouTube/video embeds
- Pull quote and quiet quote styles

Images and other site assets live in [`src/assets/`](src/assets/).

## Editing

The browser editor lives at `/editor/`. It is fully static and uses a GitHub personal access token in the browser session to create, update, duplicate, and delete Markdown posts through the GitHub Contents API.

Tokens should not be committed to the repo. The editor sign-in page includes the setup notes for creating a fine-grained token with repository Contents read/write access.

## Local Development

```sh
npm install
npm run start
```

Build the static site:

```sh
npm run build
```

The generated site is written to `_site/`.

## Deploy

Pushes to `main` run [`.github/workflows/pages.yml`](.github/workflows/pages.yml), build the Eleventy site, and deploy `_site/` to GitHub Pages.

The workflow currently sets `BASE_PATH: /seufert.co/` so assets and links work on the project Pages URL:

`https://blakeseufert.github.io/seufert.co/`

When the custom domain `seufert.co` is active in GitHub Pages, change that workflow value to:

```yaml
BASE_PATH: /
```

or remove the `BASE_PATH` line entirely. The rest of the site is already set up for static hosting.

## Design

Shared visual styles live in [`src/assets/css/styles.css`](src/assets/css/styles.css). Reuse the `.pill` classes for small linked labels, controls, and compact buttons rather than recreating pill styles in new components.
