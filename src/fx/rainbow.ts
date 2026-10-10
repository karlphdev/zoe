import { SECTION_COUNT, modulo } from '../scroll';

/** −1 : la bande traverse à contre-sens de la souris (brief) ; 1 : dans le même sens. */
const DIRECTION = -1;
const MAX_OPACITY = 0.3;
const SECTION = 2;
const SCALE = 0.5; // rendu en demi-résolution, le flou CSS masque la différence
const SPAWN_DISTANCE = 90; // px de mouvement horizontal cumulés pour lancer une bande
const MAX_BANDS = 2;
const COOLDOWN = 0.6; // s entre deux bandes : un geste = une bande

interface Band {
  x: number;
  v: number;
}

/**
 * Arc-en-ciel de la section « dates » : une bande spectrale fine traverse la page quand la souris
 * se déplace horizontalement. Canvas 2D en demi-résolution avec feedback (la frame précédente
 * s'efface lentement), ce qui laisse une traînée douce.
 */
export class Rainbow {
  private ctx: CanvasRenderingContext2D;
  private bands: Band[] = [];
  private lastX: number | null = null;
  private travel = 0;
  private vx = 0; // vitesse souris lissée, px/s
  private moveDx = 0;
  private visible = 0;
  private sinceSpawn = COOLDOWN;
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement, private reducedMotion: boolean) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      if (this.lastX !== null) this.moveDx += e.clientX - this.lastX;
      this.lastX = e.clientX;
    });
    addEventListener('pointerup', () => (this.lastX = null));
  }

  private resize() {
    this.w = this.canvas.width = Math.round(innerWidth * SCALE);
    this.h = this.canvas.height = Math.round(innerHeight * SCALE);
  }

  update(dt: number, position: number) {
    // Visible autour de S3 seulement (distance cyclique en sections).
    const d = Math.abs(modulo(position - SECTION + SECTION_COUNT / 2, SECTION_COUNT) - SECTION_COUNT / 2);
    const target = d < 0.3 ? 1 : d > 0.55 ? 0 : 1 - (d - 0.3) / 0.25;
    this.visible += (target - this.visible) * Math.min(1, dt * 6);
    this.canvas.style.opacity = (this.visible * MAX_OPACITY).toFixed(3);

    const dx = this.moveDx;
    this.moveDx = 0;
    this.vx += (dx / Math.max(dt, 1e-3) - this.vx) * Math.min(1, dt * 10);

    if (this.visible < 0.01) {
      if (this.bands.length) (this.bands = []), this.ctx.clearRect(0, 0, this.w, this.h);
      this.travel = 0;
      return;
    }

    if (this.reducedMotion) {
      // Une seule bande fixe, sans traînée.
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.drawBand(this.w * 0.68);
      return;
    }

    // Changement de sens : on repart de zéro pour que la bande suive le geste en cours.
    if (Math.sign(dx) !== Math.sign(this.travel) && dx !== 0) this.travel = 0;
    this.travel += dx;
    this.sinceSpawn += dt;
    if (Math.abs(this.travel) > SPAWN_DISTANCE && this.bands.length < MAX_BANDS && this.sinceSpawn > COOLDOWN) {
      this.sinceSpawn = 0;
      const dir = Math.sign(this.travel) * DIRECTION;
      const speed = (480 + Math.min(Math.abs(this.vx), 3000) * 0.22) * SCALE;
      this.bands.push({ x: dir > 0 ? -this.w * 0.05 : this.w * 1.05, v: dir * speed });
      this.travel = 0;
    }

    // Feedback : la frame précédente s'estompe (×0.78 par frame à 60 fps).
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${(1 - Math.pow(0.78, dt * 60)).toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';

    for (const b of this.bands) {
      // La souris continue d'entraîner légèrement la bande en vol.
      b.v += this.vx * DIRECTION * SCALE * dt * 0.12;
      const from = b.x;
      b.x += b.v * dt;
      // Sous-pas entre deux frames : traînée continue au lieu d'empreintes espacées.
      const steps = Math.max(1, Math.ceil(Math.abs(b.x - from) / (this.w * 0.006)));
      ctx.globalAlpha = Math.min(1, 2.5 / steps);
      for (let i = 1; i <= steps; i++) this.drawBand(from + ((b.x - from) * i) / steps);
      ctx.globalAlpha = 1;
    }
    this.bands = this.bands.filter((b) => b.x > -this.w * 0.1 && b.x < this.w * 1.1);
  }

  private drawBand(x: number) {
    const ctx = this.ctx;
    const bw = this.w * 0.03;
    const g = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    // Bords transparents : la traînée ne laisse pas de voile coloré derrière la bande.
    const hues = [0, 30, 55, 120, 195, 240];
    g.addColorStop(0, 'hsl(0 85% 60% / 0)');
    hues.forEach((hue, i) => g.addColorStop(0.15 + (0.7 * i) / (hues.length - 1), `hsl(${hue} 80% 62%)`));
    g.addColorStop(1, 'hsl(240 80% 62% / 0)');
    ctx.save();
    // Légère inclinaison : la bande ne lit pas comme un simple trait vertical.
    ctx.translate(x, this.h / 2);
    ctx.transform(1, 0, -0.08, 1, 0, 0);
    ctx.translate(-x, -this.h / 2);
    ctx.fillStyle = g;
    ctx.fillRect(x - bw / 2, -this.h * 0.1, bw, this.h * 1.2);
    ctx.restore();
  }
}
