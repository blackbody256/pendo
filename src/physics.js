// Pendulum physics for the swing.

export const G = 9.81; // m/s^2

/** Period in seconds of a simple pendulum of length L metres (small swings). */
export const periodOf = (L) => 2 * Math.PI * Math.sqrt(L / G);

/** Length in metres of a pendulum with the given period in seconds. */
export const lengthForPeriod = (T) => (G * T * T) / (4 * Math.PI * Math.PI);

/** Length in metres of a pendulum that swings `perMinute` times a minute. */
export const lengthForRate = (perMinute) => lengthForPeriod(60 / perMinute);

/**
 * A damped pendulum pushed by a drive signal u (about -1..1):
 *   θ'' = -ω0² sin θ - (ω0/Q) θ' + ω0² · gain · u
 * Pushing at the swing's own rhythm builds height (resonance).
 * Pushing at another rhythm mostly cancels out.
 */
export class Swing {
    constructor(length, { Q = 6, gain = 0.15 } = {}) {
        this.Q = Q;
        this.gain = gain;
        this.setLength(length);
        this.theta = 0;   // angle from straight down, radians
        this.omega = 0;   // angular speed, rad/s
        this.swings = 0;  // forward passes through the bottom
    }

    setLength(length) {
        this.length = length;
        this.w0 = Math.sqrt(G / length);
        this.period = periodOf(length);
    }

    reset() {
        this.theta = 0;
        this.omega = 0;
        this.swings = 0;
    }

    /** Advance by dt seconds with drive u. Returns true on a forward pass through the bottom. */
    step(dt, u) {
        let passed = false;
        const steps = Math.max(1, Math.ceil(dt / 0.004));
        const h = dt / steps;
        const w2 = this.w0 * this.w0;
        for (let i = 0; i < steps; i++) {
            // Extra drag past 75° keeps the swing from going over the top.
            const over = Math.max(0, Math.abs(this.theta) - 1.3);
            const drag = this.w0 / this.Q + over * 8 * this.w0;
            const acc = -w2 * Math.sin(this.theta) - drag * this.omega + w2 * this.gain * u;
            this.omega += acc * h;
            const before = this.theta;
            this.theta += this.omega * h;
            if (before < 0 && this.theta >= 0) {
                passed = true;
                this.swings++;
            }
        }
        return passed;
    }

    /** Current swing size in radians: how far it would reach with its present energy. */
    get amplitude() {
        const e = (0.5 * this.omega * this.omega) / (this.w0 * this.w0) + (1 - Math.cos(this.theta));
        return Math.acos(Math.max(-1, 1 - e));
    }

    /** Height in metres the seat reaches above its lowest point. */
    get height() {
        return this.length * (1 - Math.cos(this.amplitude));
    }
}

/**
 * Length in metres of a pendulum that ticks once per heartbeat.
 * One tick is one pass, left to right or back, so a full swing is two beats.
 * At 60 beats a minute this is the 99 cm "seconds pendulum" of old clocks.
 */
export const heartLength = (beatsPerMinute) => lengthForPeriod(120 / beatsPerMinute);
