import { credits, sections } from '../content';

/** Rails de texte vertical : gauche = nom + navigation, droite = contenu de la section active. */
export class Rails {
  private blocks: HTMLElement[] = [];
  private navLinks: HTMLElement[] = [];
  private active = -1;
  private marker = document.querySelector<HTMLElement>('.rail-marker')!;

  constructor(onNavigate: (index: number) => void) {
    const left = document.querySelector<HTMLElement>('.rail--left')!;
    const right = document.querySelector<HTMLElement>('.rail--right')!;

    const nav = left.querySelector<HTMLElement>('.rail__nav')!;
    sections.forEach((s, i) => {
      if (!s.nav) return;
      const a = document.createElement('a');
      a.href = `#${s.id}`;
      a.textContent = s.nav;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        onNavigate(i);
      });
      nav.appendChild(a);
      this.navLinks[i] = a;
    });
    left.querySelector<HTMLElement>('.rail__brand')!.addEventListener('click', (e) => {
      e.preventDefault();
      onNavigate(0);
    });

    sections.forEach((s, i) => {
      const block = document.createElement('div');
      block.className = 'rail__block';
      block.id = s.id;
      const lines: string[] = s.lines.map((l) => `<span>${l}</span>`);
      if (s.id === 'contact') {
        const m = credits.model;
        lines.push(
          `<span class="rail__credit">« ${m.title} » par ${m.author}, <a href="${m.url}" target="_blank" rel="noopener">Sketchfab</a>, <a href="${m.licenseUrl}" target="_blank" rel="noopener">${m.license}</a></span>`,
          `<span class="rail__credit">${credits.texture}. ${credits.fonts}</span>`,
        );
      }
      block.innerHTML = lines.join('');
      right.appendChild(block);
      this.blocks[i] = block;
    });
  }

  setActive(index: number) {
    if (index === this.active) return;
    this.blocks[this.active]?.classList.remove('is-active');
    this.navLinks[this.active]?.classList.remove('is-active');
    this.blocks[index].classList.add('is-active');
    this.navLinks[index]?.classList.add('is-active');
    this.active = index;
    this.placeMarker();
  }

  placeMarker() {
    const link = this.navLinks[this.active];
    this.marker.style.opacity = link ? '1' : '0';
    if (!link) return;
    const r = link.getBoundingClientRect();
    this.marker.style.height = `${r.height}px`;
    this.marker.style.transform = `translate(${r.right + 5}px, ${r.top}px)`;
  }
}
