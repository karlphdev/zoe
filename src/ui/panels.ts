import * as THREE from 'three';
import { panels } from '../content';
import type { Building } from '../scene/building';
import type { Shot } from '../scene/cameraPath';
import { SECTION_COUNT, modulo } from '../scroll';

/**
 * Fenêtres-interface de la section « écouter ». Chaque panneau est accroché à une vraie fenêtre
 * du bâtiment : on choisit, pour un emplacement de composition voulu, la fenêtre la plus proche
 * vue depuis la prise de vue S2, puis on la reprojette à chaque frame.
 */
export class Panels {
  private els: HTMLElement[] = [];
  private anchors: THREE.Vector3[] = [];
  private tmp = new THREE.Vector3();
  private section = 1;

  constructor(private root: HTMLElement) {
    for (const p of panels) {
      const el = document.createElement('a');
      el.className = 'panel';
      el.href = '#';
      el.style.setProperty('--w', `${p.w}px`);
      el.style.setProperty('--h', `${p.h}px`);
      el.style.setProperty('--tint', String(p.tint));
      el.innerHTML = `<span class="panel__title">${p.title}</span><span class="panel__meta">${p.meta}</span><span class="panel__link">${p.link}</span>`;
      el.addEventListener('click', (e) => e.preventDefault()); // TODO_CONTENT : vrais liens
      root.appendChild(el);
      this.els.push(el);
    }
  }

  /** À appeler une fois le bâtiment chargé et la prise S2 connue. */
  place(building: Building, shot: Shot, fov: number) {
    const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 1, 600);
    cam.position.copy(shot.pos);
    cam.lookAt(shot.target);
    cam.updateMatrixWorld();
    building.root.updateMatrixWorld(true);
    const m = building.model.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const viewDir = shot.target.clone().sub(shot.pos).normalize();

    const candidates = building.windows
      .map((w) => {
        const world = w.center.clone().applyMatrix4(m);
        const facing = w.normal.clone().applyMatrix3(nm).normalize().dot(viewDir);
        const ndc = world.clone().project(cam);
        return { w, x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, facing };
      })
      .filter((c) => c.facing < -0.35 && c.x > 0.08 && c.x < 0.9 && c.y > 0.1 && c.y < 0.85);

    const used = new Set<object>();
    this.anchors = panels.map((p) => {
      let best = candidates[0];
      let bestD = Infinity;
      for (const c of candidates) {
        if (used.has(c.w)) continue;
        const d = Math.hypot(c.x - p.slot[0], c.y - p.slot[1]);
        if (d < bestD) (bestD = d), (best = c);
      }
      if (best) used.add(best.w);
      return best ? best.w.center.clone() : new THREE.Vector3();
    });
  }

  update(camera: THREE.Camera, building: Building, position: number) {
    if (!this.anchors.length) return;
    // Visibles autour de S2 uniquement ; distance cyclique en sections.
    const d = Math.abs(modulo(position - this.section + SECTION_COUNT / 2, SECTION_COUNT) - SECTION_COUNT / 2);
    const visible = 1 - THREE.MathUtils.smoothstep(d, 0.18, 0.45);
    this.root.style.visibility = visible > 0.001 ? 'visible' : 'hidden';
    if (visible <= 0.001) return;
    const m = building.model.matrixWorld;
    this.els.forEach((el, i) => {
      const p = this.tmp.copy(this.anchors[i]).applyMatrix4(m).project(camera);
      const x = ((p.x + 1) / 2) * innerWidth;
      const y = ((1 - p.y) / 2) * innerHeight;
      // Apparition décalée panneau par panneau, en masque vertical.
      const local = THREE.MathUtils.clamp(visible * 1.6 - i * 0.12, 0, 1);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.clipPath = `inset(0 0 ${((1 - local) * 100).toFixed(1)}% 0)`;
    });
  }
}
