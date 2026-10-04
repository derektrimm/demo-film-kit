// WHAT IS IN FRONT OF THE LENS. Replace this file for each product: build() makes the objects once,
// update(t) poses them for studio time t (from t alone, never from the previous frame, so any frame
// renders the same on its own), and SHOT_POSE frames each shot in events.js.
//
// The example is a glossy device on a desk: a live screen, a row of keys that light in a wave from
// the one that is pressed, and a knurled dial. Each shows a technique that holds up in close-up.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRESS, LIGHTS_UP, WORK } from './events.js';
import { clamp, smooth, ramp, press } from '../src/util.js';

let T, screenCtx, screenTex, keys, dial;
const KEY_X = [-1.2, 0.2, 1.6, 3.0];
const PRESSED = 2;

// A keycap: a rounded box with its top tapered in and dished, then re-smoothed. Dropping uv and
// normal before merging lets the shared corners weld, so the shading has no seams.
function keycapGeometry(T, size) {
  const g = new RoundedBoxGeometry(size, 0.42, size, 5, 0.1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVertices(g);
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const up = (y + 0.21) / 0.42;                     // 0 at the base, 1 on top
    const taper = 1 - 0.14 * up;
    const dish = y > 0.18 ? -0.035 * (1 - (x * x + z * z) / (size * size * 0.25)) : 0;
    p.setXYZ(i, x * taper, y + dish, z * taper);
  }
  m.computeVertexNormals();
  return m;
}

