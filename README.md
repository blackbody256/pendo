# Pendo

Push a swing with your breath. Entry for the DEV × Presage SmartSpectra SDK Challenge (due 22 Nov 2026, 11:59 PM PST).

A camera reads your breathing and pulse through the SmartSpectra SDK. Breathing out pushes the swing forward and breathing in pulls it back. Breathe in time with the swing and it climbs; breathe out of time and it stalls. Each level has a longer rope, so a slower swing and slower breathing: 4 m at 15 breaths a minute up to 25 m at 6. At the end, your pulse is shown as a pendulum length.

## Run it
```bash
cp .env.example .env   # paste your key after SMARTSPECTRA_API_KEY=
npm install
npm start
```
- Without a key the game still runs in practice mode: hold Space to breathe in, let go to breathe out.
- In a VS Code terminal, use `env -u ELECTRON_RUN_AS_NODE npm start`.
- On Ubuntu 24.04, Electron refuses to start until its sandbox helper is set up. Run this once after `npm install`:
  ```bash
  sudo chown root:root node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
  ```

## Files
- `src/physics.js`: the pendulum (damped, pushed by breath) and the length formulas.
- `src/breath.js`: turns the raw breathing line into a push, whatever its units.
- `src/sources.js`: the camera (SmartSpectra SDK) and the keyboard practice source.
- `src/scene.js`: the drawing. `src/app.js`: screens, levels and the game loop.
- `main.cjs`: the Electron window. `test/`: physics tests (`npm test`).
- `quickstart/`: Presage's sample app, kept locally for testing the SDK. Not part of the entry and git-ignored.

## Camera and data
- The camera starts only after the player agrees on the first screen, and "Stop and go back" turns it off.
- Pendo does not record or store video or readings.
- The SDK connects to Presage to check the API key. Pendo sets `enableTelemetry: false`, which Presage documents as sending no telemetry.
- Not yet confirmed: whether video frames are processed only on the device. Check with Presage before writing the submission's data section.

## Tuning with the real camera
The Tuning box in the game has two controls to set once the camera works:
- **Signal delay:** how late the breathing line arrives. Raise it if the swing feels behind your breath.
- **Flip breathing direction:** tick it if breathing out pulls the swing back.
