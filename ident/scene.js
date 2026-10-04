// The logo ident's scene: any SVG logo (config.js), extruded and lit in a dark room over a dimmed
// mirror floor. Two shots: "intro" (a gold line draws across the dark, folds into the mark, the mark
// settles and a glint crosses it) and "outro" (the mark at rest above the closing card's words).
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { IDENT } from './config.js';
import { LINE, REVEAL, GLINT } from './beats.js';
import { clamp, smooth, easeOut, easeInOut, ramp } from '../src/util.js';

let T, mark, layers, lineMat, glint, motes, moteMat, flare;

// Each filled shape becomes a layer, extruded in front of the one before it. The logo is fitted
// into 48 units (its largest side) and centred, then shrunk to the scene's scale; y flips from SVG
// (down) to the scene (up). Curves are sampled finely so bevels stay round.
function logoLayers(svgText) {
  const data = new SVGLoader().parse(svgText);
  const filled = data.paths.filter((p) => p.userData?.style?.fill && p.userData.style.fill !== 'none');
  const shapes = filled.map((p) => SVGLoader.createShapes(p));
  const box = new T.Box2();
  for (const list of shapes) for (const s of list) for (const v of s.getPoints(64)) box.expandByPoint(v);
  const size = box.getSize(new T.Vector2()), centre = box.getCenter(new T.Vector2());
  const k = 48 / Math.max(size.x, size.y);
  const flip = (pts) => pts.map((v) => new T.Vector2((v.x - centre.x) * k, -(v.y - centre.y) * k));
  return filled.map((p, i) => ({
    color: p.userData.style.fill,
    shapes: shapes[i].map((s) => {
      const out = new T.Shape(flip(s.getPoints(64)));
      out.holes = s.holes.map((h) => new T.Path(flip(h.getPoints(64))));
      return out;
    }),
  }));
}

