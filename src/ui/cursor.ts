/**
 * Curseur custom (pointeur fin uniquement) : un carré en différence qui suit avec du retard,
 * des coins de visée orange sur le bâtiment, une barre pleine sur les liens.
 * Deux éléments séparés, pour que l'orange ne passe pas dans le mode différence.
 */
export class Cursor {
  private square = el('cursor');
  private aim = el('cursor-aim');
  private x = -100;
  private y = -100;
  private tx = -100;
  private ty = -100;
  private overLink = false;

  constructor() {
    document.documentElement.classList.add('has-cursor');
    addEventListener('pointermove', (e) => {
      this.tx = e.clientX;
      this.ty = e.clientY;
      this.overLink = !!(e.target as Element).closest?.('a');
    });
    document.documentElement.addEventListener('pointerleave', () => (this.tx = this.ty = -100));
    // Navigation au clavier : on rend la main au curseur natif.
    addEventListener('keydown', (e) => {
      if (e.key === 'Tab') document.documentElement.classList.remove('has-cursor');
    });
    addEventListener('pointerdown', () => document.documentElement.classList.add('has-cursor'));
  }

  update(dt: number, aiming: boolean) {
    const k = 1 - Math.exp(-dt * 18);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    const t = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`;
    this.square.style.transform = t;
    this.aim.style.transform = t;
    this.square.classList.toggle('is-link', this.overLink);
    this.aim.classList.toggle('is-on', aiming && !this.overLink);
    this.square.classList.toggle('is-hidden', aiming && !this.overLink);
  }
}

function el(className: string) {
  const d = document.createElement('div');
  d.className = className;
  d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
  return d;
}
