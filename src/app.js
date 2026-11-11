// Pendo: push a swing with your breath.

import { Swing, lengthForRate, heartLength } from './physics.js';
import { BreathTracker } from './breath.js';
import { Scene } from './scene.js';
import { CameraSource, KeyboardSource, API_KEY } from './sources.js';
import { Sound } from './sound.js';

// Each level is a longer rope, so a slower swing and slower breathing.
const LEVELS = [15, 12, 10, 8, 6].map((rate) => ({ rate, length: lengthForRate(rate) }));
const GOAL = (40 * Math.PI) / 180; // how far the swing must reach
const NEEDED = 5;                  // high swings needed to finish a level

const $ = (id) => document.getElementById(id);
const el = {
    hud: $('hud'), consent: $('consent'), levelCard: $('level-card'), endCard: $('end-card'), error: $('error'),
    levelLabel: $('level-label'), ropeLength: $('rope-length'), targetRate: $('target-rate'),
    yourRate: $('your-rate'), yourPulse: $('your-pulse'), height: $('height'),
    progress: $('progress'), hint: $('hint'), breathFill: $('breath-fill'),
    preview: $('preview'), status: $('status'),
    lag: $('lag'), lagValue: $('lag-value'), flip: $('flip'),
    cardLabel: $('card-label'), cardTitle: $('card-title'), cardText: $('card-text'), cardWait: $('card-wait'),
    endTitle: $('end-title'), endHeart: $('end-heart'), endBreath: $('end-breath'),
    btnCamera: $('btn-camera'), btnPractice: $('btn-practice'), btnGo: $('btn-go'),
    btnSound: $('btn-sound'),
    btnStop: $('btn-stop'), btnAgain: $('btn-again'), btnFinish: $('btn-finish'), keyNote: $('key-note'),
};

const scene = new Scene($('scene'));
const tracker = new BreathTracker();
const swing = new Swing(LEVELS[0].length);
const sound = new Sound();

const game = {
    mode: 'consent',   // consent | card | play | end
    level: 0,
    highSwings: 0,
    source: null,
    statusOk: true,
    pulses: [],
    lagSec: 0.5,
};

// ---------- small helpers ----------

function show(mode) {
    game.mode = mode;
    el.consent.hidden = mode !== 'consent';
    el.levelCard.hidden = mode !== 'card';
    el.endCard.hidden = mode !== 'end';
    el.hud.hidden = mode === 'consent';
}

function showError(text) {
    el.error.textContent = text;
    el.error.hidden = !text;
}

function drawProgress() {
    el.progress.innerHTML = '';
    for (let i = 0; i < NEEDED; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i < game.highSwings ? ' on' : '');
        el.progress.appendChild(dot);
    }
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = `${game.highSwings} of ${NEEDED} high swings`;
    el.progress.appendChild(text);
}

function setLag(seconds) {
    game.lagSec = seconds;
    el.lag.value = String(seconds);
    el.lagValue.textContent = seconds.toFixed(1);
}

const averagePulse = () =>
    game.pulses.length ? game.pulses.reduce((a, b) => a + b, 0) / game.pulses.length : null;

// ---------- levels ----------

function openLevel(index) {
    game.level = index;
    game.highSwings = 0;
    const lv = LEVELS[index];
    swing.setLength(lv.length);
    swing.reset();
    el.levelLabel.textContent = `Level ${index + 1} of ${LEVELS.length}`;
    el.ropeLength.textContent = lv.length.toFixed(1);
    el.targetRate.textContent = String(lv.rate);
    drawProgress();

    el.cardLabel.textContent = `Level ${index + 1} of ${LEVELS.length}`;
    el.cardTitle.textContent = `A ${lv.length.toFixed(1)} m rope`;
    el.cardText.textContent =
        `This swing goes back and forth ${lv.rate} times a minute. ` +
        `Breathe out as it goes forward and in as it comes back. ` +
        `Reach the white marks ${NEEDED} times.` +
        (index > 0 ? ' Take a normal breath or two first.' : '');
    show('card');
    el.btnGo.focus();
}

function finishLevel() {
    scene.celebrate();
    sound.win();
    if (game.level + 1 < LEVELS.length) {
        openLevel(game.level + 1);
        el.cardLabel.textContent = `Level ${game.level} done`;
    } else {
        openEnd();
    }
}

function openEnd() {
    const bpm = averagePulse();
    if (bpm) {
        const cm = Math.round(heartLength(bpm) * 100);
        el.endTitle.textContent = `Your heart is a ${cm} cm pendulum`;
        el.endHeart.textContent =
            `Your pulse was about ${Math.round(bpm)} beats a minute. ` +
            `A pendulum that ticks once per beat is ${cm} cm long.`;
    } else {
        el.endTitle.textContent = 'Your heart is a pendulum too';
        el.endHeart.textContent =
            'At 72 beats a minute, a pendulum that ticks once per beat is 69 cm long. ' +
            'Play with the camera on to find your own.';
    }
    const last = LEVELS[LEVELS.length - 1];
    el.endBreath.textContent =
        `Your breath swung a ${last.length.toFixed(1)} m rope, at ${last.rate} breaths a minute.`;
    show('end');
    el.btnAgain.focus();
}

// ---------- starting and stopping ----------

