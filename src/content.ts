// TODO_CONTENT : contenu factice en attendant les vraies infos du groupe.

export const sections = [
  { id: 'batiment', nav: null, lines: ['post-punk', 'béton et larsen', 'Lyon'] },
  { id: 'ecouter', nav: 'écouter', lines: ['Dalle, EP, 2026', 'Fréquence morte, LP, 2024', 'Live au Sonic, 2023'] },
  { id: 'dates', nav: 'dates', lines: ['14.11 Lyon, Le Sonic', '22.11 Paris, Supersonic', '06.12 Bruxelles, Magasin 4'] },
  { id: 'contact', nav: 'contact', lines: ['contact@zoe-band.fr', 'instagram @zoe.band'] },
] as const;

/** Fenêtres-interface de la section « écouter », accrochées à de vraies fenêtres du bâtiment. */
export const panels = [
  { title: 'Dalle', meta: 'EP 2026', link: 'écouter', tint: 1, w: 168, h: 112, slot: [0.6, 0.2] },
  { title: 'Fréquence morte', meta: 'LP 2024', link: 'écouter', tint: 0.3, w: 132, h: 150, slot: [0.2, 0.3] },
  { title: 'Live au Sonic', meta: '2023', link: 'voir', tint: 0.3, w: 150, h: 96, slot: [0.42, 0.6] },
  { title: 'Bandcamp', meta: '', link: 'ouvrir', tint: 0, w: 104, h: 72, slot: [0.76, 0.66] },
  { title: 'Spotify', meta: '', link: 'ouvrir', tint: 0, w: 96, h: 88, slot: [0.24, 0.76] },
] as const;

export const credits = {
  model: {
    title: 'Building Brutalist TriCorner',
    author: 'Nicolai Kilstrup',
    url: 'https://skfb.ly/oUGKK',
    license: 'CC BY-NC 4.0',
    licenseUrl: 'http://creativecommons.org/licenses/by-nc/4.0/',
  },
  texture: 'Concrete Wall 008 et Marble Bust 01, Poly Haven, CC0',
  fonts: 'Archivo, IBM Plex Mono, SIL OFL',
};
