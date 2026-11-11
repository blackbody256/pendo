// Turns a raw breathing line (any units) into a push for the swing.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export class BreathTracker {
    constructor() {
        this.invert = false; // set true if the line falls when you breathe in
        this.reset();
    }

    reset() {
        this.t = null;
        this.t0 = null;
        this.s = 0;        // smoothed signal
        this.min = 0;
        this.max = 0;
        this.best = 0;     // largest half-range seen recently
        this.level = 0;    // -1 (breathed out) .. +1 (breathed in)
        this.vel = 0;      // change of level per second
        this.armed = false;
        this.crossings = [];
    }

    /** Feed one sample. t is in seconds. */
    push(raw, t) {
        const x = this.invert ? -raw : raw;
        if (this.t === null) {
            this.t = this.t0 = t;
            this.s = this.min = this.max = x;
            return;
        }
        const dt = t - this.t;
        if (dt <= 0) return;
        this.t = t;
        const step = Math.min(dt, 0.5);

        const prev = this.s;
        this.s += (1 - Math.exp(-step / 0.15)) * (x - this.s);

        // Slowly forgetting min/max, so the scale follows shallow or deep breathing.
        const k = 1 - Math.exp(-step / 25);
        this.max = Math.max(this.s, this.max - (this.max - this.s) * k);
        this.min = Math.min(this.s, this.min + (this.s - this.min) * k);
        const half = (this.max - this.min) / 2;
        this.best = Math.max(half, this.best * Math.exp(-step / 90));
        // The floor stops tiny noise from counting as a full breath.
        const scale = Math.max(half, 0.35 * this.best, 1e-9);
        const centre = (this.max + this.min) / 2;

        this.level = clamp((this.s - centre) / scale, -1, 1);
        const rawVel = (this.s - prev) / step / scale;
        this.vel += (1 - Math.exp(-step / 0.1)) * (rawVel - this.vel);

        // Count breaths: one each time the level climbs from low to high.
        if (this.level < -0.2) this.armed = true;
        if (this.armed && this.level > 0.2) {
            this.armed = false;
            this.crossings.push(t);
            if (this.crossings.length > 4) this.crossings.shift();
        }
    }

    /** True once there is enough signal to trust. */
    get ready() {
        return this.t !== null && this.t - this.t0 > 3 && this.best > 0;
    }

    /** Breaths per minute from the last few breaths, or null. */
    get rate() {
        const c = this.crossings;
        if (c.length < 2 || this.t - c[c.length - 1] > 20) return null;
        return (60 * (c.length - 1)) / (c[c.length - 1] - c[0]);
    }

    /**
     * Push for a swing with natural angular rate w0 (rad/s).
     * Breathing out pushes forward; breathing in pulls back.
     * lagSec shifts the push earlier to make up for a late signal.
     */
    drive(w0, lagSec = 0) {
        if (!this.ready) return 0;
        const phi = w0 * lagSec;
        const u = Math.cos(phi) * (-this.vel / w0) + Math.sin(phi) * this.level;
        return clamp(u, -1.5, 1.5);
    }
}
