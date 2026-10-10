import * as THREE from 'three';

export const MAX_IMPULSES = 8;

// Un jeu d'uniforms par modèle : tous ses matériaux partagent les mêmes vagues.
export type WaveUniforms = ReturnType<typeof createWaveUniforms>;
export const createWaveUniforms = () => ({
  uTime: { value: 0 },
  uImpulses: { value: Array.from({ length: MAX_IMPULSES }, () => new THREE.Vector4(0, 0, 0, -1e3)) },
  uAmps: { value: new Array<number>(MAX_IMPULSES).fill(0) },
  uAxis: { value: new THREE.Vector2() }, // axe vertical du bâtiment (x, z), espace objet
  uSpeed: { value: 14 }, // vitesse du front, unités/s
  uWavelength: { value: 7 },
  uWidth: { value: 6 }, // épaisseur du paquet d'ondes derrière le front
  uDecay: { value: 1.6 }, // amortissement exponentiel, 1/s
  uSignal: { value: new THREE.Color('#ff4a1c') },
  uPalette: { value: ['#17181a', '#3b3d40', '#7a7c7e', '#adaeac', '#d9d9d5'].map((c) => new THREE.Color(c)) },
  uKeepColor: { value: 0.12 },
});

/** Uniforms du bâtiment (et palette par défaut des matériaux sans vagues). */
export const waveUniforms = createWaveUniforms();

const waveFieldGLSL = /* glsl */ `
uniform float uTime;
uniform vec4 uImpulses[${MAX_IMPULSES}];
uniform float uAmps[${MAX_IMPULSES}];
uniform vec2 uAxis;
uniform float uSpeed;
uniform float uWavelength;
uniform float uWidth;
uniform float uDecay;

// Champ de déplacement continu dans l'espace objet. La direction ne dépend que de la position
// (et pas de la normale), donc deux pièces qui se touchent bougent ensemble, sans fissure.
vec3 zWaveField(vec3 p) {
  vec3 radial = vec3(p.x - uAxis.x, 0.0, p.z - uAxis.y);
  radial /= max(length(radial), 1e-3);
  vec3 sum = vec3(0.0);
  float k = 6.2831853 / uWavelength;
  for (int i = 0; i < ${MAX_IMPULSES}; i++) {
    float amp = uAmps[i];
    if (amp <= 0.0) continue;
    vec4 imp = uImpulses[i];
    float age = uTime - imp.w;
    if (age < 0.0) continue;
    vec3 fromO = p - imp.xyz;
    float d = length(fromO);
    float behind = uSpeed * age - d; // > 0 une fois que le front est passé
    float env = smoothstep(-1.5, 1.5, behind) * exp(-pow(max(behind, 0.0) / uWidth, 2.0));
    float h = amp * env * sin(k * behind) * exp(-uDecay * age) / (1.0 + d * 0.035);
    vec3 dir = normalize(mix(radial, fromO / max(d, 1e-3), 0.45));
    sum += dir * h;
  }
  return sum;
}
`;

const vertexDisplace = /* glsl */ `
#include <beginnormal_vertex>
vec3 zP = position + zWaveField(position);
{
  // Normales par différences finies sur le champ : la lumière ondule avec la surface.
  vec3 n = normalize(objectNormal);
  vec3 t = normalize(abs(n.y) < 0.95 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  float e = 0.35;
  vec3 pt = position + t * e; pt += zWaveField(pt);
  vec3 pb = position + b * e; pb += zWaveField(pb);
  vec3 nn = normalize(cross(pt - zP, pb - zP));
  objectNormal = dot(nn, n) < 0.0 ? -nn : nn;
}
`;

const fragmentPalette = /* glsl */ `
{
  // Rampe béton : la luminance est remappée sur la palette du site, un soupçon de couleur d'origine reste.
  float l = clamp(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)), 0.0, 1.0) * 4.0;
  vec3 ramp = l < 1.0 ? mix(uPalette[0], uPalette[1], l)
            : l < 2.0 ? mix(uPalette[1], uPalette[2], l - 1.0)
            : l < 3.0 ? mix(uPalette[2], uPalette[3], l - 2.0)
            : mix(uPalette[3], uPalette[4], min(l - 3.0, 1.0));
  gl_FragColor.rgb = mix(ramp, gl_FragColor.rgb, uKeepColor);
#ifdef Z_GLASS
  // Quelques fenêtres « interface » allumées en orange signal.
  vec3 cell = floor(vZObj * vec3(0.32, 0.27, 0.32));
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uSignal, step(0.955, h) * 0.75);
#endif
}
#include <fog_fragment>
`;

/** Taille des cellules « fenêtre » en espace objet, partagée par le shader et les panneaux UI. */
export const CELL = new THREE.Vector3(0.32, 0.27, 0.32);

export function patchMaterial(
  material: THREE.Material,
  { glass = false, displace = true, uniforms = waveUniforms }: { glass?: boolean; displace?: boolean; uniforms?: WaveUniforms } = {},
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${waveFieldGLSL}\nvarying vec3 vZObj;`);
    if (displace) {
      vs = vs
        .replace('#include <beginnormal_vertex>', vertexDisplace)
        .replace('#include <begin_vertex>', 'vec3 transformed = zP;');
    }
    // Position objet non déformée : les cellules allumées ne bougent pas avec la rotation ni les ondes.
    shader.vertexShader = vs.replace('#include <project_vertex>', '#include <project_vertex>\nvZObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uPalette[5];\nuniform float uKeepColor;\nuniform vec3 uSignal;\nvarying vec3 vZObj;`,
      )
      .replace('#include <fog_fragment>', fragmentPalette); // avant le brouillard : il se fond exactement dans le fond
    if (glass) shader.fragmentShader = '#define Z_GLASS\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => `zoe-${glass ? 'glass' : 'std'}-${displace ? 'wave' : 'flat'}`;
  material.needsUpdate = true;
}

/** Matériau d'ombre : même champ de vagues, pour que les ombres ondulent avec la surface. */
export function createWaveDepthMaterial(uniforms: WaveUniforms = waveUniforms) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${waveFieldGLSL}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + zWaveField(position);');
  };
  material.customProgramCacheKey = () => 'zoe-wave-depth';
  return material;
}
