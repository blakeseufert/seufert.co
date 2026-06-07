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

function setupPostImageLightbox() {
  const images = document.querySelectorAll(".post-body img");
  if (!images.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = '<img class="image-lightbox__image" alt="">';
  document.body.append(lightbox);

  const lightboxImage = lightbox.querySelector("img");
  let activeImage = null;
  let isAnimating = false;

  function imageFrame(image) {
    const rect = image.getBoundingClientRect();
    return {
      borderRadius: getComputedStyle(image).borderRadius,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width
    };
  }

  function visibleFrame() {
    const rect = lightboxImage.getBoundingClientRect();
    return {
      borderRadius: getComputedStyle(lightboxImage).borderRadius,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width
    };
  }

  function frameStyles(frame) {
    return {
      borderRadius: frame.borderRadius,
      height: `${frame.height}px`,
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`
    };
  }

  function lockToFrame(frame) {
    Object.assign(lightboxImage.style, {
      maxHeight: "none",
      maxWidth: "none",
      objectFit: "cover",
      position: "fixed",
      ...frameStyles(frame)
    });
  }

  function unlockFrame() {
    lightboxImage.removeAttribute("style");
  }

  function closeLightbox() {
    if (lightbox.hidden || isAnimating) return;

    const destination = activeImage ? imageFrame(activeImage) : null;
    const start = visibleFrame();
    isAnimating = true;

    if (destination) {
      lockToFrame(start);
      lightbox.classList.add("image-lightbox--closing");
      lightboxImage.animate([frameStyles(start), frameStyles(destination)], {
        duration: 230,
        easing: "cubic-bezier(.2, .8, .2, 1)"
      }).finished.finally(finishClose);
    } else {
      finishClose();
    }
  }

  function finishClose() {
    lightbox.hidden = true;
    lightbox.classList.remove("image-lightbox--closing");
    lightboxImage.removeAttribute("src");
    lightboxImage.alt = "";
    unlockFrame();
    activeImage = null;
    isAnimating = false;
    document.body.classList.remove("image-lightbox-open");
    window.removeEventListener("scroll", closeLightbox);
  }

  function openLightbox(image) {
    if (isAnimating) return;
    activeImage = image;
    const start = imageFrame(image);

    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "";
    lightbox.hidden = false;
    document.body.classList.add("image-lightbox-open");

    requestAnimationFrame(() => {
      const destination = visibleFrame();
      isAnimating = true;
      lockToFrame(start);
      lightboxImage.animate([frameStyles(start), frameStyles(destination)], {
        duration: 250,
        easing: "cubic-bezier(.2, .8, .2, 1)"
      }).finished.finally(() => {
        unlockFrame();
        isAnimating = false;
      });
    });

    window.addEventListener("scroll", closeLightbox, { passive: true });
  }

  images.forEach((image) => {
    image.classList.add("post-image-zoom");
    image.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      openLightbox(image);
    });
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });
}

setupShareLinks();
setupPostImageLightbox();