export async function build(ctx) {
  T = ctx.THREE;
  const { scene } = ctx;
  scene.fog.density = 0.006;

  // A mirror floor dimmed by a dark glossy sheet: the reflection is a hint, not a mirror.
  const mirror = new Reflector(new T.PlaneGeometry(200, 200), { textureWidth: 1920, textureHeight: 1080, color: '#777' });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -2.9; scene.add(mirror);
  const sheet = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshPhysicalMaterial({ color: '#050404', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.9 }));
  sheet.rotation.x = -Math.PI / 2; sheet.position.y = -2.895; scene.add(sheet);

  // The mark: the back layer is a thick glossy slab; later layers stand proud of it.
  const svg = await (await fetch(IDENT.logo)).text();
  mark = new T.Group(); scene.add(mark);
  const inner = new T.Group(); inner.scale.setScalar(0.1); inner.position.z = -0.35; mark.add(inner);
  layers = logoLayers(svg).map((layer, i) => {
    const metal = (IDENT.metal ?? []).includes(i);
    const depth = i === 0 ? 3 : metal ? 2.2 : 1.0, bevel = i === 0 ? 1.2 : metal ? 0.7 : 0.35;
    const geometry = new T.ExtrudeGeometry(layer.shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 6, curveSegments: 48 });
    const material = metal
      ? new T.MeshPhysicalMaterial({ color: layer.color, metalness: 1, roughness: 0.16, emissive: layer.color, emissiveIntensity: 0 })
      : new T.MeshPhysicalMaterial({ color: layer.color, roughness: i === 0 ? 0.25 : 0.42, metalness: i === 0 ? 0.1 : 0, clearcoat: i === 0 ? 0.9 : 0.5, clearcoatRoughness: i === 0 ? 0.1 : 0.2, emissive: layer.color, emissiveIntensity: 0 });
    const mesh = new T.Mesh(geometry, material);
    mesh.position.z = i === 0 ? 0 : 3.6 + i * 0.3;
    mesh.castShadow = mesh.receiveShadow = true;
    inner.add(mesh);
    return { material, metal, base: i === 0 };
  });
  mark.rotation.x = -0.06;

  // The room again, plus a soft warm card behind the camera for the glossy faces to reflect.
  const env = new T.Scene();
  env.add(new T.Mesh(new T.SphereGeometry(60, 32, 16), new T.MeshBasicMaterial({ color: '#060504', side: T.BackSide })));
  const card = (w, h, color, kk, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(kk), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  card(70, 2.2, '#ffe2bd', 7, 0, 28, -14);
  card(2.6, 34, '#bcd0ff', 3, -34, 14, 6);
  card(46, 14, '#ffd8a8', 0.9, 0, 9, 36);
  scene.environment = new T.PMREMGenerator(ctx.renderer).fromScene(env, 0.02).texture;

  // The gold line: a thin bar whose lit length grows, then folds into the centre.
  lineMat = new T.ShaderMaterial({
    uniforms: { uA: { value: 0 }, uB: { value: 0 }, uI: { value: 0 } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uA, uB, uI;
      void main(){
        float x = vUv.x; float lit = smoothstep(uA - 0.004, uA + 0.004, x) * (1.0 - smoothstep(uB - 0.004, uB + 0.004, x));
        float head = exp(-pow((x - uB) * 60.0, 2.0)) * step(0.0001, uB - uA);
        float core = exp(-pow((vUv.y - 0.5) * 7.0, 2.0));
        vec3 gold = mix(vec3(0.70, 0.28, 0.12), vec3(0.95, 0.80, 0.50), smoothstep(0.0, 1.0, x));
        gl_FragColor = vec4(gold * (lit + head * 3.0) * core * uI, 1.0);
      }`,
  });
  const line = new T.Mesh(new T.PlaneGeometry(16, 0.12), lineMat); line.position.set(0, -0.2, 1.2); scene.add(line);
  // A soft flare where the line folds into the mark. Additive flares skip the depth test, or the
  // floor slices them flat.
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fx = fc.getContext('2d');
  const g = fx.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,244,220,1)'); g.addColorStop(0.08, 'rgba(255,214,150,0.75)'); g.addColorStop(0.25, 'rgba(255,180,90,0.22)'); g.addColorStop(0.5, 'rgba(255,160,60,0.05)'); g.addColorStop(1, 'rgba(255,160,60,0)');
  fx.fillStyle = g; fx.fillRect(0, 0, 256, 256);
  flare = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshBasicMaterial({ map: new T.CanvasTexture(fc), color: '#000', transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending }));
  flare.position.set(0, -0.2, 1.3); scene.add(flare);

  // The glint: a tall, thin light panel sliding near the camera axis reflects as a clean streak
  // across the glossy faces. (A point or spot light floods a flat face, and bloom turns it white.)
  glint = new T.RectAreaLight('#fff1d6', 0, 0.5, 16); scene.add(glint);

  // Dust in the light, placed by a fixed seed so every render is identical.
  let seed = 1836; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 520, pos = new Float32Array(N * 3); const base = [];
  for (let i = 0; i < N; i++) base.push([rnd() * 18 - 9, rnd() * 7 - 3, rnd() * 8 - 2, rnd() * 0.25 + 0.05, rnd() * Math.PI * 2]);
  const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(pos, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dx = dc.getContext('2d');
  const dg = dx.createRadialGradient(32, 32, 0, 32, 32, 32); dg.addColorStop(0, 'rgba(255,235,200,1)'); dg.addColorStop(1, 'rgba(255,235,200,0)'); dx.fillStyle = dg; dx.fillRect(0, 0, 64, 64);
  moteMat = new T.PointsMaterial({ size: 0.05, map: new T.CanvasTexture(dc), color: '#000', transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  motes = new T.Points(mg, moteMat); motes.userData.base = base; scene.add(motes);

  ctx.lights.key.position.set(-14, 18, 22); ctx.lights.key.target.position.set(0, 0, 0);
  ctx.lights.rim.position.set(0, 9, -10); ctx.lights.rim.lookAt(0, 0, 0);
}

export function update(t, ctx) {
  const outro = ctx.shot.name === 'outro';
  // The room comes up once the mark is revealed (straight away on the closing card).
  const up = outro ? smooth(t / 0.8) : smooth((t - REVEAL) / 0.9);
  for (const name of ['key', 'rim', 'top', 'fill']) ctx.lights[name].intensity *= up;
  ctx.scene.environmentIntensity *= 0.15 + 0.85 * up;

  // The line draws left to right, then folds into the centre at the reveal.
  if (!outro) {
    const draw = easeInOut(ramp(t, LINE.t0, LINE.t1));
    const fold = easeInOut(ramp(t, LINE.t1 + 0.1, REVEAL));
    lineMat.uniforms.uA.value = 0.5 * fold;
    lineMat.uniforms.uB.value = draw * (1 - fold) + 0.5 * fold + 0.0001;
    lineMat.uniforms.uI.value = 2.2 * smooth((t - LINE.t0) / 0.3) * (1 - smooth((t - REVEAL) / 0.12)) * (1 + 1.5 * fold);
    const f = t >= REVEAL - 0.15 ? Math.exp(-Math.max(0, t - REVEAL) * 3.2) * smooth((t - (REVEAL - 0.15)) / 0.15) : 0;
    flare.material.color.setScalar(f * 1.25);
  } else { lineMat.uniforms.uI.value = 0; flare.material.color.setScalar(0); }

  // The mark is unseen until the reveal, then settles into place.
  const r = outro ? 1 : easeOut(ramp(t, REVEAL - 0.05, REVEAL + 0.9));
  mark.visible = r > 0;
  mark.scale.setScalar(0.94 + 0.06 * r);
  mark.rotation.y = (1 - r) * 0.18 + (outro ? 0.04 * Math.sin(t * 0.5) : 0.03 * Math.sin((t - REVEAL) * 0.6));
  mark.position.y = outro ? 0 : -0.15 * (1 - r);
  const pop = outro ? 0 : Math.exp(-Math.max(0, t - REVEAL) * 2.5) * (t >= REVEAL ? 1 : 0);
  for (const l of layers) {
    l.material.emissiveIntensity = l.base ? 0 : l.metal ? 0.35 * up + 1.6 * pop : 0.1 * up + 0.5 * pop;
    l.material.transparent = r < 1; l.material.opacity = r;
  }

  // The glint crosses once, close to the camera axis, so flat faces and bevels catch it.
  const gp = outro ? ramp(t, 1.0, 3.6) : ramp(t, GLINT.t0, GLINT.t1);
  glint.position.set(-7 + 14 * easeInOut(gp), 1.0, 19);
  glint.lookAt(0, 0, 0);
  glint.intensity = 6 * Math.sin(Math.PI * clamp(gp)) ** 2;

  // Dust drifts, brighter near the line and once the room is lit.
  const pos = motes.geometry.attributes.position, base = motes.userData.base;
  for (let i = 0; i < base.length; i++) {
    const [x, y, z, v, ph] = base[i];
    pos.setXYZ(i, x + Math.sin(t * 0.3 + ph) * 0.3, y + ((v * t) % 7), z + Math.cos(t * 0.25 + ph) * 0.2);
  }
  pos.needsUpdate = true;
  moteMat.color.setScalar(clamp(0.35 * up + (outro ? 0 : lineMat.uniforms.uI.value * 0.25), 0, 1.2));
}

const V = (x, y, z) => new T.Vector3(x, y, z);
export const SHOT_POSE = new Proxy({}, {
  get: (_, name) => ({
    intro: { from: [V(0, 1.4, 25), V(0, -0.9, 0)], to: [V(0, 1.0, 20.5), V(0, -0.8, 0)], fov: 30, ap: 0.004 },
    outro: { from: [V(0, 0.6, 27), V(0, -2.4, 0)], to: [V(0, 0.4, 25), V(0, -2.4, 0)], fov: 30, ap: 0.003 },
  })[name],
});
