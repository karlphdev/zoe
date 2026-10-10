import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { CELL, MAX_IMPULSES, createWaveDepthMaterial, patchMaterial, waveUniforms, type WaveUniforms } from './waves';
import { Spring } from './spring';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

interface WaveModelOptions {
  reducedMotion: boolean;
  shadows?: boolean;
  /** Meshes servant au raycast ; null = tout le modèle. */
  proxyNames?: Set<string> | null;
  uniforms?: WaveUniforms;
  /** Amplitude de la rotation suivant le curseur, en degrés. */
  yawDeg?: number;
  pitchDeg?: number;
}

/**
 * Modèle déformable par des vagues parties du curseur : raycast BVH sur un proxy, impulsions
 * en ring buffer, inertie par ressorts.
 */
export class Building {
  /** Pivot de rotation, centré sur le modèle. */
  readonly root = new THREE.Group();
  /** Modèle tel que chargé ; son espace local = espace objet du shader. */
  model!: THREE.Object3D;
  /** Fenêtres vitrées regroupées par cellule (espace objet), points d'accroche des panneaux UI. */
  windows: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  private proxy!: THREE.Mesh;
  size = new THREE.Vector3();

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(10, 10);
  private pointerActive = false;
  private pointerSpeed = 0;
  private lastPointer = new THREE.Vector2();
  hovering = false;

  // Point d'impact lissé : les vagues suivent le curseur avec inertie.
  private hit = new THREE.Vector3();
  private hitSprings = [new Spring(0, 120, 18), new Spring(0, 120, 18), new Spring(0, 120, 18)];
  private lastEmit = new THREE.Vector3(1e9, 0, 0);
  private lastEmitTime = -1;
  private nextSlot = 0;

  // Rotation et parallaxe.
  private yaw = new Spring(0, 60, 14);
  private pitch = new Spring(0, 60, 14);

  private reducedMotion: boolean;
  private shadows: boolean;
  private proxyNames: Set<string> | null;
  readonly uniforms: WaveUniforms;
  private yawMax: number;
  private pitchMax: number;
  /** Rotation propre ajoutée à celle du curseur (rad). */
  spin = 0;

  constructor(o: WaveModelOptions) {
    this.reducedMotion = o.reducedMotion;
    this.shadows = o.shadows ?? false;
    this.proxyNames = o.proxyNames === undefined ? null : o.proxyNames;
    this.uniforms = o.uniforms ?? waveUniforms;
    this.yawMax = THREE.MathUtils.degToRad(o.yawDeg ?? 7);
    this.pitchMax = THREE.MathUtils.degToRad(o.pitchDeg ?? 3);
  }

