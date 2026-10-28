import * as THREE from 'three';

/**
 * Chambre visitable à 360° : un panorama équirectangulaire (généré avec Higgsfield) plaqué
 * à l'intérieur d'une sphère. On regarde autour en glissant, molette pour zoomer, Échap pour sortir.
 */
export class Room {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
  isOpen = false;
  private lon = 0;
  private lat = 0;
  private texture?: Promise<THREE.Texture>;
  private el: HTMLElement;

  constructor(private onToggle: (open: boolean) => void) {
    this.el = document.createElement('div');
    this.el.className = 'room';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Chambre, vue à 360°');
    this.el.innerHTML = `<button class="room__close" type="button">sortir</button><span class="room__hint">glisser pour regarder</span>`;
    document.body.appendChild(this.el);
    this.el.querySelector('button')!.addEventListener('click', () => this.close());
    addEventListener('keydown', (e) => e.key === 'Escape' && this.close());

    this.el.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('button')) return;
      this.el.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => {
        const k = this.camera.fov / innerHeight;
        this.lon -= m.movementX * k;
        this.lat = THREE.MathUtils.clamp(this.lat + m.movementY * k, -85, 85);
      };
      this.el.addEventListener('pointermove', move);
      this.el.addEventListener('pointerup', () => this.el.removeEventListener('pointermove', move), { once: true });
    });
    this.el.addEventListener('wheel', (e) => {
      this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + e.deltaY * 0.03, 40, 95);
      this.camera.updateProjectionMatrix();
    }, { passive: true });
  }

  async open() {
    // Chargement à la première visite seulement : 1,3 Mo qu'on n'impose pas à tout le monde.
    this.texture ??= new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}textures/chambre.webp`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      // Retournée dans la géométrie (pas via scale) : on voit l'intérieur, sans image inversée.
      const geom = new THREE.SphereGeometry(10, 64, 32).scale(-1, 1, 1);
      this.scene.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: t })));
      return t;
    });
    await this.texture;
    this.lon = 180; // face à la fenêtre, centre du panorama
    this.lat = 0;
    this.isOpen = true;
    this.el.classList.add('is-open');
    this.onToggle(true);
    this.el.querySelector('button')!.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.onToggle(false);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update() {
    const phi = THREE.MathUtils.degToRad(90 - this.lat);
    const theta = THREE.MathUtils.degToRad(this.lon);
    this.camera.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  }
}
