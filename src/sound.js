// All sound is made in code (Web Audio), so there are no audio files to ship.

const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0]; // C major pentatonic

export class Sound {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.dusk = 0;
        this.birdTimer = null;
    }

    /** Call from a click or key press: browsers only allow sound after one. */
    start() {
        if (!this.ctx) {
            const ctx = (this.ctx = new AudioContext());
            this.master = ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.9;
            this.master.connect(ctx.destination);

            // Wind: filtered noise that rises with the swing's speed.
            const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            this.windFilter = ctx.createBiquadFilter();
            this.windFilter.type = 'bandpass';
            this.windFilter.frequency.value = 350;
            this.windFilter.Q.value = 0.7;
            this.windGain = ctx.createGain();
            this.windGain.gain.value = 0;
            this.windPan = ctx.createStereoPanner();
            noise.connect(this.windFilter).connect(this.windGain).connect(this.windPan).connect(this.master);
            noise.start();
        }
        this.ctx.resume();
        this.scheduleBird();
    }

    stop() {
        clearTimeout(this.birdTimer);
        this.birdTimer = null;
        if (this.ctx) this.ctx.suspend();
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }

    /** speed: 0 at rest, about 1 at goal height. pan: -1 left .. 1 right. dusk: 0..1. */
    update(speed, pan, dusk) {
        this.dusk = dusk;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const s = Math.min(1.4, speed);
        this.windGain.gain.setTargetAtTime(0.015 + 0.2 * s * s, t, 0.08);
        this.windFilter.frequency.setTargetAtTime(280 + 900 * s, t, 0.08);
        this.windPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)) * 0.6, t, 0.08);
    }

    tone(freq, when, length, level, type = 'sine') {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(level, when + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
        osc.connect(gain).connect(this.master);
        osc.start(when);
        osc.stop(when + length + 0.05);
    }

    /** A bell note for each high swing; the notes climb as you collect them. */
    chime(index) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const f = NOTES[index % NOTES.length];
        this.tone(f, t, 1.4, 0.16);
        this.tone(f * 2, t, 0.7, 0.05, 'triangle');
    }

    /** A rising run of notes when a level is finished. */
    win() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + 0.25;
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
            this.tone(f, t + i * 0.11, 1.8, 0.13);
            this.tone(f * 2, t + i * 0.11, 0.9, 0.035, 'triangle');
        });
    }

    scheduleBird() {
        clearTimeout(this.birdTimer);
        this.birdTimer = setTimeout(() => {
            this.bird();
            this.scheduleBird();
        }, 3500 + Math.random() * 6500);
    }

    /** A short bird call. Birds go quiet as the sun sets. */
    bird() {
        if (!this.ctx || this.ctx.state !== 'running' || Math.random() < this.dusk * 0.8) return;
        const ctx = this.ctx;
        let t = ctx.currentTime + 0.05;
        const base = 2200 + Math.random() * 1400;
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.6 - 0.8;
        pan.connect(this.master);
        const chirps = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirps; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(base, t);
            osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.05);
            osc.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.11);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.035, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
            osc.connect(gain).connect(pan);
            osc.start(t);
            osc.stop(t + 0.15);
            t += 0.15 + Math.random() * 0.08;
        }
    }
}
