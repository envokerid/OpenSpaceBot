import * as THREE from 'three';
import { orbColor, orbPose, orbShadow, type OrbPose } from './orb-mascot.ts';
import { mascotEyeColor, type MascotState } from './mascot-appearance.ts';

export interface OrbSceneOptions {
  color: string; state: MascotState; animated?: boolean;
  gaze?: { x?: number; y?: number }; turn?: number;
  blinkAt?: number; spin?: { start: number; duration: number };
}

/** Procedural geometry only: no downloads, textures, DOM, or model loaders. */
export function createOrbScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.42, 1.42, 1.42, -1.42, .1, 20);
  camera.position.z = 6;
  const root = new THREE.Group();
  scene.add(root);
  root.name = 'floating-orb';
  // A soft procedural contact shadow is cheaper and more reliable on mobile
  // than a shadow map. It stays on the ground as the body rises above it.
  const shadowGeometry = new THREE.PlaneGeometry(2.05, .42);
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { opacity: { value: .28 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float opacity;
      void main() { float r = length((vUv - 0.5) * 2.0);
        float soft = exp(-3.5 * r * r) * (1.0 - smoothstep(0.65, 1.0, r));
        gl_FragColor = vec4(0.035, 0.045, 0.075, soft * opacity);
        #include <colorspace_fragment>
      }`,
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.name = 'ground-shadow';
  shadow.position.set(0, -1.09, -1.3);
  scene.add(shadow);
  const dotGeometry = new THREE.SphereGeometry(.04, 10, 8);
  const dots = Array.from({ length: 3 }, () => {
    const dot = new THREE.Mesh(dotGeometry, new THREE.MeshBasicMaterial({ color: '#bce8ff', transparent: true, opacity: .6, depthWrite: false }));
    dot.visible = false; scene.add(dot); return dot;
  });
  const geometry = new THREE.SphereGeometry(1, 40, 28);
  const body = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(orbColor('blue')) } },
    vertexShader: `varying vec3 vNormal;
      void main() { vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 tint; varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = pow(1.0 - max(n.z, 0.0), 2.2);
        float light = max(dot(n, normalize(vec3(-0.45, 0.8, 1.5))), 0.0);
        float sheen = pow(max(dot(n, normalize(vec3(-0.5, 0.9, 0.7))), 0.0), 28.0);
        vec3 color = tint * (0.7 + light * 0.42);
        color = mix(color, vec3(0.70, 0.86, 1.0), rim * 0.52);
        color += vec3(0.25) * sheen;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  root.add(new THREE.Mesh(geometry, body));
  const halo = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, strength: { value: .55 } },
    transparent: true, depthWrite: false, side: THREE.BackSide,
    vertexShader: `varying vec3 vNormal;
      void main() { vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 tint; uniform float strength; varying vec3 vNormal;
      void main() { float edge = pow(1.0 - abs(normalize(vNormal).z), 3.0);
        gl_FragColor = vec4(mix(tint, vec3(0.65, 0.82, 1.0), 0.5), edge * strength * 0.38);
        #include <colorspace_fragment>
      }`,
  });
  const shell = new THREE.Mesh(geometry, halo);
  shell.scale.setScalar(1.095);
  root.add(shell);
  const face = new THREE.Group();
  root.add(face);
  const eyeGeometry = new THREE.CapsuleGeometry(.095, .20, 5, 12);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#f5ffff', toneMapped: false });
  const arcPoints = Array.from({ length: 17 }, (_, i) => {
    const angle = Math.PI * i / 16;
    return new THREE.Vector3(-Math.cos(angle) * .105, Math.sin(angle) * .075, 0);
  });
  const arcGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints), 16, .037, 7, false);
  const eyes = [-1, 1].map(side => {
    const group = new THREE.Group();
    group.position.set(side * .255, .18, .967);
    const capsule = new THREE.Mesh(eyeGeometry, eyeMaterial);
    const smile = new THREE.Mesh(arcGeometry, eyeMaterial);
    group.add(capsule, smile);
    face.add(group);
    return { group, capsule, smile };
  });
  let current: OrbPose | undefined;
  let last = 0;
  let disposed = false;
  return {
    scene, camera,
    update(options: OrbSceneOptions, seconds: number) {
      const target = orbPose(options.state, seconds, options.animated !== false);
      // Exponential smoothing softens state changes without allocating geometry.
      const blend = options.animated === false ? 1 : 1 - Math.exp(-Math.min(.1, Math.max(0, seconds - last)) * 12);
      last = seconds;
      if (!current) current = { ...target };
      for (const key of Object.keys(target) as (keyof OrbPose)[]) current[key] += (target[key] - current[key]) * blend;
      const p = current;
      root.position.set(p.x, .16 + p.y, 0);
      const ground = orbShadow(p.y);
      shadow.position.x = p.x * .4;
      shadow.scale.set(ground.scale, ground.scale, 1);
      shadowMaterial.uniforms.opacity.value = ground.opacity;
      dots.forEach((dot, i) => {
        const typing = options.state === 'writing';
        const waiting = options.state === 'orbit';
        dot.visible = typing || waiting;
        const phase = options.animated === false ? 0 : seconds * Math.PI * 2 / (typing ? .85 : 3.2);
        const pulse = (Math.sin(phase - i * .9) + 1) / 2;
        if (typing) dot.position.set((i - 1) * .16, -.88 + pulse * .035, .2);
        else dot.position.set(Math.sin(phase + i * Math.PI * 2 / 3) * 1.05, -.18 + Math.cos(phase + i * Math.PI * 2 / 3) * .25, -.2);
        dot.material.opacity = .3 + pulse * .6;
        dot.scale.setScalar(.8 + pulse * .35);
      });
      const spinProgress = options.spin && options.animated !== false ? Math.min(1, Math.max(0, (seconds - options.spin.start) / options.spin.duration)) : 0;
      const spin = Math.PI * 2 * (1 - Math.pow(1 - spinProgress, 3));
      root.rotation.set(0, p.yaw + (options.turn ?? 0) * Math.PI / 180 + spin, p.tilt);
      root.scale.set(p.scaleX * .86, p.scaleY * .86, .86);
      face.position.set(p.eyeX + Math.max(-1, Math.min(1, options.gaze?.x ?? 0)) * .10, p.eyeY - Math.max(-1, Math.min(1, options.gaze?.y ?? 0)) * .08, 0);
      const blinkElapsed = seconds - (options.blinkAt ?? -Infinity);
      const blink = options.animated !== false && blinkElapsed >= 0 && blinkElapsed < .2 ? Math.max(.06, Math.abs(blinkElapsed - .1) / .1) : 1;
      eyes.forEach((eye, i) => {
        eye.group.scale.y = (i === 0 ? p.eyeLeft : p.eyeRight) * blink;
        eye.group.rotation.z = p.eyeTilt * (i === 0 ? -1 : 1);
        eye.capsule.visible = p.smile < .5;
        eye.smile.visible = p.smile >= .5;
      });
      body.uniforms.tint.value.set(orbColor(options.color));
      eyeMaterial.color.set(mascotEyeColor(options.color));
      halo.uniforms.tint.value.copy(body.uniforms.tint.value);
      halo.uniforms.strength.value = p.glow;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shadowGeometry.dispose(); shadowMaterial.dispose(); dotGeometry.dispose();
      dots.forEach(dot => dot.material.dispose());
      geometry.dispose(); eyeGeometry.dispose(); arcGeometry.dispose();
      body.dispose(); halo.dispose(); eyeMaterial.dispose(); scene.clear();
    },
  };
}
