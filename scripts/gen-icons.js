const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

async function generate() {
  // Try to load canvas, skip if not available
  let canvas;
  try {
    canvas = require('canvas');
  } catch {
    console.log('canvas not installed, skipping PNG icon generation');
    console.log('Install with: npm install canvas');
    return;
  }

  const sizes = [192, 512];
  const outDir = path.join(__dirname, '..', 'public', 'assets', 'icons');

  for (const size of sizes) {
    const c = canvas.createCanvas(size, size);
    const ctx = c.getContext('2d');

    // Background
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(1, '#0a0a0f');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.15);
    ctx.fill();

    // Radio waves
    const cx = size / 2;
    const cy = size * 0.38;
    ctx.strokeStyle = '#e43f5a';
    ctx.lineWidth = size * 0.015;
    ctx.lineCap = 'round';

    const waves = [
      { r: size * 0.15, opacity: 0.3 },
      { r: size * 0.22, opacity: 0.5 },
      { r: size * 0.30, opacity: 0.8 },
    ];

    for (const w of waves) {
      ctx.globalAlpha = w.opacity;
      ctx.beginPath();
      ctx.arc(cx, cy, w.r, Math.PI + 0.4, -0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Center dot
    ctx.fillStyle = '#e43f5a';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.03, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#e0e0e0';
    ctx.font = `700 ${size * 0.09}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('AI 电台', cx, size * 0.65);

    ctx.fillStyle = '#9090a0';
    ctx.font = `${size * 0.047}px system-ui, sans-serif`;
    ctx.fillText('AI RADIO', cx, size * 0.75);

    ctx.fillStyle = '#e43f5a';
    ctx.font = `400 ${size * 0.062}px monospace`;
    ctx.letterSpacing = '4px';
    ctx.fillText('102.4', cx, size * 0.87);

    const buf = c.toBuffer('image/png');
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
    console.log(`Generated icon-${size}.png`);
  }
}

generate().catch(console.error);
