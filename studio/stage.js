// The stage: the renderer, the dark studio, the lights, the post chain and the camera, shared by the
// studio (studio/main.js) and the logo ident (ident/main.js). A scene module owns what is in front of
// the lens (build, update, SHOT_POSE); window.__frame(shot, seconds) draws one moment of one shot, so
// a render is smooth however long a frame takes (scripts/render.mjs films it).
//
// URL options: ?shot=<name>&t=<seconds> shows one moment, ?play loops the first shot in real time,
// ?off=key,rim,top,fill,env,bloom silences a source to find what a reflection comes from.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { easeInOut } from '../src/util.js';

// scene: { build(ctx), update(t, ctx), SHOT_POSE }. shots: [{ name, from, duration }] on the scene's
// clock. overlay(shot, t): optional, poses page elements drawn over the canvas (the ident's text).
export function createStage({ scene: SCENE, shots: SHOTS, overlay }) {
  const W = 1920, H = 1080;
  const params = new URLSearchParams(location.search);
  const OFF = (params.get('off') ?? '').split(',').filter(Boolean);

  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  // Neutral keeps screens on their true colours; ACES would desaturate them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#040303');
  scene.fog = new THREE.FogExp2('#040303', 0.012);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);

  // A dark studio of thin softbox strips. Not RoomEnvironment: its bright panels reflect as a big soft
  // blob in any glossy surface; strips reflect as clean lines.
  const pmrem = new THREE.PMREMGenerator(renderer);
  function studioEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: '#060504', side: THREE.BackSide })));
    const strip = (w, h, color, k, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
    };
    strip(70, 2.2, '#ffe2bd', 7, new THREE.Vector3(0, 28, -14));
    strip(2.6, 34, '#bcd0ff', 3, new THREE.Vector3(-34, 14, 6));
    strip(40, 1.4, '#ffd29a', 2.5, new THREE.Vector3(0, 9, 34));
    return pmrem.fromScene(env, 0.02).texture;
  }
  scene.environment = studioEnvironment();
  const ENV = 0.32;

  // ---------------------------------------------------------------- lights
  // Fill is a hemisphere light on purpose: a point light hot-spots glossy glass.
  const key = new THREE.SpotLight('#ffe4c4', 2200, 120, 0.42, 0.85, 2);
  key.position.set(-9, 30, 20); key.target.position.set(0, 0, 0); scene.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.00012; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  key.shadow.camera.near = 10; key.shadow.camera.far = 80;
  const rim = new THREE.RectAreaLight('#ffc98a', 2.2, 34, 2.5); rim.position.set(0, 7, -12); rim.lookAt(0, 0, 0); scene.add(rim);
  const top = new THREE.RectAreaLight('#e8ecff', 0.2, 26, 7); top.position.set(0, 16, 2); top.lookAt(0, 0, 0); scene.add(top);
  const fill = new THREE.HemisphereLight('#6a7fae', '#1a120c', 0.35); scene.add(fill);
  const LIGHTS = { key, rim, top, fill };

  // ---------------------------------------------------------------- post
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.0015, maxblur: 0.012 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.55, 0.82);
  composer.addPass(bloom);
  const BLOOM = bloom.strength;
  composer.addPass(new OutputPass());
  // Grade: a touch of chromatic edge, a vignette and film grain seeded by the frame.
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uFrame: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uFrame; varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main(){
        vec2 c = vUv - 0.5; float d = dot(c, c); vec2 off = c * d * 0.006;
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        col *= 1.0 - smoothstep(0.12, 0.62, d) * 0.55;
        col += (hash(vUv * vec2(1920.0, 1080.0) + uFrame * 17.0) - 0.5) * 0.028;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);

  // ---------------------------------------------------------------- camera
  // A shot eases from one pose to another across its length (SHOT_POSE in scene.js).
  function poseCamera(shot, k) {
    const P = SCENE.SHOT_POSE[shot.name];
    if (!P) throw new Error(`scene.js has no SHOT_POSE for ${shot.name}`);
    const u = easeInOut(k) * 0.85 + k * 0.15;
    const pos = P.from[0].clone().lerp(P.to[0], u);
    const tgt = P.from[1].clone().lerp(P.to[1], u);
    camera.position.copy(pos); camera.fov = P.fov; camera.updateProjectionMatrix(); camera.lookAt(tgt);
    bokeh.uniforms.focus.value = pos.distanceTo(tgt);
    bokeh.uniforms.aperture.value = (P.ap ?? 0.01) * 0.1;
  }

  // ---------------------------------------------------------------- frame
  const ctx = { THREE, scene, camera, renderer, lights: LIGHTS, bloom, W, H };
  for (const l of Object.values(LIGHTS)) l.userData.base = l.intensity;
  function render(index, t) {
    const shot = SHOTS[index];
    const clock = shot.from + t;
    poseCamera(shot, Math.min(1, Math.max(0, t / shot.duration)));
    for (const l of Object.values(LIGHTS)) l.intensity = l.userData.base;
    scene.environmentIntensity = ENV;
    bloom.strength = BLOOM;
    ctx.shot = shot;
    SCENE.update(clock, ctx);
    overlay?.(shot, t);
    for (const name of OFF) if (LIGHTS[name]) LIGHTS[name].intensity = 0;
    if (OFF.includes('env')) scene.environmentIntensity = 0;
    if (OFF.includes('bloom')) bloom.strength = 0;
    // Grain is seeded by the moment, so the same frame always renders the same.
    grade.uniforms.uFrame.value = index * 100000 + Math.round(t * 60);
    composer.render();
  }

  async function boot() {
    await document.fonts.ready;
    await Promise.all(['600 40px "Sora"', '700 40px "Sora"', '500 20px "Inter"', '600 20px "Inter"', '600 20px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
    await SCENE.build(ctx);
    window.__shots = SHOTS.map((s) => ({ name: s.name, duration: s.duration }));
    window.__frame = (index, t) => { render(index, t); return true; };
    window.__ready = true;
    if (params.has('shot')) render(Math.max(0, SHOTS.findIndex((s) => s.name === params.get('shot'))), parseFloat(params.get('t') ?? '0'));
    else if (params.has('play')) {
      const t0 = performance.now();
      const loop = () => { render(0, ((performance.now() - t0) / 1000) % SHOTS[0].duration); requestAnimationFrame(loop); };
      loop();
    }
  }
  boot().catch((e) => { window.__failed = String(e); throw e; });
}