  async load(url: string, onProgress: (p: number) => void) {
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf = await loader.loadAsync(url, (e) => e.total && onProgress(e.loaded / e.total));
    draco.dispose();
    this.model = gltf.scene;

    const proxyGeoms: THREE.BufferGeometry[] = [];
    const depthMaterial = createWaveDepthMaterial(this.uniforms);
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) patchMaterial(m, { glass: m.name === 'M_Window_01_Glass', uniforms: this.uniforms });
      if (mats.some((m) => m.name === 'M_Window_01_Glass')) this.collectWindows(mesh.geometry);
      // Le déplacement sort de la bounding sphere d'origine : on évite le culling trop agressif.
      mesh.frustumCulled = false;
      if (this.shadows) {
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.customDepthMaterial = depthMaterial;
      }
      if (!this.proxyNames || this.proxyNames.has(meshName(mesh, this.proxyNames))) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', mesh.geometry.getAttribute('position'));
        g.setIndex(mesh.geometry.getIndex());
        proxyGeoms.push(g);
      }
    });

    // Proxy de raycast (non déformé) accéléré par BVH.
    const proxyGeom = mergeGeometries(proxyGeoms, false)!;
    proxyGeom.boundsTree = new MeshBVH(proxyGeom);
    this.proxy = new THREE.Mesh(proxyGeom, new THREE.MeshBasicMaterial({ visible: false }));
    this.model.add(this.proxy);

    // Centre le modèle sous le pivot ; l'axe des ondes radiales passe par ce centre.
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    box.getSize(this.size);
    this.model.position.sub(center);
    this.uniforms.uAxis.value.set(center.x, center.z);
    this.root.add(this.model);
  }

  private collectWindows(geom: THREE.BufferGeometry) {
    const pos = geom.getAttribute('position');
    const idx = geom.getIndex();
    const cells = new Map<string, { sum: THREE.Vector3; n: THREE.Vector3; count: number }>();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const tri = new THREE.Triangle();
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const [ia, ib, ic] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
      tri.set(a, b, c);
      const centroid = tri.getMidpoint(new THREE.Vector3());
      const key = centroid.clone().multiply(CELL).floor().toArray().join(',');
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { sum: new THREE.Vector3(), n: new THREE.Vector3(), count: 0 }));
      const area = tri.getArea();
      cell.sum.addScaledVector(centroid, area);
      cell.n.addScaledVector(tri.getNormal(new THREE.Vector3()), area);
      cell.count += area;
    }
    for (const cell of cells.values()) {
      if (cell.count < 0.5) continue; // ignore les éclats de vitre
      this.windows.push({ center: cell.sum.divideScalar(cell.count), normal: cell.n.normalize() });
    }
  }

  /** Inclinaison liée à la vitesse de scroll (en écrans/s). */
  scrollTilt = 0;

  setPointer(x: number, y: number, active: boolean) {
    const nx = (x / innerWidth) * 2 - 1;
    const ny = -(y / innerHeight) * 2 + 1;
    if (this.pointerActive) this.pointerSpeed += Math.hypot(nx - this.lastPointer.x, ny - this.lastPointer.y);
    this.lastPointer.set(nx, ny);
    this.ndc.set(nx, ny);
    this.pointerActive = active;
    if (!this.reducedMotion) {
      // Curseur sorti de la fenêtre : retour de face.
      this.yaw.target = active ? nx * this.yawMax : 0;
      this.pitch.target = active ? -ny * this.pitchMax : 0;
    }
  }

  /** Impulse ponctuelle (tap mobile, intro). Point en espace objet. */
  pulse(objectPoint: THREE.Vector3, amp: number, time: number) {
    const slot = this.nextSlot;
    this.nextSlot = (slot + 1) % MAX_IMPULSES;
    this.uniforms.uImpulses.value[slot].set(objectPoint.x, objectPoint.y, objectPoint.z, time);
    this.uniforms.uAmps.value[slot] = amp;
  }

  /** Centre du modèle en espace objet, pour l'onde d'intro. */
  get objectCenter() {
    return this.model.position.clone().negate();
  }

  update(dt: number, time: number, camera: THREE.Camera) {
    this.uniforms.uTime.value = time;

    this.root.rotation.y = this.yaw.update(dt) + this.spin;
    this.root.rotation.x = this.pitch.update(dt) + this.scrollTilt;

    // Un seul raycast par frame, contre le proxy BVH.
    this.hovering = false;
    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.ndc, camera);
      const hit = this.raycaster.intersectObject(this.proxy, false)[0];
      if (hit) {
        this.hovering = true;
        this.model.worldToLocal(this.hit.copy(hit.point));
        const springs = this.hitSprings;
        if (this.lastEmitTime < 0) springs.forEach((s, i) => (s.value = this.hit.getComponent(i)));
        springs.forEach((s, i) => (s.target = this.hit.getComponent(i)));
      }
    }
    const smoothed = new THREE.Vector3(...this.hitSprings.map((s) => s.update(dt)) as [number, number, number]);

    // Émission : quand le point a assez bougé, ou à cadence lente si le curseur reste posé.
    const speed = this.pointerSpeed / Math.max(dt, 1e-3); // NDC/s
    this.pointerSpeed = 0;
    if (this.hovering && !this.reducedMotion) {
      const moved = smoothed.distanceTo(this.lastEmit);
      const since = time - this.lastEmitTime;
      if (moved > 0.6 && since > 0.05 || since > 0.09 && speed > 0.05 || since > 0.6) {
        const amp = THREE.MathUtils.clamp(0.35 + speed * 0.35, 0.35, 1.3);
        this.pulse(smoothed, amp, time);
        this.lastEmit.copy(smoothed);
        this.lastEmitTime = time;
      }
    }
  }
}

function meshName(mesh: THREE.Mesh, names: Set<string>) {
  // GLTFLoader renomme les primitives multiples (« Walls_1 ») et les place sous un groupe nommé.
  let o: THREE.Object3D | null = mesh;
  while (o) {
    if (names.has(o.name)) return o.name;
    o = o.parent;
  }
  return mesh.name;
}
