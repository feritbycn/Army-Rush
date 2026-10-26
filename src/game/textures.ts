import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

export function labelTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const key = `${text}|${bg}|${fg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 12; g.strokeRect(6, 6, 500, 244);
  let size = 130;
  g.font = `800 ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > 450 && size > 26) { size -= 4; g.font = `800 ${size}px system-ui, sans-serif`; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Zemin dokusu: şerit çizgileri dikey tekrar eder. Genişlik 7.2 birim kabul edilir. */
export function groundTexture(base: number, accent: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = hex(base); g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  for (const lx of [-1.07, 1.07]) g.fillRect(((3.6 + lx) / 7.2) * 256 - 2, 0, 4, 256);
  g.fillStyle = hex(accent);
  g.fillRect(0, 0, 8, 256); g.fillRect(248, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
