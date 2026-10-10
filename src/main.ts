import './styles.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Building } from './scene/building';
import { Spring } from './scene/spring';
import { CameraPath, newShot } from './scene/cameraPath';
import { createWall } from './scene/wall';
import { InfiniteScroll, SECTION_COUNT } from './scroll';
import { Rails } from './ui/rails';
import { Panels } from './ui/panels';
import { Rainbow } from './fx/rainbow';
import { Grain } from './fx/grain';
import { Cursor } from './ui/cursor';
import { Bust } from './scene/bust';
import { device, hasWebGL2 } from './device';

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const loaderEl = document.querySelector<HTMLElement>('.loader')!;
const countEl = document.querySelector<HTMLElement>('.loader__count')!;

/** Sans WebGL (ou si le chargement échoue) : image fixe du bâtiment, le texte reste accessible. */
function fallback(reason: unknown) {
  console.warn('Zoé : rendu 3D indisponible, image fixe affichée.', reason);
  document.documentElement.classList.add('no-gl');
  loaderEl.classList.add('is-done');
  document.body.classList.add('is-loaded');
  // Sans scroll 3D, la navigation bascule simplement le contenu du rail droit.
  const staticRails: Rails = new Rails((i) => staticRails.setActive(i));
  staticRails.setActive(0);
}

if (!hasWebGL2()) {
  fallback('WebGL2 indisponible');
  throw new Error('WebGL2 indisponible');
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, device.lite ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const bg = new THREE.Color('#adaeac');
scene.background = bg;
scene.fog = new THREE.Fog(bg, 90, 220);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

// Lumière rasante : c'est elle qui fait lire le relief des ondes sur le béton.
const sun = new THREE.DirectionalLight('#ffffff', 3.4);
sun.position.set(-60, 45, 80);
scene.add(sun, new THREE.HemisphereLight('#d9d9d5', '#3b3d40', 0.5));
// Ombres portées sur desktop seulement : le bâtiment s'ombre lui-même (balcons, porte-à-faux).
const shadows = !device.lite;
if (shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
}

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 600);
const building = new Building({
  reducedMotion: device.reducedMotion,
  shadows,
  proxyNames: new Set(['Walls', 'Balconies']),
});
scene.add(building.root);

const path = new CameraPath();
const shot = newShot();
let wall: THREE.Mesh;
const panels = new Panels(document.querySelector<HTMLElement>('.panels')!);

// Parallaxe caméra, opposée au mouvement du curseur.
const camX = new Spring(0, 40, 12);
const camY = new Spring(0, 40, 12);

function frame() {
  const s = building.size;
  // S1 : le bâtiment remplit la hauteur de l'écran, et la largeur sur un écran portrait.
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const fitH = (s.y * 0.47) / Math.tan(vFov / 2);
  const fitW = (Math.max(s.x, s.z) * 0.5) / (Math.tan(vFov / 2) * camera.aspect);
  path.build(s, Math.max(fitH, fitW) + Math.max(s.x, s.z) * 0.5, wall.position);
  panels.place(building, path.shots[1], camera.fov);
  bust.place(path.shots[3]);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  frame();
  rails.placeMarker();
}

const bust = new Bust(device.reducedMotion);
scene.add(bust.root);
const setPointer = (x: number, y: number, active: boolean) => {
  building.setPointer(x, y, active);
  bust.setPointer(x, y, active);
};

addEventListener('pointermove', (e) => {
  setPointer(e.clientX, e.clientY, true);
  if (!device.reducedMotion && e.pointerType === 'mouse') {
    camX.target = -(e.clientX / innerWidth - 0.5) * 0.8 * 6;
    camY.target = (e.clientY / innerHeight - 0.5) * 0.8 * 4;
  }
});
document.documentElement.addEventListener('pointerleave', () => setPointer(-1, -1, false));
// Tactile : un tap déclenche une onde au point touché.
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') setPointer(e.clientX, e.clientY, true);
});
addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') setTimeout(() => setPointer(-1, -1, false), 120);
});

