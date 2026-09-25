const FLY_DURATION_MS = 1_080;

/** Adds a decorative product flight while leaving cart state to the caller. */
export function animateFlyToCart(sourceImage: HTMLImageElement, targetButton: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!sourceImage.isConnected || !targetButton.isConnected || typeof Element.prototype.animate !== "function") return;

  const itemSize = 56;

  const outer = document.createElement("div");
  outer.className = "flying-item-outer";
  outer.setAttribute("aria-hidden", "true");

  const inner = document.createElement("div");
  inner.className = "flying-item-inner";
  const image = document.createElement("img");
  image.src = sourceImage.currentSrc || sourceImage.src;
  image.alt = "";
  inner.appendChild(image);
  outer.appendChild(inner);

  const startFlight = () => {
    if (!targetButton.isConnected) return;
    const source = sourceImage.getBoundingClientRect();
    const target = targetButton.getBoundingClientRect();
    if (source.width === 0 || source.height === 0 || target.width === 0 || target.height === 0) return;

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const startX = clamp(source.left + source.width / 2, itemSize / 2, window.innerWidth - itemSize / 2);
    const startY = clamp(source.top + source.height / 2, itemSize / 2, window.innerHeight - itemSize / 2);
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    document.body.appendChild(outer);

    const xAnimation = outer.animate(
      [
        { transform: `translate3d(${startX - itemSize / 2}px, ${startY - itemSize / 2}px, 0)` },
        { transform: `translate3d(${endX - itemSize / 2}px, ${startY - itemSize / 2}px, 0)` },
      ],
      { duration: FLY_DURATION_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" },
    );

    const verticalDistance = Math.abs(endY - startY);
    const arcHeight = Math.min(148, Math.max(56, verticalDistance * 0.17));
    const apexY = Math.max(itemSize / 2, (startY + endY) / 2 - arcHeight);
    const yAnimation = inner.animate(
      [
        { transform: "translateY(0) scale(1.04)", opacity: 1 },
        { transform: `translateY(${apexY - startY}px) scale(0.88)`, opacity: 0.96, offset: 0.46 },
        { transform: `translateY(${endY - startY}px) scale(0.28)`, opacity: 0.35 },
      ],
      { duration: FLY_DURATION_MS, easing: "cubic-bezier(0.33, 0, 0.67, 1)", fill: "forwards" },
    );

    const cleanup = () => {
      outer.remove();
      xAnimation.cancel();
    };

    yAnimation.onfinish = () => {
      cleanup();
      const cartIcon = targetButton.querySelector<HTMLElement>(".cart-button-icon, .bottom-nav-cart-icon");
      if (!cartIcon?.isConnected) return;
      cartIcon.classList.remove("cart-impact");
      void cartIcon.offsetWidth;
      cartIcon.classList.add("cart-impact");
      cartIcon.addEventListener("animationend", () => cartIcon.classList.remove("cart-impact"), { once: true });
    };
    yAnimation.oncancel = cleanup;
  };

  if (typeof image.decode === "function") {
    void image.decode().then(startFlight).catch(() => outer.remove());
  } else {
    startFlight();
  }
}