// A knurled dial: a many-sided cylinder whose rim is pushed in and out by a triangle wave.
function dialGeometry(T) {
  const g = new T.CylinderGeometry(0.62, 0.62, 0.5, 240, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r < 0.6) continue;                           // only the rim
    const a = Math.atan2(z, x);
    const tri = Math.abs(((a / (Math.PI * 2)) * 60) % 1 - 0.5) * 2;   // 60 ridges
    const k = (0.6 + 0.03 * tri) / r;
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export async function build(ctx) {
  T = ctx.THREE;
  const { scene } = ctx;
  const desk = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshPhysicalMaterial({ color: '#130e0b', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  desk.rotation.x = -Math.PI / 2; desk.position.y = -0.06; desk.receiveShadow = true; scene.add(desk);
  const body = new T.Mesh(new RoundedBoxGeometry(9, 0.6, 5, 8, 0.25), new T.MeshPhysicalMaterial({ color: '#232427', metalness: 0.92, roughness: 0.4, clearcoat: 0.15 }));
  body.position.y = 0.24; body.castShadow = body.receiveShadow = true; scene.add(body);
  const glass = new T.Mesh(new RoundedBoxGeometry(8.6, 0.06, 4.6, 4, 0.03), new T.MeshPhysicalMaterial({ color: '#030304', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }));
  glass.position.y = 0.55; scene.add(glass);

  // A live screen: a 2D canvas drawn every frame, used as the emissive map of a glossy material, so
  // the screen shows its true colours and still carries the studio's reflections.
  const c = document.createElement('canvas'); c.width = 1200; c.height = 520; screenCtx = c.getContext('2d');
  screenTex = new T.CanvasTexture(c); screenTex.colorSpace = T.SRGBColorSpace; screenTex.anisotropy = 16;
  const screen = new T.Mesh(new T.PlaneGeometry(4.6, 2.0), new T.MeshPhysicalMaterial({ color: '#000', emissive: '#fff', emissiveMap: screenTex, roughness: 0.04, clearcoat: 1 }));
  screen.rotation.x = -Math.PI / 2; screen.position.set(-1.6, 0.585, -0.9); scene.add(screen);

  // Keys, each with its own glowing underside; light colour is a function of t alone.
  const cap = keycapGeometry(T, 1.05);
  keys = KEY_X.map((x) => {
    const mat = new T.MeshPhysicalMaterial({ color: '#141416', roughness: 0.55, clearcoat: 0.3, emissive: '#000' });
    const k = new T.Mesh(cap, mat); k.position.set(x, 0.79, 1.3); k.castShadow = true; scene.add(k);
    const glow = new T.Mesh(new T.PlaneGeometry(1.25, 1.25), new T.MeshBasicMaterial({ color: '#000', transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.59, 1.3); scene.add(glow);
    return { mesh: k, mat, glow };
  });

  dial = new T.Mesh(dialGeometry(T), new T.MeshPhysicalMaterial({ color: '#b9b4ab', metalness: 1, roughness: 0.32 }));
  dial.position.set(3.0, 0.82, -0.9); dial.castShadow = true; scene.add(dial);
}

function drawScreen(t) {
  const x = screenCtx, W = 1200, H = 520;
  x.fillStyle = '#0d0a08'; x.fillRect(0, 0, W, H);
  x.globalAlpha = smooth((t - 2) / 0.8);
  x.fillStyle = '#ecbe5b'; x.font = '600 26px "JetBrains Mono"'; x.fillText(t < PRESS ? 'READY' : 'RUNNING', 60, 86);
  x.fillStyle = '#f5ecd9'; x.font = '700 76px "Sora"';
  x.fillText(t < PRESS + WORK ? (t < PRESS ? 'Waiting on you' : 'Working') : 'Done.', 60, 190);
  const p = ramp(t, PRESS, PRESS + WORK);
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(60, 420, W - 120, 14);
  x.fillStyle = '#5fb87a'; x.fillRect(60, 420, (W - 120) * p, 14);
  x.globalAlpha = 1;
  screenTex.needsUpdate = true;
}

export function update(t, ctx) {
  const up = smooth((t - LIGHTS_UP) / 1.6);
  for (const name of ['key', 'top', 'fill']) ctx.lights[name].intensity *= up;
  ctx.scene.environmentIntensity *= 0.3 + 0.7 * up;
  drawScreen(t);
  // The press, and a wave of light that spreads from the pressed key and decays.
  keys.forEach((k, i) => {
    const pr = i === PRESSED ? press(t, PRESS) : 0;
    k.mesh.position.y = 0.79 - pr * 0.1;
    const arrive = PRESS + Math.abs(KEY_X[i] - KEY_X[PRESSED]) * 0.12;
    const wave = t >= arrive ? Math.exp(-(t - arrive) * 2.4) : 0;
    const idle = ramp(t, 1.5, 3) * 0.35;
    const color = t < PRESS ? '#ecbe5b' : '#5fb87a';
    k.glow.material.color.set(color).multiplyScalar(clamp(idle + wave * 2.2, 0, 2.6));
    k.mat.emissive.set(color).multiplyScalar(wave * 0.25);
  });
  dial.rotation.y = smooth(ramp(t, PRESS + 0.4, PRESS + WORK)) * Math.PI * 0.75;
}

const V = (x, y, z) => new T.Vector3(x, y, z);
// Camera poses per shot: from [position, target] to [position, target], field of view, aperture.
export const SHOT_POSE = new Proxy({}, {
  get: (_, name) => ({
    'studio-open': { from: [V(-10, 2.2, 8), V(0, 0.4, 0)], to: [V(-7, 2.7, 9.5), V(0, 0.4, 0)], fov: 30, ap: 0.01 },
    'studio-close': { from: [V(3.9, 2.6, 5.4), V(1.6, 0.75, 1.2)], to: [V(3.3, 2.2, 4.6), V(1.6, 0.75, 1.2)], fov: 26, ap: 0.03 },
    'studio-top': { from: [V(-1.6, 6.2, 1.9), V(-1.6, 0.5, -0.8)], to: [V(-1.6, 5.4, 1.4), V(-1.6, 0.5, -0.8)], fov: 32, ap: 0.006 },
    'studio-wide': { from: [V(0, 7, 13), V(0, 0.2, 0)], to: [V(0, 9, 16), V(0, 0.2, 0)], fov: 32, ap: 0.004 },
  })[name],
});
