// Main process: opens the Pendo window and connects it to the SmartSpectra SDK.
'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session } = require('electron');
const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');

// Dev aid: PENDO_SHOT=out.png saves a picture of the window and quits.
// PENDO_QUERY sets the page query, e.g. "auto=15" for self-playing practice.
const SHOT = process.env.PENDO_SHOT;
const QUERY = process.env.PENDO_QUERY || '';
const SHOT_DELAY_MS = Number(process.env.PENDO_SHOT_DELAY_MS || 6000);

function createWindow() {
    const win = new BrowserWindow({
        width: 1180,
        height: 780,
        show: !SHOT,
        backgroundColor: '#8fd3ff',
        title: 'Pendo',
        webPreferences: {
            preload: require.resolve('@smartspectra/node-sdk/preload'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: !SHOT,
            offscreen: !!SHOT, // keeps frames coming for a hidden window
        },
    });
    win.setMenuBarVisibility(false);
    bindSmartSpectraIpc(win);

    // Pendo only ever shows its own bundled page.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    win.loadFile(path.join(__dirname, 'index.html'), { search: QUERY });

    if (SHOT) {
        win.webContents.once('did-finish-load', () => {
            setTimeout(async () => {
                const image = await win.webContents.capturePage();
                fs.writeFileSync(SHOT, image.toPNG());
                app.quit();
            }, SHOT_DELAY_MS);
        });
    }
}

app.whenReady().then(() => {
    // Allow the camera only, and only for the bundled local page.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
        const mediaTypes = (details && details.mediaTypes) || [];
        const cameraOnly = mediaTypes.length === 1 && mediaTypes[0] === 'video';
        callback(permission === 'media' && cameraOnly && url.startsWith('file://'));
    });
    createWindow();
});

app.on('window-all-closed', () => app.quit());
