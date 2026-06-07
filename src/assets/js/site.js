function setupShareLinks() {
  const shareLinks = document.querySelectorAll("[data-share-target]");
  if (!shareLinks.length) return;

  const shareUrl = window.location.href;
  const shareTitle = document.querySelector(".article-hero h1")?.textContent.trim() || document.title;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(shareTitle);

  const targets = {
    twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${shareTitle}\n\n${shareUrl}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
  };

  shareLinks.forEach((link) => {
    const href = targets[link.dataset.shareTarget];
    if (href) link.href = href;
  });
}

setupShareLinks();
