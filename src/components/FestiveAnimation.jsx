import { useEffect, useRef, useState } from "react";
import "./FestiveAnimation.css";

/* ─────────────────────────────────────────────────────────────────────────
 * Particle counts per intensity level
 * ─────────────────────────────────────────────────────────────────────────*/
const PARTICLE_COUNTS = { subtle: 28, medium: 55, heavy: 95 };

/* ─────────────────────────────────────────────────────────────────────────
 * Colour palettes per preset animation type
 * ─────────────────────────────────────────────────────────────────────────*/
const PALETTES = {
  diwali:    ["#FFD700", "#FFA500", "#FF6B00", "#FFE066", "#FF4500", "#FFBB33"],
  holi:      ["#FF4EC7", "#FF6B00", "#00C2FF", "#7CFF50", "#FFD700", "#B44FFF", "#FF3A3A"],
  christmas: ["#FFFFFF", "#E0F7FA", "#B3E5FC", "#CCF0FF"],
  newyear:   ["#FFD700", "#C0C0C0", "#FF4EC7", "#00E5FF", "#FF6B00", "#7CFF50"],
  confetti:  ["#FF4EC7", "#FFD700", "#00C2FF", "#7CFF50", "#FF6B00", "#B44FFF", "#FF3A3A"]
};

const PRESET_TYPES = new Set(["diwali", "holi", "christmas", "newyear", "confetti"]);

/* ─────────────────────────────────────────────────────────────────────────
 * Lottie player loader (CDN web component — no npm install needed)
 * ─────────────────────────────────────────────────────────────────────────*/
let lottiePlayerPromise = null;
function ensureLottiePlayer() {
  if (lottiePlayerPromise) return lottiePlayerPromise;
  if (typeof customElements !== "undefined" && customElements.get("lottie-player")) {
    lottiePlayerPromise = Promise.resolve();
    return lottiePlayerPromise;
  }
  lottiePlayerPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@lottiefiles/lottie-player@2/dist/lottie-player.js";
    s.onload = resolve;
    s.onerror = resolve; // resolve even on error so we don't block forever
    document.head.appendChild(s);
  });
  return lottiePlayerPromise;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Particle factory per type
 * ─────────────────────────────────────────────────────────────────────────*/
