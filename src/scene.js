// The 3D world: a mango tree, a swing, rolling hills, and a sun that sets as you climb.

import * as THREE from 'three';

// Everything is modelled for a 4 m rope, then scaled up for longer ropes.
const BASE_ROPE = 4;
const PIVOT_Y = 4.6;

// Colours at three moments: midday, late afternoon, sunset.
const STOPS = {
    skyTop:   [0x3f8fe6, 0x5b9fe3, 0x36408f],
    skyLow:   [0xcfe9ff, 0xffe2b3, 0xff9558],
    sun:      [0xfffbe8, 0xffdf9e, 0xff7f38],
    hemiSky:  [0xbfdcff, 0xffe6c4, 0xffb48a],
    hemiLand: [0x587a3c, 0x66703c, 0x6a4f3c],
    cloud:    [0xffffff, 0xfff1dc, 0xffb99a],
    fill:     [0xfff4e0, 0xffe2b8, 0xffb07a],
};
const SUN_HEIGHT = [52, 30, 8];      // degrees above the horizon
const SUN_POWER = [3.1, 2.9, 2.4];
const HEMI_POWER = [1.2, 1.15, 1.05];
const FILL_POWER = [0.9, 1.2, 1.5];   // soft light from the camera side, so nothing goes black

const three = (arr, t) => (t < 0.5
    ? arr[0] + (arr[1] - arr[0]) * t * 2
    : arr[1] + (arr[2] - arr[1]) * (t * 2 - 1));
const stopColours = Object.fromEntries(
    Object.entries(STOPS).map(([k, v]) => [k, v.map((hex) => new THREE.Color(hex))]));
function colourAt(name, t, out) {
    const c = stopColours[name];
    return t < 0.5 ? out.lerpColors(c[0], c[1], t * 2) : out.lerpColors(c[1], c[2], t * 2 - 1);
}

const matte = (colour, extra = {}) =>
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, metalness: 0, ...extra });

