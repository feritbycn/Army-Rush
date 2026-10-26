// GEÇİCİ PROTOTİP MODELLER: kod ile üretilen stilize low-poly figürler.
// Nihai sürümde GLB/glTF modelleriyle değiştirilecek (README → "Varlıklar"). Fotogerçekçi değildir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); return g; };

export interface FigureOpts { body: number; accent?: number; scale?: number; horns?: boolean; bulky?: boolean }

export function figureGeometry(o: FigureOpts): THREE.BufferGeometry {
  const accent = o.accent ?? 0x2b2f36;
  const skin = 0xe0b48a;
  const w = o.bulky ? 1.35 : 1;
  const parts: THREE.BufferGeometry[] = [
    paint(at(new THREE.BoxGeometry(0.22 * w, 0.5, 0.26), -0.15 * w, 0.25, 0), accent),
    paint(at(new THREE.BoxGeometry(0.22 * w, 0.5, 0.26), 0.15 * w, 0.25, 0), accent),
    paint(at(new THREE.CapsuleGeometry(0.28 * w, 0.42, 4, 8), 0, 0.86, 0), o.body),
    paint(at(new THREE.SphereGeometry(0.2, 10, 8), 0, 1.38, 0), skin),
    paint(at(new THREE.SphereGeometry(0.235, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.4, 0), o.body),
    paint(at(new THREE.BoxGeometry(0.09, 0.09, 0.62), 0.3 * w, 0.9, 0.3), 0x1a1d22),
    paint(at(new THREE.BoxGeometry(0.34, 0.4, 0.14), 0, 0.9, -0.28), accent),
  ];
  if (o.horns) {
    parts.push(paint(at(new THREE.ConeGeometry(0.06, 0.3, 6), -0.17, 1.66, 0), 0xf1e9d2));
    parts.push(paint(at(new THREE.ConeGeometry(0.06, 0.3, 6), 0.17, 1.66, 0), 0xf1e9d2));
  }
  if (o.bulky) {
    parts.push(paint(at(new THREE.BoxGeometry(0.3, 0.2, 0.5), -0.45, 1.2, 0), accent));
    parts.push(paint(at(new THREE.BoxGeometry(0.3, 0.2, 0.5), 0.45, 1.2, 0), accent));
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const s = o.scale ?? 1;
  merged.scale(s, s, s);
  return merged;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function figureMaterial(): THREE.MeshStandardMaterial {
  const k = 'fig';
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }); matCache.set(k, m); }
  return m;
}

export interface BossMesh { group: THREE.Group; weak: THREE.Mesh; eye: THREE.Mesh; arm: THREE.Mesh }

/** Büyük boss modeli (geçici prototip): gövde, kafa, kollar, parlayan zayıf nokta. */
export function makeBoss(color: number): BossMesh {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 4), mat); torso.position.y = 6; g.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3.4), dark); hips.position.y = 1.8; g.add(hips);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3), mat); head.position.y = 10.6; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.6 }));
  eye.position.set(0, 10.8, -1.55); g.add(eye);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), mat); arm.position.set(-4.7, 6.2, 0); g.add(arm);
  const arm2 = arm.clone(); arm2.position.x = 4.7; g.add(arm2);
  const fistL = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 2.8), dark); fistL.position.set(-4.7, 2.4, -1); g.add(fistL);
  const fistR = fistL.clone(); fistR.position.x = 4.7; g.add(fistR);
  const weak = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc300, emissiveIntensity: 2 }));
  weak.position.set(0, 6, -2.2); g.add(weak);
  g.traverse((o) => { o.castShadow = false; });
  return { group: g, weak, eye, arm };
}