function makeParticle(type, W, H, palette) {
  const colors = palette && palette.length > 0 ? palette : (PALETTES[type] || PALETTES.confetti);
  const color  = colors[Math.floor(Math.random() * colors.length)];

  switch (type) {
    case "diwali":
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(Math.random() * 0.8 + 0.3),
        radius: Math.random() * 3 + 1.5,
        alpha: Math.random() * 0.7 + 0.3,
        fadeDir: Math.random() > 0.5 ? 1 : -1,
        fadeSpeed: Math.random() * 0.012 + 0.004,
        color,
        glow: true
      };

    case "holi":
      return {
        x: Math.random() * W,
        y: H + Math.random() * 60,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(Math.random() * 1.4 + 0.5),
        radius: Math.random() * 8 + 4,
        alpha: Math.random() * 0.6 + 0.2,
        color,
        shape: "circle"
      };

    case "christmas":
      return {
        x: Math.random() * W,
        y: -Math.random() * H,
        vx: (Math.random() - 0.5) * 0.5,
        vy: Math.random() * 1.0 + 0.4,
        radius: Math.random() * 4 + 2,
        alpha: Math.random() * 0.8 + 0.2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.03 + 0.01,
        color
      };

    case "newyear": {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      return {
        x: W / 2 + (Math.random() - 0.5) * W * 0.6,
        y: H,
        vx: Math.cos(angle) * speed,
        vy: -(Math.random() * 5 + 3),
        gravity: 0.08,
        radius: Math.random() * 4 + 2,
        alpha: 1,
        color,
        trail: []
      };
    }

    case "confetti":
    default:
      return {
        x: Math.random() * W,
        y: -Math.random() * H * 0.3,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 2 + 0.8,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.12,
        width: Math.random() * 10 + 5,
        height: Math.random() * 5 + 3,
        alpha: Math.random() * 0.8 + 0.2,
        color
      };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Tick (update + draw) per particle type
 * ─────────────────────────────────────────────────────────────────────────*/
function tickParticle(p, type, W, H, ctx, palette) {
  switch (type) {

    case "diwali": {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha += p.fadeDir * p.fadeSpeed;
      if (p.alpha <= 0.05 || p.alpha >= 1) p.fadeDir *= -1;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
      break;
    }

    case "holi": {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.004;
      p.radius *= 1.008;
      if (p.alpha <= 0 || p.y < -60) Object.assign(p, makeParticle("holi", W, H, palette));

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
      break;
    }

    case "christmas": {
      p.wobble += p.wobbleSpeed;
      p.x += Math.sin(p.wobble) * 0.5 + p.vx;
      p.y += p.vy;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - p.radius * 1.6, p.y);
      ctx.lineTo(p.x + p.radius * 1.6, p.y);
      ctx.moveTo(p.x, p.y - p.radius * 1.6);
      ctx.lineTo(p.x, p.y + p.radius * 1.6);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case "newyear": {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();
      p.vy += p.gravity;
      p.x  += p.vx;
      p.y  += p.vy;
      p.alpha -= 0.012;

      if (p.alpha <= 0 || p.y > H + 20) Object.assign(p, makeParticle("newyear", W, H, palette));

      ctx.save();
      for (let i = 0; i < p.trail.length; i++) {
        ctx.globalAlpha = (i / p.trail.length) * p.alpha * 0.4;
        ctx.beginPath();
        ctx.arc(p.trail[i].x, p.trail[i].y, p.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
      break;
    }

    case "confetti":
    default: {
      p.x        += p.vx;
      p.y        += p.vy;
      p.rotation += p.rotationSpeed;
      p.vx       *= 0.999;
      if (p.y > H + 10) Object.assign(p, makeParticle("confetti", W, H, palette));

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.restore();
      break;
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Lottie overlay sub-component
 * ─────────────────────────────────────────────────────────────────────────*/
function LottieOverlay({ sourceUrl }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);

    ensureLottiePlayer().then(() => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      const player = document.createElement("lottie-player");
      player.setAttribute("src", sourceUrl);
      player.setAttribute("autoplay", "");
      player.setAttribute("loop", "");
      player.setAttribute("mode", "normal");
      player.style.width  = "100%";
      player.style.height = "100%";
      player.addEventListener("error", () => setError(true));
      containerRef.current.appendChild(player);
    });

    return () => { cancelled = true; };
  }, [sourceUrl]);

  if (error) return null;

  return <div ref={containerRef} className="festive-lottie-overlay" aria-hidden="true" />;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Main component
 * ─────────────────────────────────────────────────────────────────────────*/
export default function FestiveAnimation({
  enabled,
  type        = "diwali",
  intensity   = "subtle",
  customColors      = [],
  customAnimations  = []
}) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  // Resolve custom animation entry if type is not a preset
  const customEntry = PRESET_TYPES.has(type)
    ? null
    : customAnimations.find(a => a.id === type) || null;

  const isLottie = Boolean(customEntry && customEntry.sourceType === "lottie");

  // Active palette for canvas animations
  const palette = !isLottie && customColors.length > 0 ? customColors : null;

  /* ── Canvas animation (presets) ── */
  useEffect(() => {
    if (isLottie) return; // handled by LottieOverlay
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    const count     = PARTICLE_COUNTS[intensity] ?? 28;
    const particles = Array.from({ length: count }, () => makeParticle(type, W, H, palette));

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) tickParticle(p, type, W, H, ctx, palette);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, W, H);
    };
  }, [enabled, type, intensity, palette, isLottie]);

  if (!enabled) return null;

  /* ── Lottie (custom external) ── */
  if (isLottie) {
    return <LottieOverlay sourceUrl={customEntry.sourceUrl} />;
  }

  /* ── Canvas (preset) ── */
  return (
    <canvas
      ref={canvasRef}
      className="festive-canvas"
      aria-hidden="true"
    />
  );
}