let stats: { begin(): void; end(): void; dom: HTMLElement } | undefined;
if (device.debug) {
  const { default: Stats } = await import('three/examples/jsm/libs/stats.module.js');
  stats = new Stats();
  document.body.appendChild(stats.dom);
}

const url = device.lite ? `${import.meta.env.BASE_URL}models/tricorner-lite.glb` : `${import.meta.env.BASE_URL}models/tricorner.glb`;
try {
  await Promise.all([
    building.load(url, (p) => (countEl.textContent = String(Math.round(p * 100)).padStart(3, '0'))),
    bust.load(),
  ]);
} catch (e) {
  fallback(e);
  throw e;
}
countEl.textContent = '100';
if (shadows) {
  // Caméra d'ombre ajustée au bâtiment (centré à l'origine).
  const r = building.size.length() * 0.55;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
}
wall = createWall(renderer, building.size);
scene.add(wall);
if (device.wire) building.root.traverse((o) => {
  const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
  if (m && 'wireframe' in m) m.wireframe = true;
});
frame();

// Compile les shaders avant d'enlever le loader, pour éviter un à-coup à la première frame.
await renderer.compileAsync(scene, camera);
loaderEl.classList.add('is-done');
document.body.classList.add('is-loaded');

const scroll = new InfiniteScroll(device.coarse);
const rails = new Rails((i) => scroll.goTo(i));
const rainbow = new Rainbow(document.querySelector<HTMLCanvasElement>('.rainbow')!, device.reducedMotion);
const grain = new Grain(device.reducedMotion);
const cursor = device.coarse ? null : new Cursor();
addEventListener('resize', resize);
// ?s=2 : ouvre directement sur une section (débogage, captures).
const startSection = Number(new URLSearchParams(location.search).get('s'));
if (startSection) scroll.lenis.scrollTo((startSection / SECTION_COUNT) * scroll.lenis.limit, { immediate: true });

const timer = new THREE.Timer();
timer.connect(document);
let introDone = false;
let nextAmbient = 2;
const fog = scene.fog as THREE.Fog;
const root = document.documentElement;

renderer.setAnimationLoop((timeMs) => {
  stats?.begin();
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();

  if (!introDone && t > 0.35) {
    // Le bâtiment « émerge » par une première onde depuis son centre.
    if (!device.reducedMotion) building.pulse(building.objectCenter, 1.6, t);
    introDone = true;
  }
  // Tactile : pas de survol, donc une petite onde ambiante de temps en temps.
  if (device.coarse && !device.reducedMotion && t > nextAmbient) {
    const p = building.objectCenter;
    p.x += (Math.random() - 0.5) * building.size.x * 0.6;
    p.y += (Math.random() - 0.3) * building.size.y * 0.5;
    building.pulse(p, 0.5, t);
    nextAmbient = t + 3.5;
  }

  scroll.update(timeMs);
  rails.setActive(scroll.index);
  // La grille horizontale suit le scroll ; modulo sur sa période pour rester raccord.
  root.style.setProperty('--grid-y', `${(-(scroll.lenis.animatedScroll % (innerHeight / 8))).toFixed(1)}px`);

  path.sample(scroll.position, shot);
  camera.position.copy(shot.pos);
  camera.position.x += camX.update(dt);
  camera.position.y += camY.update(dt);
  camera.lookAt(shot.target);
  fog.near = shot.fogNear;
  fog.far = shot.fogFar;

  // La vitesse de scroll fait légèrement basculer le bâtiment, avec le même ressort que la parallaxe.
  building.scrollTilt = THREE.MathUtils.clamp(scroll.velocity * 0.02, -0.06, 0.06);
  building.update(dt, t, camera);
  panels.update(camera, building, scroll.position);
  rainbow.update(dt, scroll.position);
  bust.update(dt, scroll.position);
  grain.update(dt, scroll.velocity);
  cursor?.update(dt, building.hovering);
  renderer.render(scene, camera);
  stats?.end();
});
