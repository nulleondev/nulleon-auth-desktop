import { useEffect, useRef, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

// Decorative spatial field. No user data, network, or global animation timer.
export default function Atmosphere({
  paused = false,
  density = 80,
  className = "",
}) {
  const canvas = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = canvas.current;
    const context = element.getContext("2d");
    if (!context) return;
    let width = 1,
      height = 1,
      frame = 0,
      time = 0,
      previous = 0,
      visible = true;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const particles = Array.from({ length: density }, (_, i) => ({
      phase: i * 2.399963,
      radius: 0.16 + ((i * 37) % 100) / 180,
      speed: 0.08 + (i % 7) * 0.012,
      size: 0.5 + (i % 4) * 0.35,
      depth: 0.3 + (i % 11) / 14,
    }));
    const resize = () => {
      const rect = element.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      render(0);
    };
    const render = (delta) => {
      time += delta;
      pointer.x += (pointer.targetX - pointer.x) * 0.035;
      pointer.y += (pointer.targetY - pointer.y) * 0.035;
      context.clearRect(0, 0, width, height);
      for (const p of particles) {
        const angle = p.phase + time * p.speed;
        const orbit = p.radius * Math.min(width, height) * 1.4;
        const x = width * 0.5 + Math.cos(angle) * orbit + pointer.x * p.depth;
        const y =
          height * 0.52 + Math.sin(angle) * orbit * 0.48 + pointer.y * p.depth;
        const opacity = 0.16 + (Math.sin(angle + time * 0.2) + 1) * 0.19;
        context.beginPath();
        context.arc(x, y, p.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(215,194,255,${opacity})`;
        context.fill();
        if (p.size > 1.4) {
          context.beginPath();
          context.moveTo(x - 4, y);
          context.lineTo(x + 4, y);
          context.strokeStyle = `rgba(211,184,255,${opacity * 0.3})`;
          context.stroke();
        }
      }
    };
    const tick = (now) => {
      frame = 0;
      if (!visible || document.hidden || paused || reduced) {
        previous = 0;
        return;
      }
      const dt = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
      previous = now;
      render(dt);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !paused && !reduced)
        frame = requestAnimationFrame(tick);
    };
    const movement = (event) => {
      const rect = element.getBoundingClientRect();
      pointer.targetX = (event.clientX - rect.left - width / 2) * 0.045;
      pointer.targetY = (event.clientY - rect.top - height / 2) * 0.045;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      }
    });
    visibility.observe(element);
    const pageVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        previous = 0;
      } else start();
    };
    if (!paused && !reduced)
      element.parentElement?.addEventListener("pointermove", movement, {
        passive: true,
      });
    document.addEventListener("visibilitychange", pageVisibility);
    resize();
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      element.parentElement?.removeEventListener("pointermove", movement);
      document.removeEventListener("visibilitychange", pageVisibility);
    };
  }, [density, paused, reduced]);
  return (
    <canvas
      ref={canvas}
      className={`atmosphere-canvas ${className}`}
      aria-hidden="true"
    />
  );
}
