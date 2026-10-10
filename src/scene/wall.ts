import * as THREE from 'three';
import { patchMaterial } from './waves';

/** Mur de béton nu de la section 3 (Poly Haven, CC0), remappé sur la palette comme le bâtiment. */
export function createWall(renderer: THREE.WebGLRenderer, size: THREE.Vector3) {
  const loader = new THREE.TextureLoader();
  const tex = (name: string, srgb = false) => {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/concrete/concrete_wall_008_${name}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2.2);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const material = new THREE.MeshStandardMaterial({
    map: tex('diff', true),
    normalMap: tex('nor_gl'),
    roughnessMap: tex('rough'),
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  patchMaterial(material, { displace: false });

  const w = size.x * 3.4, h = size.y * 2.2;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  // Loin à droite du bâtiment, face à la caméra : le travelling latéral de S2 à S3 y mène.
  wall.position.set(size.x * 3.2, size.y * 0.05, -size.z * 0.4);
  return wall;
}
