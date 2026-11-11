import test from 'node:test';
import assert from 'node:assert/strict';
import { Swing, periodOf, lengthForRate, heartLength } from '../src/physics.js';
import { BreathTracker } from '../src/breath.js';

const GOAL = (40 * Math.PI) / 180;

test('pendulum lengths match the textbook', () => {
    assert.ok(Math.abs(heartLength(60) - 0.994) < 0.001);   // the seconds pendulum
    assert.ok(Math.abs(heartLength(72) - 0.69) < 0.005);
    assert.ok(Math.abs(lengthForRate(6) - 24.85) < 0.01);
    assert.ok(Math.abs(periodOf(lengthForRate(15)) - 4) < 1e-9);
});

// Breathe as a sine wave at `ratio` times the swing's own rate, with the
// signal arriving `lag` seconds late. Counts swings that pass the goal height,
// which is how the game scores a level (5 needed).
function play({ perMinute, ratio = 1, lag = 0, periods = 14, noise = 0 }) {
    const swing = new Swing(lengthForRate(perMinute));
    const tracker = new BreathTracker();
    const w = (2 * Math.PI * perMinute * ratio) / 60;
    const dt = 1 / 30;
    let good = 0;
    for (let t = 0; t < periods * swing.period; t += dt) {
        tracker.push(37 + 4 * Math.sin(w * (t - lag)) + noise * (Math.random() - 0.5), t);
        const passed = swing.step(dt, tracker.drive(swing.w0, 0.2 + lag));
        if (passed && swing.amplitude >= GOAL) good++;
    }
    return good;
}

for (const perMinute of [15, 6]) {
    test(`${perMinute}/min: breathing in time wins the level`, () => {
        assert.ok(play({ perMinute }) >= 5);
        assert.ok(play({ perMinute, ratio: 1.05 }) >= 5);
    });
    test(`${perMinute}/min: breathing 20% too fast or slow does not`, () => {
        assert.equal(play({ perMinute, ratio: 1.2 }), 0);
        assert.equal(play({ perMinute, ratio: 0.8 }), 0);
    });
    test(`${perMinute}/min: a noisy or late signal still works`, () => {
        assert.ok(play({ perMinute, noise: 1.5 }) >= 5);
        assert.ok(play({ perMinute, lag: 1 }) >= 5);
    });
}

test('a still chest (noise only, after real breaths) does not push the swing far', () => {
    const swing = new Swing(lengthForRate(15));
    const tracker = new BreathTracker();
    const dt = 1 / 30;
    let t = 0;
    for (; t < 12; t += dt) tracker.push(4 * Math.sin((2 * Math.PI * t) / 4), t);
    swing.reset();
    let best = 0;
    for (; t < 60; t += dt) {
        tracker.push(0.1 * (Math.random() - 0.5), t);
        swing.step(dt, tracker.drive(swing.w0, 0.2));
        if (t > 30) best = Math.max(best, swing.amplitude);
    }
    assert.ok(best < GOAL / 2, `amplitude ${best}`);
});

test('breath rate is counted', () => {
    const tracker = new BreathTracker();
    for (let t = 0; t < 40; t += 1 / 30) tracker.push(Math.sin((2 * Math.PI * t) / 5), t);
    assert.ok(Math.abs(tracker.rate - 12) < 0.5, `rate ${tracker.rate}`);
});