export class Scene {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xcfe9ff, 20, 120);
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000);

        this.glow = 0;      // eased 0 (day) .. 1 (sunset)
        this.sway = 0;      // eased camera sway
        this.time = 0;
        this.k = 1;         // world scale: rope length / 4
        this.length = 0;
        this.leaves = [];
        this.tmp = new THREE.Color();

        this.buildLights();
        this.buildSky();
        this.buildLand();
        this.buildTree();
        this.buildSwing();
        this.buildGoal();
        this.setLength(BASE_ROPE);

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    // ---------- building blocks ----------

    buildLights() {
        this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x587a3c, 1.1);
        this.scene.add(this.hemi);
        this.sunLight = new THREE.DirectionalLight(0xfffbe8, 3);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.bias = -0.0004;
        this.scene.add(this.sunLight, this.sunLight.target);
        // The sun sits behind the scene, so a second soft light fills in the front.
        this.fill = new THREE.DirectionalLight(0xfff4e0, 1);
        this.fill.position.set(3, 4, 10);
        this.scene.add(this.fill);
    }

    buildSky() {
        // Scenery that scales with the rope lives in `stage`.
        this.stage = new THREE.Group();
        this.scene.add(this.stage);

        this.skyUniforms = {
            top: { value: new THREE.Color(0x3f8fe6) },
            low: { value: new THREE.Color(0xcfe9ff) },
        };
        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(500, 32, 16),
            new THREE.ShaderMaterial({
                uniforms: this.skyUniforms,
                side: THREE.BackSide,
                depthWrite: false,
                fog: false,
                vertexShader: `
                    varying float vY;
                    void main() {
                        vY = normalize(position).y;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }`,
                fragmentShader: `
                    uniform vec3 top;
                    uniform vec3 low;
                    varying float vY;
                    void main() {
                        float t = smoothstep(-0.02, 0.55, vY);
                        gl_FragColor = vec4(mix(low, top, t), 1.0);
                        #include <colorspace_fragment>
                    }`,
            }));
        this.stage.add(sky);

        this.sunDisc = new THREE.Mesh(
            new THREE.SphereGeometry(14, 24, 16),
            new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false }));
        this.sunHalo = new THREE.Mesh(
            new THREE.SphereGeometry(34, 24, 16),
            new THREE.MeshBasicMaterial({
                color: 0xfffbe8, fog: false, transparent: true, opacity: 0.22,
                blending: THREE.AdditiveBlending, depthWrite: false,
            }));
        this.stage.add(this.sunDisc, this.sunHalo);

        // Clouds: a few soft clumps that drift.
        this.clouds = [];
        const cloudMat = (this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
        const puff = new THREE.IcosahedronGeometry(1, 2);
        const spots = [[-16, 12, -30, 1.5], [6, 14.5, -38, 2], [22, 11, -28, 1.3], [-34, 15, -44, 2.2], [38, 16, -46, 1.9]];
        for (const [x, y, z, size] of spots) {
            const cloud = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const m = new THREE.Mesh(puff, cloudMat);
                m.position.set((i - 2) * 1.2 * size, (i % 2) * 0.35 * size, (i % 3 - 1) * 0.5);
                m.scale.set(1.5 * size, (0.75 - Math.abs(i - 2) * 0.12) * size, size);
                cloud.add(m);
            }
            cloud.position.set(x, y, z);
            this.stage.add(cloud);
            this.clouds.push(cloud);
        }
    }

    buildLand() {
        const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), matte(0x6fae4f));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.stage.add(ground);

        // Distant hills: wide, low domes in fading greens.
        const dome = new THREE.SphereGeometry(1, 24, 12);
        const hills = [
            [-22, -26, 20, 4.5, 0x78b35a], [10, -34, 26, 6, 0x6ca856], [34, -30, 18, 4, 0x7cb862],
            [-46, -44, 30, 8, 0x669f58], [58, -52, 34, 9, 0x62995a], [0, -62, 44, 10, 0x5e9460],
        ];
        for (const [x, z, wide, tall, colour] of hills) {
            const hill = new THREE.Mesh(dome, matte(colour));
            hill.position.set(x, -0.4, z);
            hill.scale.set(wide, tall, wide * 0.7);
            this.stage.add(hill);
        }

        // Grass tufts and flowers near the tree.
        const rand = mulberry(7);
        const spot = () => {
            const r = 1.5 + rand() * 13, a = rand() * Math.PI * 2;
            return [Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.8 - 1];
        };
        const dummy = new THREE.Object3D();
        const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.22, 5), matte(0x62a84a), 300);
        for (let i = 0; i < tufts.count; i++) {
            const [x, z] = spot();
            dummy.position.set(x, 0.1, z);
            dummy.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
            dummy.scale.setScalar(0.7 + rand() * 0.9);
            dummy.updateMatrix();
            tufts.setMatrixAt(i, dummy.matrix);
        }
        this.stage.add(tufts);
        for (const colour of [0xfff2a8, 0xff9fb2, 0xffffff]) {
            const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 5), matte(colour), 40);
            for (let i = 0; i < flowers.count; i++) {
                const [x, z] = spot();
                dummy.position.set(x, 0.12 + rand() * 0.08, z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.setScalar(1);
                dummy.updateMatrix();
                flowers.setMatrixAt(i, dummy.matrix);
            }
            this.stage.add(flowers);
        }

        // A few small bushes and far trees for depth.
        const bushMat = matte(0x3f8a47, { flatShading: true });
        const blob = new THREE.IcosahedronGeometry(1, 1);
        for (const [x, z, s] of [[4.6, -3.5, 0.7], [5.5, -3, 0.5], [-6.5, -5, 0.9], [8, -9, 1.1], [-10, -12, 1.3], [2, -14, 1]]) {
            const bush = new THREE.Mesh(blob, bushMat);
            bush.position.set(x, s * 0.55, z);
            bush.scale.set(s * 1.3, s * 0.8, s);
            bush.castShadow = true;
            this.stage.add(bush);
        }
        for (const [x, z, s] of [[14, -18, 1], [-18, -20, 1.2], [20, -24, 0.9], [-9, -26, 1.1]]) {
            const far = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.2, 7), matte(0x6b4a2f));
            trunk.position.y = 1.1;
            const top = new THREE.Mesh(blob, bushMat);
            top.position.y = 3;
            top.scale.set(1.6, 1.4, 1.6);
            far.add(trunk, top);
            far.position.set(x, 0, z);
            far.scale.setScalar(s);
            this.stage.add(far);
        }
    }

    buildTree() {
        const tree = new THREE.Group();
        const bark = matte(0x5d4630, { flatShading: true });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.52, 5.8, 9), bark);
        trunk.position.set(-3.1, 2.9, 0);
        const root = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 9), bark);
        root.position.set(-3.1, 0.4, 0);
        // The branch the swing hangs from.
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 4.4, 8), bark);
        branch.position.set(-1.0, PIVOT_Y + 0.12, 0);
        branch.rotation.z = Math.PI / 2 + 0.035;
        const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 2.6, 7), bark);
        bough.position.set(-4.0, 5.4, -0.3);
        bough.rotation.z = -0.9;
        tree.add(trunk, root, branch, bough);

        const leafMats = [0x2f8f46, 0x3a9c4c, 0x267a3d].map((c) => matte(c, { flatShading: true }));
        const blob = new THREE.IcosahedronGeometry(1, 1);
        const canopy = [
            [-3.1, 6.6, 0, 1.9], [-1.7, 6.2, 0.5, 1.45], [-0.5, 5.85, -0.35, 1.15], [0.55, 5.6, 0.2, 0.9],
            [-4.5, 6.1, -0.2, 1.4], [-2.6, 7.5, -0.5, 1.35], [-3.5, 6.0, 1.0, 1.2], [-1.9, 6.4, -1.0, 1.2],
            [-5.2, 5.4, 0.5, 0.95],
        ];
        canopy.forEach(([x, y, z, r], i) => {
            const m = new THREE.Mesh(blob, leafMats[i % 3]);
            m.position.set(x, y, z);
            m.scale.set(r, r * 0.85, r);
            m.rotation.set(i, i * 2, 0);
            m.castShadow = true;
            tree.add(m);
        });
        // Mangoes.
        const mango = new THREE.SphereGeometry(0.11, 8, 6);
        const mangoMat = matte(0xffa62b, { roughness: 0.6 });
        for (const [x, y, z] of [[-2.2, 5.1, 0.9], [-0.9, 4.95, 0.35], [-3.9, 5.0, 0.7], [-1.5, 5.05, -0.6], [0.2, 4.9, 0.5], [-4.6, 4.75, 0.2]]) {
            const m = new THREE.Mesh(mango, mangoMat);
            m.position.set(x, y, z);
            m.scale.y = 1.3;
            tree.add(m);
        }
        for (const part of [trunk, root, branch, bough]) part.castShadow = true;
        this.stage.add(tree);
    }

    buildSwing() {
        // `pivot` turns with the swing. Ropes and seat hang below it.
        this.pivot = new THREE.Group();
        this.scene.add(this.pivot);

        const ropeMat = matte(0xe8dcc0);
        const ropeGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
        this.ropes = [-1, 1].map((side) => {
            const rope = new THREE.Mesh(ropeGeo, ropeMat);
            rope.castShadow = true;
            rope.userData.side = side;
            this.pivot.add(rope);
            return rope;
        });

        // Seat and child, built at real size around the seat, then scaled a little
        // on long ropes so they stay visible.
        this.rider = new THREE.Group();
        this.pivot.add(this.rider);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.62), matte(0x8a5a30));
        const shirt = matte(0xe2483d), skin = matte(0x7a4a32), shorts = matte(0x2f3f73), hair = matte(0x231815);
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 4, 10), shirt);
        torso.position.set(-0.02, 0.3, 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), skin);
        head.position.set(0, 0.68, 0);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
        cap.position.set(-0.01, 0.69, 0);
        this.rider.add(seat, torso, head, cap);
        for (const side of [-1, 1]) {
            const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), shorts);
            thigh.rotation.z = Math.PI / 2;
            thigh.position.set(0.14, 0.08, side * 0.09);
            const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 4, 8), skin);
            shin.position.set(0.3, -0.1, side * 0.09);
            shin.rotation.z = 0.25;
            const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 8), skin);
            arm.position.set(0.02, 0.42, side * 0.2);
            arm.rotation.x = side * -0.55;
            this.rider.add(thigh, shin, arm);
            this.legs = this.legs || [];
            this.legs.push(shin);
        }
        this.rider.traverse((o) => { if (o.isMesh) o.castShadow = true; });

        // A grown-up watching from beside the tree, for scale.
        this.adult = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.95, 4, 10), matte(0x2e7d6b));
        body.position.y = 0.95;
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin);
        face.position.y = 1.72;
        const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), matte(0xf2b632));
        wrap.position.y = 1.74;
        this.adult.add(body, face, wrap);
        this.adult.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(this.adult);
    }

    buildGoal() {
        this.goalMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.goalBalls = [-1, 1].map(() => {
            const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.goalMat);
            this.scene.add(ball);
            return ball;
        });
        this.arc = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, dashSize: 0.2, gapSize: 0.2 }));
        this.scene.add(this.arc);
        this.goal = 0;
    }

    // ---------- sizing ----------

    setLength(length, goal = this.goal) {
        this.length = length;
        this.goal = goal;
        const k = (this.k = length / BASE_ROPE);
        const big = Math.pow(k, 0.7); // people grow a little so they stay visible
        this.stage.scale.setScalar(k);

        const py = PIVOT_Y * k;
        this.pivot.position.set(0, py, 0);
        for (const rope of this.ropes) {
            rope.scale.set(0.014 * big, length, 0.014 * big);
            rope.position.set(0, -length / 2, rope.userData.side * 0.27 * big);
        }
        this.rider.position.set(0, -length, 0);
        this.rider.scale.setScalar(big);
        this.adult.position.set(3.6 * k, 0, -1.8 * k);
        this.adult.scale.setScalar(big);
        

        // Goal marks and the dotted path between them.
        const points = [];
        for (let i = 0; i <= 48; i++) {
            const a = -goal + (2 * goal * i) / 48;
            points.push(new THREE.Vector3(Math.sin(a) * length, py - Math.cos(a) * length, 0));
        }
        this.arc.geometry.dispose();
        this.arc.geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.arc.material.dashSize = 0.16 * k;
        this.arc.material.gapSize = 0.2 * k;
        this.arc.computeLineDistances();
        this.goalBalls.forEach((ball, i) => {
            const a = (i ? 1 : -1) * goal;
            ball.position.set(Math.sin(a) * length, py - Math.cos(a) * length, 0);
            ball.scale.setScalar(0.09 * k);
        });

        // Light and fog reach scale with the world.
        const cam = this.sunLight.shadow.camera;
        cam.left = cam.bottom = -9 * k;
        cam.right = cam.top = 9 * k;
        cam.near = 1 * k;
        cam.far = 90 * k;
        cam.updateProjectionMatrix();
        this.sunLight.shadow.normalBias = 0.03 * k;
        this.sunLight.target.position.set(0, 2 * k, 0);
        this.scene.fog.near = 22 * k;
        this.scene.fog.far = 130 * k;
        this.camera.near = 0.2 * k;
        this.camera.far = 1400 * k;
        this.camera.updateProjectionMatrix();
    }

    resize() {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / Math.max(1, h);
        // Keep the whole swing in view on narrow windows.
        this.camera.fov = this.camera.aspect < 1.35 ? 40 * (1.35 / this.camera.aspect) ** 0.8 : 40;
        this.camera.updateProjectionMatrix();
    }

    /** Shake a handful of leaves out of the tree when a level is won. */
    celebrate() {
        const geo = new THREE.PlaneGeometry(0.16, 0.08);
        const k = this.k;
        for (let i = 0; i < 90; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(0.2 + Math.random() * 0.14, 0.7, 0.45),
                side: THREE.DoubleSide, transparent: true,
            });
            const leaf = new THREE.Mesh(geo, mat);
            leaf.scale.setScalar(k * (0.8 + Math.random()));
            leaf.position.set((-4.5 + Math.random() * 6) * k, (5 + Math.random() * 2.2) * k, (Math.random() - 0.3) * 2.5 * k);
            leaf.userData = { vy: -(0.5 + Math.random() * 0.9) * k, vx: (0.2 + Math.random() * 0.6) * k, spin: Math.random() * 6, life: 4 + Math.random() * 2.5 };
            this.scene.add(leaf);
            this.leaves.push(leaf);
        }
    }

    /**
     * s = { theta, length, goal, progress, dt }
     * progress is swing size divided by the goal size (0..1+).
     */
    draw(s) {
        if (s.length !== this.length || s.goal !== this.goal) this.setLength(s.length, s.goal);
        const k = this.k;
        this.time += s.dt;
        this.glow += (Math.min(1, Math.max(0, s.progress)) - this.glow) * Math.min(1, s.dt * 1.2);
        const g = this.glow;

        // Swing
        this.pivot.rotation.z = s.theta;
        // Legs kick forward on the way up, tuck on the way back.
        for (const shin of this.legs) shin.rotation.z = 0.25 + s.theta * 0.9;

        // Sky, sun and light
        colourAt('skyTop', g, this.skyUniforms.top.value);
        colourAt('skyLow', g, this.skyUniforms.low.value);
        this.scene.fog.color.copy(this.skyUniforms.low.value);
        const height = (three(SUN_HEIGHT, g) * Math.PI) / 180;
        const dir = new THREE.Vector3(0.36 * Math.cos(height), Math.sin(height), -0.93 * Math.cos(height)).normalize();
        colourAt('sun', g, this.sunLight.color);
        this.sunLight.intensity = three(SUN_POWER, g);
        this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(dir, 45 * k);
        this.sunDisc.material.color.copy(this.sunLight.color);
        this.sunHalo.material.color.copy(this.sunLight.color);
        this.sunDisc.position.copy(dir).multiplyScalar(440);
        this.sunHalo.position.copy(this.sunDisc.position);
        this.sunHalo.material.opacity = 0.2 + 0.25 * g;
        colourAt('hemiSky', g, this.hemi.color);
        colourAt('hemiLand', g, this.hemi.groundColor);
        this.hemi.intensity = three(HEMI_POWER, g);
        colourAt('fill', g, this.fill.color);
        this.fill.intensity = three(FILL_POWER, g);
        colourAt('cloud', g, this.cloudMat.color);
        this.renderer.toneMappingExposure = 1.0 - 0.08 * g;

        // Goal marks turn gold once the swing is high enough.
        this.goalMat.color.set(s.progress >= 1 ? 0xffd24a : 0xffffff);

        // Clouds drift
        for (const cloud of this.clouds) {
            cloud.position.x += s.dt * 0.25;
            if (cloud.position.x > 60) cloud.position.x = -60;
        }

        // Leaves fall
        this.leaves = this.leaves.filter((leaf) => {
            const d = leaf.userData;
            d.life -= s.dt;
            if (d.life <= 0) {
                this.scene.remove(leaf);
                leaf.material.dispose();
                return false;
            }
            leaf.position.y += d.vy * s.dt;
            leaf.position.x += (d.vx + Math.sin(d.life * 3 + d.spin) * 0.6 * k) * s.dt;
            leaf.rotation.set(d.life * 2 + d.spin, d.spin, d.life * 3);
            leaf.material.opacity = Math.min(1, d.life);
            return true;
        });

        // Camera: a gentle drift that leans with the swing.
        this.sway += (s.theta - this.sway) * Math.min(1, s.dt * 2);
        this.camera.position.set(
            (1.5 + this.sway * 0.9 + Math.sin(this.time * 0.2) * 0.15) * k,
            (3.0 + Math.sin(this.time * 0.15) * 0.08) * k,
            12.8 * k);
        this.camera.lookAt(0.2 * k + this.sway * 0.3 * k, 3.25 * k, 0);

        this.renderer.render(this.scene, this.camera);
    }
}

// Small seeded random generator, so the grass looks the same every run.
function mulberry(seed) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
