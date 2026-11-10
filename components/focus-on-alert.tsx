"use client";

import { useEffect } from "react";

/**
 * When a form error banner (.alert-error) appears after a submission, move keyboard focus
 * to it so screen-reader and keyboard users hear what went wrong, and bring it into view
 * without hiding it under the sticky header. Runs once for the whole app.
 */
export function FocusOnAlert() {
  useEffect(() => {
    // Remember each banner's text: focus moves when a banner appears or its message changes.
    const seen = new WeakMap<Element, string>();
    document.querySelectorAll(".alert-error").forEach((el) => seen.set(el, el.textContent ?? ""));
    const observer = new MutationObserver(() => {
      const banners = [...document.querySelectorAll<HTMLElement>(".alert-error")];
      const fresh = banners.find((el) => seen.get(el) !== (el.textContent ?? "") && el.offsetParent !== null);
      banners.forEach((el) => seen.set(el, el.textContent ?? ""));
      if (!fresh) return;
      const active = document.activeElement as HTMLElement | null;
      // Don't steal focus from someone typing in the same live form (e.g. a chat box).
      if (active && fresh.closest("form") && active.closest("form") === fresh.closest("form") && active.tagName === "TEXTAREA") return;
      if (!fresh.hasAttribute("tabindex")) fresh.setAttribute("tabindex", "-1");
      fresh.focus({ preventScroll: true });
      fresh.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
