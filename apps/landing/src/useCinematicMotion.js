import { useEffect } from "react";

export default function useCinematicMotion(root, paused) {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)").matches;
    let frame = 0,
      dirty = true,
      px = 0,
      py = 0,
      tx = 0,
      ty = 0;
    const scenes = [...host.querySelectorAll("[data-scene]")];
    const reveal = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            reveal.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    host.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));
    const draw = () => {
      frame = 0;
      if (paused || motionQuery.matches || document.hidden) return;
      px += (tx - px) * 0.065;
      py += (ty - py) * 0.065;
      host.style.setProperty("--pointer-x", px.toFixed(3));
      host.style.setProperty("--pointer-y", py.toFixed(3));
      if (dirty) {
        const view = window.innerHeight;
        for (const el of scenes) {
          const rect = el.getBoundingClientRect();
          const progress = Math.max(
            0,
            Math.min(1, -rect.top / Math.max(view * 0.8, rect.height - view)),
          );
          const approach = Math.max(
            -1,
            Math.min(1, (view / 2 - (rect.top + rect.height / 2)) / view),
          );
          el.style.setProperty("--progress", progress.toFixed(4));
          el.style.setProperty("--approach", approach.toFixed(4));
        }
        const total = document.documentElement.scrollHeight - view;
        host.style.setProperty(
          "--page-progress",
          Math.min(1, window.scrollY / Math.max(1, total)),
        );
        dirty = false;
      }
      if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001)
        frame = requestAnimationFrame(draw);
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const scroll = () => {
      dirty = true;
      request();
    };
    const pointer = (event) => {
      if (!fine) return;
      tx = (event.clientX / innerWidth - 0.5) * 2;
      ty = (event.clientY / innerHeight - 0.5) * 2;
      request();
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else scroll();
    };
    const media = () => {
      if (motionQuery.matches) {
        host.style.setProperty("--pointer-x", 0);
        host.style.setProperty("--pointer-y", 0);
      } else scroll();
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    motionQuery.addEventListener("change", media);
    if (paused || motionQuery.matches) {
      host.style.setProperty("--pointer-x", 0);
      host.style.setProperty("--pointer-y", 0);
      scenes.forEach((el) => {
        el.style.setProperty("--progress", 0);
        el.style.setProperty("--approach", 0);
      });
    } else request();
    return () => {
      cancelAnimationFrame(frame);
      reveal.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", visibility);
      motionQuery.removeEventListener("change", media);
    };
  }, [root, paused]);
}
