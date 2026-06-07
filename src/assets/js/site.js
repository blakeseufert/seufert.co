function closeShareMenu(menu) {
  const button = menu.querySelector("[data-share-toggle]");
  const panel = menu.querySelector("[data-share-panel]");

  if (!button || !panel) return;
  button.setAttribute("aria-expanded", "false");
  panel.hidden = true;
}

function openShareMenu(menu) {
  const button = menu.querySelector("[data-share-toggle]");
  const panel = menu.querySelector("[data-share-panel]");

  if (!button || !panel) return;
  document.querySelectorAll("[data-share-menu]").forEach((otherMenu) => {
    if (otherMenu !== menu) closeShareMenu(otherMenu);
  });
  button.setAttribute("aria-expanded", "true");
  panel.hidden = false;
}

function setupShareMenus() {
  const menus = document.querySelectorAll("[data-share-menu]");
  if (!menus.length) return;

  const shareUrl = window.location.href;
  const shareTitle = document.querySelector(".article-hero h1")?.textContent.trim() || document.title;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(shareTitle);

  menus.forEach((menu) => {
    const links = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(`${shareTitle}\n\n${shareUrl}`)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      github: menu.dataset.githubUrl
    };

    Object.entries(links).forEach(([name, href]) => {
      const link = menu.querySelector(`[data-share-target="${name}"]`);
      if (link && href) link.href = href;
    });

    menu.querySelector("[data-share-toggle]")?.addEventListener("click", () => {
      const isOpen = menu.querySelector("[data-share-toggle]")?.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        closeShareMenu(menu);
      } else {
        openShareMenu(menu);
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-share-menu]")) return;
    menus.forEach(closeShareMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    menus.forEach(closeShareMenu);
  });
}

setupShareMenus();
