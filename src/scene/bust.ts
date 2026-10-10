import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { patchMaterial } from './waves';
import { Spring } from './spring';
import { SECTION_COUNT, modulo } from '../scroll';

const SECTION = 3;
const YAW_MAX = THREE.MathUtils.degToRad(35);
const PITCH_MAX = THREE.MathUtils.degToRad(15);

/**
 * Section « contact » : buste en marbre (Poly Haven, CC0) dans le brouillard, remappé en béton.
 * Une seule interaction : il suit le curseur du regard, avec un ressort lourd de statue.
 */
export class Bust {
  readonly root = new THREE.Group();
  private facing = 0;
  private yaw: Spring;
  private pitch: Spring;

  constructor(reducedMotion: boolean) {
    const [k, d] = reducedMotion ? [8, 6] : [30, 9];
    this.yaw = new Spring(0, k, d);
    this.pitch = new Spring(0, k, d);
  }

  async load() {
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(`${import.meta.env.BASE_URL}models/bust.glb`);
    draco.dispose();
    const model = gltf.scene;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) patchMaterial(mesh.material as THREE.Material, { displace: false });
    });
    // Centré sous le pivot, pour qu'il tourne sur lui-même.
    model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
    this.root.add(model);
  }

  /** Posé sur l'axe de la prise S4, tourné vers la caméra. */
  place(shot: { pos: THREE.Vector3; target: THREE.Vector3 }) {
    this.root.position.lerpVectors(shot.pos, shot.target, 0.45);
    this.facing = Math.atan2(shot.pos.x - this.root.position.x, shot.pos.z - this.root.position.z);
  }

  setPointer(x: number, y: number, active: boolean) {
    // Curseur sorti de la fenêtre : retour de face.
    this.yaw.target = active ? ((x / innerWidth) * 2 - 1) * YAW_MAX : 0;
    this.pitch.target = active ? ((y / innerHeight) * 2 - 1) * PITCH_MAX : 0;
  }

  update(dt: number, position: number) {
    const d = Math.abs(modulo(position - SECTION + SECTION_COUNT / 2, SECTION_COUNT) - SECTION_COUNT / 2);
    this.root.visible = d < 1.1;
    if (!this.root.visible) return;
    this.root.rotation.y = this.facing + this.yaw.update(dt);
    this.root.rotation.x = this.pitch.update(dt);
  }
}
