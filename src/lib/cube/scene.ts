"use client";

import * as THREE from "three";
import type { Face, Move } from "@/lib/cube/model";

const FACE_COLORS: Record<Face, number> = {
  U: 0xffffff, // white
  D: 0xffd700, // gold
  F: 0x00ff88, // green
  B: 0x1a4fff, // blue
  R: 0xff3b30, // red
  L: 0xff8c00, // orange
};
const PLASTIC = 0x0a1030;

type Cubie = {
  mesh: THREE.Group;
  // logical grid position -1,0,1 on each axis
  x: number;
  y: number;
  z: number;
};

const AXIS: Record<Face, { axis: "x" | "y" | "z"; sign: number }> = {
  R: { axis: "x", sign: 1 },
  L: { axis: "x", sign: -1 },
  U: { axis: "y", sign: 1 },
  D: { axis: "y", sign: -1 },
  F: { axis: "z", sign: 1 },
  B: { axis: "z", sign: -1 },
};

function makeSticker(color: number, size: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.1,
    emissive: new THREE.Color(color).multiplyScalar(0.06),
  });
  return new THREE.Mesh(geo, mat);
}

export class CubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root: THREE.Group; // overall orientation
  private cubies: Cubie[] = [];
  private raf = 0;
  private parallax = { x: 0, y: 0 };
  private targetParallax = { x: 0, y: 0 };
  private spin = { x: 0, y: 0 }; // gesture whole-cube spin
  private targetSpin = { x: 0, y: 0 };
  private animating = false;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 24);

    this.root = new THREE.Group();
    this.root.rotation.set(-0.5, 0.6, 0);
    this.scene.add(this.root);

    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(5, 8, 6);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0xff8c00, 0.4);
    rim.position.set(-6, -3, -4);
    this.scene.add(rim);

    this.buildCubies();
    this.resize();
    this.loop();
  }

  private buildCubies() {
    const gap = 0.06;
    const s = 0.95;
    const sticker = 0.82;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(s, s, s),
            new THREE.MeshStandardMaterial({
              color: PLASTIC,
              roughness: 0.6,
              metalness: 0.2,
            }),
          );
          g.add(body);
          const off = s / 2 + 0.001;
          // attach stickers on exposed faces
          if (x === 1) this.addSticker(g, FACE_COLORS.R, sticker, "x", off);
          if (x === -1) this.addSticker(g, FACE_COLORS.L, sticker, "x", -off);
          if (y === 1) this.addSticker(g, FACE_COLORS.U, sticker, "y", off);
          if (y === -1) this.addSticker(g, FACE_COLORS.D, sticker, "y", -off);
          if (z === 1) this.addSticker(g, FACE_COLORS.F, sticker, "z", off);
          if (z === -1) this.addSticker(g, FACE_COLORS.B, sticker, "z", -off);

          g.position.set(x * (s + gap), y * (s + gap), z * (s + gap));
          this.root.add(g);
          this.cubies.push({ mesh: g, x, y, z });
        }
      }
    }
  }

  private addSticker(
    g: THREE.Group,
    color: number,
    size: number,
    axis: "x" | "y" | "z",
    off: number,
  ) {
    const m = makeSticker(color, size);
    if (axis === "x") {
      m.position.x = off;
      m.rotation.y = off > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (axis === "y") {
      m.position.y = off;
      m.rotation.x = off > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      m.position.z = off;
      if (off < 0) m.rotation.y = Math.PI;
    }
    g.add(m);
  }

  setParallax(nx: number, ny: number) {
    // nx, ny in roughly [-1,1]. Stronger amplitude → more pronounced stereo.
    this.targetParallax.x = THREE.MathUtils.clamp(ny, -1, 1) * 0.7;
    this.targetParallax.y = THREE.MathUtils.clamp(nx, -1, 1) * 0.95;
  }

  // gesture whole-cube spin — incremental deltas
  addSpin(dx: number, dy: number) {
    this.targetSpin.y += dx;
    this.targetSpin.x += dy;
  }

  get isAnimating() {
    return this.animating;
  }

  // Animate a face turn, resolves after visual completes. Caller applies logic.
  turn(move: Move, onDone: () => void, duration = 260) {
    if (this.animating) return;
    this.animating = true;
    const { axis, sign } = AXIS[move.face];
    // select cubies in that layer
    const layer = this.cubies.filter((c) => {
      const v = axis === "x" ? c.x : axis === "y" ? c.y : c.z;
      return v === sign;
    });
    const pivot = new THREE.Group();
    this.root.add(pivot);
    layer.forEach((c) => pivot.attach(c.mesh));

    // rotation direction: cw as seen from + side of that axis
    const dirSign = move.cw ? -1 : 1;
    const total = (Math.PI / 2) * dirSign * sign;
    const start = performance.now();

    const step = () => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const angle = total * e;
      pivot.rotation.set(0, 0, 0);
      if (axis === "x") pivot.rotation.x = angle;
      else if (axis === "y") pivot.rotation.y = angle;
      else pivot.rotation.z = angle;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // bake rotation back into cubies
        layer.forEach((c) => this.root.attach(c.mesh));
        this.root.remove(pivot);
        this.updateLogicalPositions(layer, axis, dirSign * sign);
        this.animating = false;
        onDone();
      }
    };
    requestAnimationFrame(step);
  }

  private updateLogicalPositions(
    layer: Cubie[],
    axis: "x" | "y" | "z",
    dir: number,
  ) {
    // rotate grid coords 90deg around axis. dir=+1 => (a,b)->(-b,a)
    layer.forEach((c) => {
      let a: "x" | "y" | "z", b: "x" | "y" | "z";
      if (axis === "x") {
        a = "y";
        b = "z";
      } else if (axis === "y") {
        a = "z";
        b = "x";
      } else {
        a = "x";
        b = "y";
      }
      const av = c[a];
      const bv = c[b];
      if (dir > 0) {
        c[a] = -bv;
        c[b] = av;
      } else {
        c[a] = bv;
        c[b] = -av;
      }
    });
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    // smooth parallax + spin
    this.parallax.x += (this.targetParallax.x - this.parallax.x) * 0.08;
    this.parallax.y += (this.targetParallax.y - this.parallax.y) * 0.08;
    this.spin.x += (this.targetSpin.x - this.spin.x) * 0.15;
    this.spin.y += (this.targetSpin.y - this.spin.y) * 0.15;

    this.root.rotation.x = -0.5 + this.parallax.x + this.spin.x;
    this.root.rotation.y = 0.6 + this.parallax.y + this.spin.y;
    // Stronger camera parallax = a much more convincing stereo/depth illusion:
    // the camera physically orbits the fixed cube instead of only rotating it.
    this.camera.position.x = this.parallax.y * 3.2;
    this.camera.position.y = -this.parallax.x * 3.2;
    this.camera.position.z = 24 - Math.abs(this.parallax.x + this.parallax.y) * 0.6;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
