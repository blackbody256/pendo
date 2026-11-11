// Where the breathing line comes from: the camera (SmartSpectra SDK) or the keyboard.
//
// Both sources call the same handlers:
//   onBreath(value, tSeconds)   one sample of the breathing line
//   onPulse(beatsPerMinute)     camera only
//   onStatus({ ok, text })      what the player should fix, if anything
//   onStream(mediaStream)       camera only, for the preview
//   onError(text)

import {
    SmartSpectraSDK,
    ProcessingStatus,
    ValidationCode,
    MetricType,
    breathingMetrics,
} from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';

export const API_KEY = process.env.SMARTSPECTRA_API_KEY || '';

const toNumber = (ts) => {
    if (ts == null) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'bigint') return Number(ts);
    if (typeof ts.toNumber === 'function') return ts.toNumber();
    return Number(ts);
};

// Plain-language versions of the SDK's camera checks.
const HINTS = {
    [ValidationCode.kNoFaceFound]: 'I can\'t see your face.',
    [ValidationCode.kMultipleFacesFound]: 'One person at a time, please.',
    [ValidationCode.kFaceNotCentered]: 'Move to the middle of the picture.',
    [ValidationCode.kFaceSizeOutOfRange]: 'Sit about one metre from the camera.',
    [ValidationCode.kTooDark]: 'Too dark. Face a lamp or a window.',
    [ValidationCode.kTooBright]: 'Too bright. Turn away from the light a little.',
    [ValidationCode.kChestNotVisible]: 'Sit back so the camera sees your chest and shoulders.',
    [ValidationCode.kCameraTuning]: 'Camera is adjusting…',
    [ValidationCode.kFrameRateTooLow]: 'The camera is running slowly. Close other apps using it.',
    [ValidationCode.kExcessiveMotion]: 'Try to sit still.',
    [ValidationCode.kFaceTooClose]: 'Sit back a little.',
    [ValidationCode.kFaceTooFar]: 'Come a little closer.',
    [ValidationCode.kFaceTooHigh]: 'Lower yourself in the picture.',
    [ValidationCode.kFaceTooLow]: 'Raise yourself in the picture.',
    [ValidationCode.kFaceNotForward]: 'Face the camera.',
};

export class CameraSource {
    constructor(handlers) {
        this.h = handlers;
        this.sdk = null;
        this.kind = 'camera';
    }

    async start() {
        this.sdk = new SmartSpectraSDK({
            apiKey: API_KEY,
            // Only what the game shows: the breathing set and pulse rate.
            requestedMetrics: [...breathingMetrics, MetricType.PULSE_RATE],
            // Pendo switches off the SDK's usage telemetry.
            enableTelemetry: false,
        });
        const sdk = this.sdk;

        sdk.on('streamAvailable', (stream) => this.h.onStream?.(stream));

        sdk.on('processingStatus', (status) => {
            if (status === ProcessingStatus.kStarting) {
                this.h.onStatus?.({ ok: false, text: 'Starting the camera…' });
            } else if (status === ProcessingStatus.kError) {
                this.h.onStatus?.({ ok: false, text: 'The camera stopped with an error.' });
            }
        });

        sdk.on('validationStatus', (code, _ts, hint) => {
            if (code === ValidationCode.kOk) {
                this.h.onStatus?.({ ok: true, text: 'Camera can see you.' });
            } else {
                this.h.onStatus?.({ ok: false, text: HINTS[code] || hint || 'Adjust your position.' });
            }
        });

        sdk.on('metrics', (buf) => {
            let m;
            try { m = decodeMetrics(buf); } catch { return; }
            for (const sample of m.breathing?.upperTrace ?? []) {
                this.h.onBreath?.(sample.value, toNumber(sample.timestamp) / 1e6);
            }
            const pulses = m.cardio?.pulseRate ?? [];
            for (const p of pulses) {
                // Skip readings the SDK marks as not yet steady.
                if (p.stable === false) continue;
                if (p.value > 0) this.h.onPulse?.(p.value);
            }
        });

        sdk.on('error', (code, message) => {
            this.h.onError?.(`${message} (code ${code})`);
        });

        await sdk.start();
    }

    async stop() {
        const sdk = this.sdk;
        this.sdk = null;
        if (!sdk) return;
        try { await sdk.stop(); } catch { /* already stopped */ }
        try { sdk.destroy(); } catch { /* already destroyed */ }
    }
}

/**
 * Practice without a camera: hold Space to breathe in, let go to breathe out.
 * With autoRate set, it breathes by itself at that many breaths a minute.
 */
export class KeyboardSource {
    constructor(handlers, { autoRate = null } = {}) {
        this.h = handlers;
        this.kind = 'keyboard';
        this.autoRate = autoRate;
        this.held = false;
        this.level = -1;
        this.timer = null;
        this.onDown = (e) => { if (e.code === 'Space') { this.held = true; e.preventDefault(); } };
        this.onUp = (e) => { if (e.code === 'Space') { this.held = false; e.preventDefault(); } };
    }

    async start() {
        window.addEventListener('keydown', this.onDown);
        window.addEventListener('keyup', this.onUp);
        const t0 = performance.now();
        let last = t0;
        this.timer = setInterval(() => {
            const now = performance.now();
            const dt = (now - last) / 1000;
            last = now;
            const t = (now - t0) / 1000;
            if (this.autoRate) {
                this.level = Math.sin((2 * Math.PI * this.autoRate * t) / 60);
            } else {
                // Lungs fill and empty smoothly, not instantly.
                const target = this.held ? 1 : -1;
                this.level += (1 - Math.exp(-dt / 0.9)) * (target - this.level);
            }
            this.h.onBreath?.(this.level, t);
        }, 33);
        this.h.onStatus?.({ ok: true, text: 'Practice mode: hold Space to breathe in, let go to breathe out.' });
    }

    async stop() {
        clearInterval(this.timer);
        window.removeEventListener('keydown', this.onDown);
        window.removeEventListener('keyup', this.onUp);
    }
}
