// Draws the swing, the tree and the sky on a canvas.

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;

// Sky colours: day, late afternoon, sunset. Three steps keep the middle from going grey.
const SKY_TOP = [[111, 190, 240], [150, 196, 232], [246, 140, 92]];
const SKY_LOW = [[226, 244, 255], [255, 236, 196], [255, 224, 164]];
const mix3 = (stops, t) => (t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], t * 2 - 1));

export class Scene {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.leaves = [];
        this.glow = 0; // eased sky colour, 0 day .. 1 sunset
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const ratio = window.devicePixelRatio || 1;
        this.w = this.canvas.clientWidth;
        this.h = this.canvas.clientHeight;
        this.canvas.width = Math.round(this.w * ratio);
        this.canvas.height = Math.round(this.h * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    /** Throw a handful of leaves from the swing when a level is won. */
    celebrate() {
        for (let i = 0; i < 70; i++) {
            this.leaves.push({
                x: this.w / 2 + (Math.random() - 0.5) * this.w * 0.5,
                y: this.h * 0.1 + Math.random() * this.h * 0.15,
                vx: (Math.random() - 0.5) * 60,
                vy: 20 + Math.random() * 60,
                spin: Math.random() * 6,
                life: 3 + Math.random() * 2,
                hue: 80 + Math.random() * 50,
            });
        }
    }

    /**
     * s = { theta, length, goal, progress, dt }
     * progress is swing size divided by the goal size (0..1+).
     */
    draw(s) {
        const { ctx, w, h } = this;
        this.glow += (Math.min(1, s.progress) - this.glow) * Math.min(1, s.dt * 1.5);
        const g = this.glow;

        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, mix3(SKY_TOP, g));
        sky.addColorStop(1, mix3(SKY_LOW, g));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Layout: the rope always fills the same part of the window, so a
        // longer rope makes everything else look smaller.
        const pivot = { x: w * 0.54, y: h * 0.17 };
        const ropePx = h * 0.56;
        const ppm = ropePx / s.length; // pixels per metre
        const groundY = pivot.y + ropePx + Math.max(0.7 * ppm, 16);

        // Sun sinks as the swing climbs
        const sunY = lerp(h * 0.2, groundY - h * 0.1, g);
        ctx.fillStyle = `rgba(255, ${Math.round(lerp(244, 190, g))}, ${Math.round(lerp(200, 110, g))}, 0.95)`;
        ctx.beginPath();
        ctx.arc(w * 0.82, sunY, 46, 0, Math.PI * 2);
        ctx.fill();

        // Hills and ground
        ctx.fillStyle = mix([150, 200, 150], [120, 130, 110], g);
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.bezierCurveTo(w * 0.2, groundY - h * 0.14, w * 0.35, groundY - h * 0.02, w * 0.5, groundY - h * 0.06);
        ctx.bezierCurveTo(w * 0.7, groundY - h * 0.13, w * 0.85, groundY - h * 0.03, w, groundY - h * 0.1);
        ctx.lineTo(w, groundY);
        ctx.fill();
        ctx.fillStyle = mix([96, 160, 84], [78, 104, 62], g);
        ctx.fillRect(0, groundY, w, h - groundY);

        // Tree: trunk on the left, one long branch over the swing
        const trunkX = pivot.x - ropePx * 0.78;
        const trunkW = Math.max(18, Math.min(70, 0.9 * ppm + 14));
        ctx.fillStyle = '#5b3d26';
        ctx.fillRect(trunkX - trunkW / 2, pivot.y - 30, trunkW, groundY - pivot.y + 30);
        ctx.beginPath();
        ctx.moveTo(trunkX, pivot.y - 16);
        ctx.lineTo(pivot.x + 60, pivot.y - 7);
        ctx.lineTo(pivot.x + 60, pivot.y + 3);
        ctx.lineTo(trunkX, pivot.y + 16);
        ctx.fill();
        ctx.fillStyle = mix([46, 125, 62], [40, 84, 48], g);
        for (const [dx, dy, r] of [[-0.05, -0.1, 0.2], [0.18, -0.13, 0.17], [0.42, -0.1, 0.15], [0.66, -0.09, 0.13], [0.88, -0.08, 0.1], [-0.2, -0.04, 0.14]]) {
            ctx.beginPath();
            ctx.arc(trunkX + dx * ropePx, pivot.y + dy * ropePx * 0.6, r * ropePx * 0.75, 0, Math.PI * 2);
            ctx.fill();
        }

        // A grown-up by the tree, for scale (1.7 m tall)
        this.person(trunkX + trunkW + 0.8 * ppm, groundY, 1.7 * ppm, '#3a2a22');

        // Goal marks: where the seat must reach
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, ropePx, Math.PI / 2 - s.goal, Math.PI / 2 + s.goal);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const side of [-1, 1]) {
            const gx = pivot.x + Math.sin(side * s.goal) * ropePx;
            const gy = pivot.y + Math.cos(side * s.goal) * ropePx;
            ctx.fillStyle = s.progress >= 1 ? '#ffd24a' : 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(gx, gy, 7, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rope, seat and child
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate(-s.theta); // positive theta swings to the right
        const seatW = Math.max(14, 0.5 * ppm);
        ctx.strokeStyle = '#e9dcc0';
        ctx.lineWidth = Math.max(1.5, Math.min(3, 0.04 * ppm));
        ctx.beginPath();
        ctx.moveTo(-4, 0); ctx.lineTo(-seatW / 2, ropePx);
        ctx.moveTo(4, 0); ctx.lineTo(seatW / 2, ropePx);
        ctx.stroke();
        ctx.fillStyle = '#7a4f2c';
        ctx.fillRect(-seatW / 2 - 3, ropePx - 2, seatW + 6, Math.max(4, 0.06 * ppm));
        // child, sitting (about 0.8 m from seat to top of head)
        const ch = Math.max(16, 0.8 * ppm);
        ctx.fillStyle = '#d9483b';
        ctx.fillRect(-ch * 0.17, ropePx - ch * 0.62, ch * 0.34, ch * 0.62);
        ctx.fillStyle = '#4a2f22';
        ctx.beginPath();
        ctx.arc(0, ropePx - ch * 0.8, ch * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f3b63';
        ctx.fillRect(-ch * 0.17, ropePx - 2, ch * 0.5, ch * 0.13);
        ctx.fillRect(ch * 0.2, ropePx - 2, ch * 0.13, ch * 0.42);
        ctx.restore();

        // Falling leaves
        this.leaves = this.leaves.filter((l) => l.life > 0);
        for (const l of this.leaves) {
            l.life -= s.dt;
            l.x += (l.vx + Math.sin(l.life * 3 + l.spin) * 30) * s.dt;
            l.y += l.vy * s.dt;
            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.rotate(l.spin + l.life * 2);
            ctx.globalAlpha = Math.min(1, l.life);
            ctx.fillStyle = `hsl(${l.hue}, 60%, 42%)`;
            ctx.beginPath();
            ctx.ellipse(0, 0, 9, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    person(x, groundY, height, colour) {
        const { ctx } = this;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, groundY - height * 0.9, height * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - height * 0.09, groundY - height * 0.8, height * 0.18, height * 0.8);
    }
}
