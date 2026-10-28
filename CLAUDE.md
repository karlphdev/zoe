# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Site one-page du groupe post-punk Zoé : un bâtiment brutaliste 3D (Three.js) qui ondule sous le curseur, filmé par une caméra pilotée par un scroll infini. Vite + TypeScript strict, pas de framework, pas de tests ni de linter. Le texte du site est en français.

## Commandes

- `npm run dev` : serveur Vite (le site est servi sous `/zoe/`, voir `base` dans `vite.config.ts`)
- `npm run build` : `tsc --noEmit` puis `vite build`. Le typecheck fait office de lint.
- `npm run models` : régénère `public/models/*.glb` depuis `public/models/source/` (`optimize-models.mjs`, puis `build-bust.mjs`). Option `--report` sur le premier pour les stats seules.
- Paramètres d'URL de débogage : `?s=2` ouvre sur la section 2, `?debug` affiche Stats, `?wire` passe en fil de fer.

Déploiement : branche `gh-pages` (en ligne sur karlphdev.github.io/zoe). `dist/` et `public/models/source/` (≈ 170 Mo de modèles bruts) sont ignorés par git, comme les `*.zip` d'origine ; le build supprime `dist/models/source`.

## Architecture

`src/main.ts` orchestre tout : renderer, lumières, chargement des modèles, puis une unique boucle `setAnimationLoop` qui appelle `update` sur chaque module. Sans WebGL2, ou si le chargement échoue, `fallback()` bascule sur `fallback.webp` (classe `no-gl`) et le texte reste accessible.

- **Scroll infini** (`scroll.ts`) : Lenis en mode `infinite`, la piste HTML (`.track`) fait `SECTION_COUNT` sections + un écran. `position` est une valeur continue en « sections », non bornée ; tout le visuel en dérive, donc le rebouclage est invisible. `index` en est la version modulo, et `goTo(i)` avance toujours dans le sens du scroll.
- **Caméra** (`scene/cameraPath.ts`) : une prise (`Shot`) par section, interpolation Catmull-Rom en boucle fermée. `main.ts#frame()` recalcule les prises à chaque resize à partir de la taille du bâtiment ; les autres modules (`panels.place`, `bust.place`) s'accrochent à ces prises.
- **Vagues** (`scene/waves.ts`, `scene/building.ts`) : le relief ne vient pas de la géométrie animée côté CPU. `patchMaterial` injecte un champ de déplacement GLSL dans les matériaux standard, alimenté par un ring buffer de `MAX_IMPULSES` impulsions (uniforms partagés par modèle). Le champ ne dépend que de la position, jamais de la normale, pour que deux pièces contiguës bougent ensemble sans fissure. Le curseur est converti en impulsion par raycast `three-mesh-bvh` sur un proxy (`Walls`, `Balconies`) ; `Spring` (`scene/spring.ts`) donne l'inertie.
- **Autres scènes** : `bust.ts` (buste en marbre de la section contact, même système de vagues), `wall.ts` (mur de la section 3).
- **DOM** : `ui/` (rails de navigation, fenêtres-interface `panels` accrochées à de vraies fenêtres du modèle, curseur) et `fx/` (canvas arc-en-ciel, grain). Le contenu textuel est dans `content.ts` (actuellement factice, marqué `TODO_CONTENT`) ; il contient aussi les crédits du modèle (CC BY-NC) à conserver.
- **Mode léger** (`device.ts`) : `device.lite` (tactile ou < 768 px) charge `tricorner-lite.glb`, plafonne le pixel ratio à 1.5 et désactive les ombres. `prefers-reduced-motion` coupe les ondes et la parallaxe.

## Pipeline des modèles

Les `.glb` de `public/models/` sont des artefacts générés, ne pas les éditer à la main. `scripts/optimize-models.mjs` simplifie les meshes denses (ratios dans `SIMPLIFY`), subdivise les grandes surfaces pour porter les vagues (`tessellate.mjs`, subdivision conforme par position, étanche aux coutures UV) et compresse en Draco ; `LITE_KEEP` définit les meshes du modèle léger. `build-bust.mjs` met le buste à la hauteur du bâtiment (30 unités) pour que les paramètres de vagues restent valables. Les noms de meshes (`Walls`, `Balconies`, …) sont une dépendance entre scripts et `main.ts`.
