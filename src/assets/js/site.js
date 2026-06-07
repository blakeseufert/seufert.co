function setupShareLinks() {
  const shareClusters = document.querySelectorAll("[data-share-cluster]");
  if (!shareClusters.length) return;

  const shareUrl = window.location.href;
  const shareTitle = document.querySelector(".article-hero h1")?.textContent.trim() || document.title;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(shareTitle);

  const targets = {
    twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${shareTitle}\n\n${shareUrl}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
  };

  document.querySelectorAll("[data-share-target]").forEach((link) => {
    const href = targets[link.dataset.shareTarget];
    if (href) link.href = href;
  });

  shareClusters.forEach((cluster) => {
    const button = cluster.querySelector("[data-share-toggle]");
    const label = cluster.querySelector("[data-share-label]");

    button?.addEventListener("click", () => {
      const isOpen = cluster.classList.toggle("share-cluster--open");
      button.setAttribute("aria-expanded", String(isOpen));
      if (label) label.textContent = isOpen ? "Close" : "Share";
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-share-cluster]")) return;
    closeShareClusters();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeShareClusters();
  });
}

function closeShareClusters() {
  document.querySelectorAll("[data-share-cluster]").forEach((cluster) => {
    cluster.classList.remove("share-cluster--open");
    cluster.querySelector("[data-share-toggle]")?.setAttribute("aria-expanded", "false");
    const label = cluster.querySelector("[data-share-label]");
    if (label) label.textContent = "Share";
  });
}

setupShareLinks();