const handlers = {
    onBreath: (value, t) => tracker.push(value, t),
    onPulse: (bpm) => {
        game.pulses.push(bpm);
        if (game.pulses.length > 600) game.pulses.shift();
        el.yourPulse.textContent = String(Math.round(bpm));
    },
    onStatus: ({ ok, text }) => {
        game.statusOk = ok;
        el.status.textContent = text;
        el.status.classList.toggle('bad', !ok);
    },
    onStream: (stream) => {
        el.preview.srcObject = stream;
        el.preview.hidden = false;
        el.preview.play().catch(() => {});
    },
    onError: (text) => showError(`Camera problem: ${text}`),
};

async function begin(source, startLevel = 0) {
    showError('');
    sound.start();
    tracker.reset();
    tracker.invert = el.flip.checked;
    game.pulses = [];
    game.source = source;
    el.yourPulse.textContent = '–';
    el.yourRate.textContent = '–';
    el.preview.hidden = true;
    setLag(source.kind === 'camera' ? 0.5 : 0.2);
    openLevel(startLevel);
    try {
        await source.start();
    } catch (err) {
        await stop();
        showError(`Could not start: ${err && err.message ? err.message : err}`);
    }
}

async function stop() {
    const source = game.source;
    game.source = null;
    sound.stop();
    if (source) await source.stop();
    el.preview.srcObject = null;
    el.preview.hidden = true;
    show('consent');
}

el.btnCamera.addEventListener('click', () => begin(new CameraSource(handlers)));
el.btnPractice.addEventListener('click', () => begin(new KeyboardSource(handlers)));
el.btnGo.addEventListener('click', () => { show('play'); });
el.btnStop.addEventListener('click', stop);
el.btnFinish.addEventListener('click', stop);
el.btnAgain.addEventListener('click', () => openLevel(0));
function toggleSound() {
    sound.setMuted(!sound.muted);
    el.btnSound.textContent = sound.muted ? 'Sound is off' : 'Sound is on';
    el.btnSound.setAttribute('aria-pressed', String(!sound.muted));
}
el.btnSound.addEventListener('click', toggleSound);
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && game.mode !== 'consent') toggleSound(); });
el.lag.addEventListener('input', () => setLag(Number(el.lag.value)));
el.flip.addEventListener('change', () => { tracker.invert = el.flip.checked; });

if (!API_KEY) {
    el.btnCamera.disabled = true;
    el.keyNote.hidden = false;
}

// ---------- the loop ----------

let lastFrame = performance.now();

function frame(now) {
    const dt = Math.min(0.25, (now - lastFrame) / 1000); // physics sub-steps cope with slow frames
    lastFrame = now;

    const playing = game.mode === 'play';
    // On the first screen the swing sways gently by itself.
    const idle = game.mode === 'consent' ? 0.35 * Math.sin(swing.w0 * now / 1000) : 0;
    const push = playing ? tracker.drive(swing.w0, game.lagSec) : idle;
    const passed = swing.step(dt, push);
    const amplitude = swing.amplitude;

    if (playing && passed && amplitude >= GOAL) {
        game.highSwings++;
        sound.chime(game.highSwings - 1);
        drawProgress();
        if (game.highSwings >= NEEDED) finishLevel();
    }

    if (game.mode === 'card') {
        const waiting = !tracker.ready;
        el.btnGo.disabled = waiting;
        el.cardWait.textContent = waiting
            ? (game.source && game.source.kind === 'camera'
                ? 'Finding your breathing. Sit still and breathe normally…'
                : 'Getting ready…')
            : '';
    }

    if (game.mode !== 'consent') {
        const rate = tracker.rate;
        el.yourRate.textContent = rate ? rate.toFixed(0) : '–';
        el.height.textContent = swing.height.toFixed(1);
        el.breathFill.style.height = `${50 + 50 * tracker.level}%`;
        if (playing) {
            if (!game.statusOk) el.hint.textContent = el.status.textContent;
            else if (amplitude < 0.05) el.hint.textContent = 'Breathe slowly in and out to start the swing.';
            else el.hint.textContent = swing.omega > 0 ? 'Breathe out  →' : '←  Breathe in';
        }
    }
    el.hint.hidden = !playing;

    const dusk = game.mode === 'consent' ? 0 : Math.min(1, amplitude / GOAL);
    sound.update(Math.abs(swing.omega) / (swing.w0 * GOAL), Math.sin(swing.theta) * 2, dusk);

    scene.draw({
        theta: swing.theta,
        length: swing.length,
        goal: GOAL,
        progress: dusk,
        dt,
    });
    requestAnimationFrame(frame);
}

// Dev aid: ?auto=15 plays by itself at 15 breaths a minute; &level=3 picks a level;
// ?screen=end jumps to the last screen.
const query = new URLSearchParams(location.search);
if (query.has('auto')) {
    const level = Math.max(0, Math.min(LEVELS.length - 1, Number(query.get('level') || 1) - 1));
    begin(new KeyboardSource(handlers, { autoRate: Number(query.get('auto')) }), level)
        .then(() => setTimeout(() => show('play'), 3200));
} else if (query.get('screen') === 'end') {
    openEnd();
} else {
    show('consent');
}

requestAnimationFrame(frame);
