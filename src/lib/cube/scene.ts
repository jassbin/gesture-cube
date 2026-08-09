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
    transparent: true,
    opacity: 0.78,
  });
  return new THREE.Mesh(geo, mat);
}

export class CubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root: THREE.Group; // overall orientation
  private cubies: Cubie[] = [];
  private pickables: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
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
    this.camera.position.set(0, 0, 30);

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
              transparent: true,
              opacity: 0.42,
              depthWrite: false,
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
          const cubie: Cubie = { mesh: g, x, y, z };
          body.userData.cubie = cubie;
          this.cubies.push(cubie);
          this.pickables.push(body);
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

  /**
   * Real face-twist solving. Given a normalized start point (0..1, screen space
   * as the user sees it — origin top-left) and a normalized drag delta, ray-cast
   * to the touched face and derive which layer + direction to turn — exactly how
   * a real hand would grab a face and twist it.
   * Returns a Move (or null when the pick misses the cube or the drag is tiny).
   */
  solveTwistFromDrag(
    nx: number,
    ny: number,
    dxN: number,
    dyN: number,
  ): Move | null {
    if (Math.hypot(dxN, dyN) < 0.02) return null;
    // NDC (-1..1); y flipped
    const ndc = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    const cubie = hit.object.userData.cubie as Cubie | undefined;
    if (!cubie || !hit.face) return null;

    // world-space normal of the touched face
    const nWorld = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();

    // world-space drag vector from screen delta, along camera right/up
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const drag = right
      .multiplyScalar(dxN)
      .add(up.multiplyScalar(-dyN))
      .normalize();

    // rotation axis = face normal × drag, snapped to the nearest cube axis
    const rot = new THREE.Vector3().crossVectors(nWorld, drag);
    const axisInfo = this.snapAxis(rot);
    if (!axisInfo) return null;
    const { axis, sign: rotSign } = axisInfo;

    // layer coordinate along the rotation axis for the touched cubie
    const layer = axis === "x" ? cubie.x : axis === "y" ? cubie.y : cubie.z;

    return this.axisLayerToMove(axis, layer, rotSign);
  }

  // Twist using a face already chosen by pinch voting (axis+sign in the same
  // space snapAxis produces) plus a normalized screen drag. Mirrors the math in
  // solveTwistFromDrag but forces the grabbed face, so the layer that turns is
  // exactly the highlighted one.
  solveTwistFromFace(
    axis: "x" | "y" | "z",
    sign: number,
    dxN: number,
    dyN: number,
  ): Move | null {
    if (Math.hypot(dxN, dyN) < 0.02) return null;
    // The two world axes tangent to this face (perpendicular to its normal).
    const tangents: THREE.Vector3[] =
      axis === "x"
        ? [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
        : axis === "y"
          ? [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]
          : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
    // Camera basis so we can see how each tangent looks on screen.
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const drag2 = new THREE.Vector2(dxN, -dyN); // screen drag (y up)

    // Project each world tangent to screen and see how strongly the drag
    // follows it. The dominant tangent + drag sign gives a reliable direction
    // that flips correctly when you drag the other way.
    let bestAmt = 0;
    let bestTangent = tangents[0];
    let bestSign = 1;
    for (const tw of tangents) {
      const ts = new THREE.Vector2(tw.dot(right), tw.dot(up)).normalize();
      const amt = drag2.dot(ts); // signed projection of drag onto this tangent
      if (Math.abs(amt) > Math.abs(bestAmt)) {
        bestAmt = amt;
        bestTangent = tw;
        bestSign = Math.sign(amt) || 1;
      }
    }
    // rotation axis = faceNormal × tangent (a cube axis); its sign, combined
    // with the drag sign along that tangent, sets clockwise vs counter.
    const nWorld = new THREE.Vector3(
      axis === "x" ? sign : 0,
      axis === "y" ? sign : 0,
      axis === "z" ? sign : 0,
    );
    const rotAxis = new THREE.Vector3().crossVectors(nWorld, bestTangent);
    const rotSignRaw =
      axis === "x"
        ? rotAxis.x
        : axis === "y"
          ? rotAxis.y
          : rotAxis.z;
    const rotSign = (Math.sign(rotSignRaw) || 1) * bestSign;
    return this.axisLayerToMove(axis, sign, rotSign);
  }

  // Highlight the whole outer face the pinch is grabbing. We sample several
  // points along the thumb→index segment and vote: the face covered by the
  // most sample points wins. This fixes the "midpoint lands on an edge and
  // picks the wrong (perpendicular) face" problem — what matters is which
  // single face the two fingers together are touching.
  private hlBodies: THREE.Mesh[] = [];
  private hlTipBodies: THREE.Mesh[] = [];
  private hlKey: string | null = null;
  private faceHist: string[] = [];

  private voteFace(
    samples: { x: number; y: number; w: number }[],
  ): { axis: "x" | "y" | "z"; sign: number } | null {
    const tally = new Map<
      string,
      { axis: "x" | "y" | "z"; sign: number; n: number }
    >();
    for (const p of samples) {
      const ndc = new THREE.Vector2(p.x * 2 - 1, -(p.y * 2 - 1));
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
      if (!hit || !hit.face) continue;
      const nWorld = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      const face = this.snapAxis(nWorld);
      if (!face) continue;
      const key = `${face.axis}${face.sign}`;
      const cur = tally.get(key);
      if (cur) cur.n += p.w;
      else tally.set(key, { ...face, n: p.w });
    }
    let best: { axis: "x" | "y" | "z"; sign: number; n: number } | null = null;
    for (const v of tally.values()) if (!best || v.n > best.n) best = v;
    return best ? { axis: best.axis, sign: best.sign } : null;
  }

  private pinchSamples(
    thumbX: number,
    thumbY: number,
    indexX: number,
    indexY: number,
  ) {
    const pts: { x: number; y: number; w: number }[] = [];
    for (let t = 0.15; t <= 0.851; t += 0.1) {
      // triangular weighting: samples near the middle of the two fingers
      // count more, so an edge-straddling fingertip doesn't hijack the vote.
      const w = Math.max(0.15, 1 - Math.abs(t - 0.5) * 1.6);
      pts.push({
        x: thumbX + (indexX - thumbX) * t,
        y: thumbY + (indexY - thumbY) * t,
        w,
      });
    }
    return pts;
  }

  pickFaceAt(
    thumbX: number,
    thumbY: number,
    indexX: number,
    indexY: number,
    freeze = false,
  ): boolean {
    // When frozen (face locked), keep the current face and only refresh the
    // two touched cubes — no re-voting, so the locked face never jumps.
    if (freeze && this.hlKey) {
      this.refreshTips(thumbX, thumbY, indexX, indexY);
      return true;
    }
    const voted = this.voteFace(
      this.pinchSamples(thumbX, thumbY, indexX, indexY),
    );
    if (!voted) {
      this.clearFaceHighlight();
      this.faceHist = [];
      return false;
    }
    // (0) temporal majority vote over the last few frames so the highlighted
    // face doesn't flicker between two faces when the fingers sit near an edge.
    const votedKey = `${voted.axis}${voted.sign}`;
    this.faceHist.push(votedKey);
    if (this.faceHist.length > 6) this.faceHist.shift();
    const counts = new Map<string, number>();
    for (const k of this.faceHist) counts.set(k, (counts.get(k) ?? 0) + 1);
    let stableKey = this.hlKey ?? votedKey;
    let bestN = -1;
    for (const [k, n] of counts) {
      if (n > bestN) {
        bestN = n;
        stableKey = k;
      }
    }
    // only switch away from the current face when the new one is clearly ahead
    if (this.hlKey && stableKey !== this.hlKey) {
      const curN = counts.get(this.hlKey) ?? 0;
      if (bestN - curN < 2) stableKey = this.hlKey;
    }
    const axis = stableKey[0] as "x" | "y" | "z";
    const sign = stableKey.slice(1) === "-1" ? -1 : 1;
    const key = stableKey;

    // (1) whole-face soft highlight — rebuild only when the grabbed face changes
    if (key !== this.hlKey) {
      this.clearFaceBodies();
      const layerCubies = this.cubies.filter((c) => {
        const v = axis === "x" ? c.x : axis === "y" ? c.y : c.z;
        return v === sign;
      });
      for (const c of layerCubies) {
        const body = c.mesh.children.find(
          (o) => (o as THREE.Mesh).isMesh && o.userData.cubie,
        ) as THREE.Mesh | undefined;
        if (!body) continue;
        const m = body.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(0xffb020);
        m.emissiveIntensity = 0.45;
        this.hlBodies.push(body);
      }
      this.hlKey = key;
    }

    // (2) the two exact cubes each finger is touching — bright, every frame
    this.refreshTips(thumbX, thumbY, indexX, indexY);
    return true;
  }

  // Update the two bright "touched cube" markers under each fingertip.
  // `depth` (hand-size ratio) picks how deep along the ray we select: >1 keeps
  // the front (outer) cube, <1 pushes selection into inner cubes ("far=small").
  private refreshTips(
    thumbX: number,
    thumbY: number,
    indexX: number,
    indexY: number,
    depth = 1,
  ) {
    this.clearTipBodies();
    const tThumb = this.bodyAtDepth(thumbX, thumbY, depth);
    const tIndex = this.bodyAtDepth(indexX, indexY, depth);
    for (const body of [tThumb, tIndex]) {
      if (!body) continue;
      const m = body.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(0xffd54a);
      m.emissiveIntensity = 1.25;
      this.hlTipBodies.push(body);
    }
  }

  // FREE-preview: show ONLY the two touched cubes, no whole-face highlight.
  showTipsOnly(thumbX: number, thumbY: number, indexX: number, indexY: number) {
    this.clearFaceBodies(); // drop any face glow
    this.faceHist = [];
    this.refreshTips(thumbX, thumbY, indexX, indexY);
  }

  // the front-most cube body under a single screen point (0..1, mirrored)
  private bodyAt(nx: number, ny: number): THREE.Mesh | null {
    const ndc = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return (hit?.object as THREE.Mesh) ?? null;
  }

  grabbedFace(): { axis: "x" | "y" | "z"; sign: number } | null {
    if (!this.hlKey) return null;
    const axis = this.hlKey[0] as "x" | "y" | "z";
    const sign = this.hlKey.slice(1) === "-1" ? -1 : 1;
    return { axis, sign };
  }

  clearFaceHighlight() {
    this.clearTipBodies();
    this.clearFaceBodies();
  }

  private clearFaceBodies() {
    for (const body of this.hlBodies) {
      const m = body.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
    this.hlBodies = [];
    this.hlKey = null;
  }

  private clearTipBodies() {
    for (const body of this.hlTipBodies) {
      const m = body.material as THREE.MeshStandardMaterial;
      if (this.hlBodies.includes(body)) {
        // still part of the grabbed face → drop back to the soft face glow
        m.emissive.setHex(0xffb020);
        m.emissiveIntensity = 0.45;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
    this.hlTipBodies = [];
  }

  private snapAxis(
    v: THREE.Vector3,
  ): { axis: "x" | "y" | "z"; sign: number } | null {
    const ax = Math.abs(v.x);
    const ay = Math.abs(v.y);
    const az = Math.abs(v.z);
    const max = Math.max(ax, ay, az);
    if (max < 0.2) return null;
    if (max === ax) return { axis: "x", sign: Math.sign(v.x) || 1 };
    if (max === ay) return { axis: "y", sign: Math.sign(v.y) || 1 };
    return { axis: "z", sign: Math.sign(v.z) || 1 };
  }

  // Map (world rotation axis + layer coord + rotation sign) to a face Move.
  private axisLayerToMove(
    axis: "x" | "y" | "z",
    layer: number,
    rotSign: number,
  ): Move {
    // Find the face on the + or - side of this axis for the given layer.
    let face: Face;
    let faceSign: number;
    if (axis === "x") {
      face = layer >= 0 ? "R" : "L";
      faceSign = layer >= 0 ? 1 : -1;
    } else if (axis === "y") {
      face = layer >= 0 ? "U" : "D";
      faceSign = layer >= 0 ? 1 : -1;
    } else {
      face = layer >= 0 ? "F" : "B";
      faceSign = layer >= 0 ? 1 : -1;
    }
    // For a middle layer (layer === 0) default to the + face turn — still a
    // legal quarter turn of the outer layer nearest that face.
    if (layer === 0) {
      faceSign = 1;
      face = axis === "x" ? "R" : axis === "y" ? "U" : "F";
    }
    // cw of a face is a -90° turn about its + axis (matches scene.turn()).
    // Positive rotSign about +axis on the + face reads as counter-clockwise.
    const cw = rotSign * faceSign < 0;
    return { face, cw };
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
    this.camera.position.z = 30 - Math.abs(this.parallax.x + this.parallax.y) * 0.6;
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
