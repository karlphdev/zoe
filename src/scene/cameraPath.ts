import * as THREE from 'three';
import { SECTION_COUNT, modulo } from '../scroll';

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fogNear: number;
  fogFar: number;
}

/**
 * Travelling caméra en boucle fermée : une prise par section, Catmull-Rom entre elles.
 * Le temps local est adouci pour que la caméra « se pose » sur chaque section.
 */
export class CameraPath {
  shots: Shot[] = [];

  /** size : dimensions du bâtiment ; distance : recul qui le cadre en plein écran ; wall : centre du mur de S3. */
  build(size: THREE.Vector3, distance: number, wall: THREE.Vector3) {
    const W = size.x, H = size.y, Z = size.z;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.shots = [
      // S1 bâtiment : plein écran, légère contre-plongée.
      // Brouillard calé sur le recul : en portrait la caméra recule beaucoup plus.
      { pos: v(0, -0.18 * H, distance), target: v(0, 0.02 * H, 0), fogNear: distance + 20, fogFar: distance * 2 + 100 },
      // S2 écouter : plan serré sur la façade, les fenêtres-interface s'y accrochent.
      { pos: v(0.2 * W, 0.12 * H, 0.5 * Z + 34), target: v(0.18 * W, 0.1 * H, 0), fogNear: 70, fogFar: 220 },
      // S3 dates : travelling latéral jusqu'au mur de béton nu.
      { pos: v(wall.x, wall.y, wall.z + 72), target: v(wall.x, wall.y, wall.z), fogNear: 60, fogFar: 200 },
      // S4 contact : la caméra monte à gauche, dos au mur, et se dissout dans le brouillard gris.
      { pos: v(-0.9 * W, 1.5 * H, 0.9 * distance), target: v(-0.25 * W, 0.55 * H, 0), fogNear: 30, fogFar: 160 },
    ];
  }

  sample(position: number, out: Shot) {
    const p = modulo(position, SECTION_COUNT);
    const i = Math.floor(p);
    const t = ease(p - i);
    const s = this.shots;
    const at = (k: number) => s[modulo(k, SECTION_COUNT)];
    catmull(at(i - 1).pos, at(i).pos, at(i + 1).pos, at(i + 2).pos, t, out.pos);
    catmull(at(i - 1).target, at(i).target, at(i + 1).target, at(i + 2).target, t, out.target);
    out.fogNear = THREE.MathUtils.lerp(at(i).fogNear, at(i + 1).fogNear, t);
    out.fogFar = THREE.MathUtils.lerp(at(i).fogFar, at(i + 1).fogFar, t);
    return out;
  }
}

export const newShot = (): Shot => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fogNear: 0, fogFar: 0 });

// Palier sur chaque prise, transition franche entre les deux.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function catmull(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const t2 = t * t, t3 = t2 * t;
  for (const k of ['x', 'y', 'z'] as const) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}
