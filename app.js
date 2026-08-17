'use strict';

/* ============================================================
   DEFAULT CONFIGURATION
   ============================================================ */
const DEFAULT_CONFIG = {
    gameTitle:    "De Verloren Schatten van d'Artagnan",
    introText:    "Jij bent de musketier die de vijf verloren schatten van d'Artagnan moet terugvinden.\n\nVijf locaties. Vijf opdrachten. Vijf letters.\n\nJouw missie begint hier op de D'Artagnanlaan in Maastricht.",
    congratsText: "Je bent officieel Musketier van de D'Artagnanlaan.",
    locations: [
        {
            qrValue: 'DARTAGNAN-PRIXDEROME-2026-N',
            name:    'Restaurant Prix de Rome',
            title:   'De Gastvrijheid van Porthos',
            letter:  'A',
            points:  20,
            task:    'Maak een foto van zoveel mogelijk buurtbewoners op een bankje.'
        },
        {
            qrValue: 'DARTAGNAN-APOSTELHOEVE-2026-E',
            name:    'Apostelhoeve',
            title:   'De Brief van de Koning',
            letter:  'L',
            points:  20,
            task:    'Maak een foto van een buurtbewoner boven de 60 en een buurtbewoner onder de 10 die samen bij een wijnrank staan.'
        },
        {
            qrValue: 'DARTAGNAN-WOLDER-KERK-2026-L',
            name:    'Petrus en Pauluskerk Wolder',
            title:   'De Bescherming van Aramis',
            letter:  'L',
            points:  20,
            task:    "Maak een foto van de plek waar jij denkt dat d'Artagnan echt begraven ligt."
        },
        {
            qrValue: 'DARTAGNAN-CAMPAGNE-2026-L',
            name:    'Zorgcentrum Campagne',
            title:   "Het Schild van d'Artagnan",
            letter:  'E',
            points:  20,
            task:    'Maak een foto waarop minimaal 3 (meer mag altijd) buurtbewoners samen muziek maken, ga op zoek naar instrumenten!'
        },
        {
            qrValue: 'DARTAGNAN-ATHOS-2026-A',
            name:    'Athos Eet-Maakt-Doet',
            title:   'De Wijsheid van Athos',
            letter:  'N',
            points:  20,
            task:    'Maak een foto met minimaal 2 buurtbewoners die je voor vandaag nog niet kende.'
        }
    ],
    finalQuestion: "Wat is de beroemde spreuk van de musketiers?",
    correctAnswer: "Eén voor allen, allen voor één",
    answerOptions: [
        "Eén voor allen, allen voor één",
        "Samen sterk",
        "Leve de koning"
    ]
};

const CONFIG_KEY  = 'artagnan_config_v1';
const STORAGE_KEY = 'artagnan_state_v1';

// Active configuration — overwritten by loadConfig() if admin has saved changes
let CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

/* ============================================================
   STATE
   ============================================================ */
let state = {
    playerName:     '',
    foundLocations: [],   // array of location indices (0-4) in order found
    points:         0,
    photos:         {}    // { "0": dataURL, "1": dataURL, ... }
};

let html5QrScanner       = null;
let cameraStream         = null;
let currentTreasureIndex = null;
let toastTimer           = null;

/* ============================================================
   STATE PERSISTENCE
   ============================================================ */
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        // localStorage may be full due to stored photos
        showToast('Opslaan mislukt — geheugen bijna vol. Probeer een foto te verwijderen.', 'error');
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Validate shape before applying
            if (parsed && typeof parsed === 'object') {
                state.playerName     = typeof parsed.playerName     === 'string'  ? parsed.playerName     : '';
                state.foundLocations = Array.isArray(parsed.foundLocations)       ? parsed.foundLocations : [];
                state.points         = typeof parsed.points         === 'number'  ? parsed.points         : 0;
                state.photos         = parsed.photos && typeof parsed.photos === 'object' ? parsed.photos : {};
            }
        }
    } catch (_) {
        // Corrupt state — start fresh
    }
}

function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    state = { playerName: '', foundLocations: [], points: 0, photos: {} };
}

/* ============================================================
   CONFIG MANAGEMENT
   ============================================================ */
function loadConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === 'object' &&
            Array.isArray(parsed.locations) &&
            parsed.locations.length === 5 &&
            Array.isArray(parsed.answerOptions) &&
            parsed.answerOptions.length >= 2
        ) {
            CONFIG = parsed;
        }
    } catch (_) {}
}

function applyConfigToDOM() {
    const titleEl = document.getElementById('game-title');
    if (titleEl) titleEl.textContent = CONFIG.gameTitle;

    const introEl = document.getElementById('intro-text-container');
    if (introEl) {
        introEl.innerHTML = CONFIG.introText
            .split('\n\n')
            .filter(p => p.trim())
            .map(p => '<p>' + escapeHTML(p.trim()) + '</p>')
            .join('');
    }

    const subtitleEl = document.getElementById('end-subtitle');
    if (subtitleEl) subtitleEl.textContent = CONFIG.congratsText;

    const questionEl = document.getElementById('question-text');
    if (questionEl) questionEl.textContent = CONFIG.finalQuestion;

    renderAnswerOptions();
}

function renderAnswerOptions() {
    const container = document.getElementById('answer-options');
    if (!container) return;
    container.innerHTML = '';
    CONFIG.answerOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className      = 'btn btn-answer';
        btn.dataset.answer = opt;
        btn.textContent    = opt;
        container.appendChild(btn);
    });
}

/* ============================================================
   SCREEN ROUTING
   ============================================================ */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        window.scrollTo(0, 0);
    }
    // Hide header and reclaim its space on the photo screen
    const isPhoto = id === 'screen-photo';
    document.getElementById('app-header').style.display = isPhoto ? 'none' : '';
    document.body.style.paddingTop = isPhoto ? '0' : '';
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

/* ============================================================
   START SCREEN
   ============================================================ */
function handleStart() {
    const input = document.getElementById('player-name');
    const name  = input.value.trim();
    if (!name) {
        showToast('Vul eerst jouw naam in, dappere musketier!', 'error');
        input.focus();
        return;
    }
    state.playerName = name;
    saveState();
    updateDashboard();
    showScreen('screen-dashboard');
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function updateDashboard() {
    document.getElementById('dashboard-name').textContent  = state.playerName;
    document.getElementById('dashboard-points').textContent = state.points;
    document.getElementById('dashboard-found').textContent  = state.foundLocations.length;

    const pct = (state.foundLocations.length / CONFIG.locations.length) * 100;
    document.getElementById('progress-fill').style.width           = pct + '%';
    document.getElementById('dashboard-progress-text').textContent = state.foundLocations.length + ' van ' + CONFIG.locations.length;

    const progressTrack = document.querySelector('.progress-track');
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', state.foundLocations.length);

    // Letter boxes
    const letterBoxes = document.querySelectorAll('#dashboard-letters .letter-box');
    CONFIG.locations.forEach((loc, i) => {
        const box = letterBoxes[i];
        if (!box) return;
        if (state.foundLocations.includes(i)) {
            box.textContent = loc.letter;
            box.classList.add('found');
            box.classList.remove('empty');
            box.setAttribute('aria-label', 'Letter ' + (i + 1) + ': ' + loc.letter);
        } else {
            box.textContent = '_';
            box.classList.remove('found');
            box.classList.add('empty');
            box.setAttribute('aria-label', 'Letter ' + (i + 1) + ' nog niet gevonden');
        }
    });

    // Location list
    const list = document.getElementById('location-list');
    list.innerHTML = '';
    CONFIG.locations.forEach((loc, i) => {
        const found = state.foundLocations.includes(i);
        const item  = document.createElement('div');
        item.className = 'location-item' + (found ? ' found' : '');
        item.innerHTML =
            '<span class="location-num">' + (i + 1) + '.</span>' +
            '<span class="location-check">' + (found ? '&#9989;' : '&#11036;') + '</span>' +
            '<span class="location-name">' + escapeHTML(loc.name) + '</span>';
        list.appendChild(item);
    });
}

/* ============================================================
   QR SCANNER
   ============================================================ */
function startScanner() {
    showScreen('screen-scanner');

    // Small delay to ensure the DOM element is visible before initialising
    setTimeout(() => {
        const readerEl = document.getElementById('qr-reader');
        if (!readerEl) return;
        readerEl.innerHTML = ''; // clear any previous run

        try {
            html5QrScanner = new Html5Qrcode('qr-reader');
            html5QrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 240, height: 240 } },
                (decodedText) => handleScan(decodedText),
                () => {}  // per-frame decode errors — intentionally ignored
            ).catch(() => {
                showToast('Camera kon niet worden geopend. Geef camera-toegang en probeer opnieuw.', 'error');
                navigateToDashboard();
            });
        } catch (_) {
            showToast('Scanner kon niet worden gestart. Probeer opnieuw.', 'error');
            navigateToDashboard();
        }
    }, 120);
}

function stopScanner(callback) {
    if (!html5QrScanner) {
        if (callback) callback();
        return;
    }
    const scanner = html5QrScanner;
    html5QrScanner = null;

    scanner.stop()
        .then(() => {
            try { scanner.clear(); } catch (_) {}
        })
        .catch(() => {
            try { scanner.clear(); } catch (_) {}
        })
        .finally(() => {
            if (callback) callback();
        });
}

function handleScan(decodedText) {
    // Stop scanning immediately so it doesn't fire multiple times
    stopScanner(() => {
        const locationIndex = CONFIG.locations.findIndex(loc => loc.qrValue === decodedText);

        if (locationIndex === -1) {
            showToast('Onbekende QR-code. Dit is geen locatie van de tocht.', 'error');
            navigateToDashboard();
            return;
        }

        if (state.foundLocations.includes(locationIndex)) {
            showToast('Deze schat heb je al gevonden! Ga op zoek naar de volgende.', '');
            navigateToDashboard();
            return;
        }

        // Enforce strict order: next required index = current length
        const nextRequired = state.foundLocations.length;
        if (locationIndex !== nextRequired) {
            showToast('Je bent te vroeg. Zoek eerst de vorige locatie.', 'error');
            navigateToDashboard();
            return;
        }

        // Valid scan — update state
        state.foundLocations.push(locationIndex);
        state.points += CONFIG.locations[locationIndex].points;
        currentTreasureIndex = locationIndex;
        saveState();

        showTreasureScreen(locationIndex);
    });
}

function navigateToDashboard() {
    updateDashboard();
    showScreen('screen-dashboard');
}

/* ============================================================
   TREASURE SCREEN
   ============================================================ */
function showTreasureScreen(index) {
    const loc = CONFIG.locations[index];
    document.getElementById('treasure-title').textContent  = loc.title;
    document.getElementById('treasure-letter').textContent = '?'; // revealed after photo
    document.getElementById('treasure-points').textContent = loc.points;
    document.getElementById('treasure-task').textContent   = loc.task;

    // Suppress animation for the mystery '?'
    const letterEl = document.getElementById('treasure-letter');
    letterEl.style.animation = 'none';

    showScreen('screen-treasure');
}

/* ============================================================
   PHOTO CAPTURE
   ============================================================ */
function startCamera() {
    showScreen('screen-photo');
    resetPhotoScreen();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera wordt niet ondersteund door deze browser.', 'error');
        showTreasureScreen(currentTreasureIndex);
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(stream => {
            cameraStream = stream;
            const video  = document.getElementById('camera-preview');
            video.srcObject = stream;
        })
        .catch(() => {
            showToast('Camera kon niet worden geopend. Controleer je toestemming.', 'error');
            stopCamera();
            showTreasureScreen(currentTreasureIndex);
        });
}

function resetPhotoScreen() {
    document.getElementById('camera-container').style.display       = '';
    document.getElementById('photo-preview-container').style.display = 'none';
    document.getElementById('btn-capture').style.display            = '';
    document.getElementById('btn-photo-next').style.display         = 'none';
    document.getElementById('photo-letter-reveal').style.display    = 'none';
}

function capturePhoto() {
    const video  = document.getElementById('camera-preview');
    const canvas = document.getElementById('photo-canvas');
    const ctx    = canvas.getContext('2d');

    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;
    canvas.width  = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);

    const dataURL = canvas.toDataURL('image/jpeg', 0.72);

    stopCamera();

    // Show preview
    const img = document.getElementById('photo-preview');
    img.src = dataURL;
    document.getElementById('camera-container').style.display       = 'none';
    document.getElementById('photo-preview-container').style.display = '';
    document.getElementById('btn-capture').style.display            = 'none';
    document.getElementById('btn-photo-next').style.display         = '';

    // Persist
    state.photos[currentTreasureIndex] = dataURL;
    saveState();

    // Reveal the earned letter now that the photo task is complete
    const loc       = CONFIG.locations[currentTreasureIndex];
    const revealEl  = document.getElementById('photo-letter-reveal');
    const letterEl  = document.getElementById('photo-letter-display');
    letterEl.textContent   = loc.letter;
    letterEl.style.animation = 'none';
    void letterEl.offsetWidth; // force reflow to restart animation
    letterEl.style.animation = '';
    revealEl.style.display  = '';
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    const video = document.getElementById('camera-preview');
    if (video) video.srcObject = null;
}

function proceedAfterTreasure() {
    stopCamera();
    if (state.foundLocations.length >= CONFIG.locations.length) {
        showFinale();
    } else {
        updateDashboard();
        showScreen('screen-dashboard');
    }
}

/* ============================================================
   FINALE — Letter reveal
   ============================================================ */
function showFinale() {
    const word      = CONFIG.locations.map(l => l.letter).join('');
    const container = document.getElementById('finale-letters');
    container.innerHTML = '';

    word.split('').forEach((ch, i) => {
        const el = document.createElement('div');
        el.className         = 'letter-finale';
        el.textContent       = ch;
        el.style.animationDelay = (0.15 + i * 0.22) + 's';
        el.setAttribute('aria-label', ch);
        container.appendChild(el);
    });

    showScreen('screen-finale');
}

/* ============================================================
   FINAL QUESTION
   ============================================================ */
function submitAnswer(answer) {
    if (answer === CONFIG.correctAnswer) {
        showEndScreen();
    } else {
        showToast('Dat is niet het juiste antwoord. Probeer opnieuw!', 'error');
    }
}

/* ============================================================
   PHOTO SHARING & DOWNLOAD HELPERS
   ============================================================ */
function dataURLToBlob(dataURL) {
    const [header, data] = dataURL.split(',');
    const mime  = header.match(/:(.*?);/)[1];
    const bytes = atob(data);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

async function sharePhoto(dataURL, locationName, number) {
    try {
        const blob      = dataURLToBlob(dataURL);
        const fileName  = 'foto-' + number + '-' + locationName.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.jpg';
        const file      = new File([blob], fileName, { type: blob.type });
        const shareData = { files: [file], title: 'Foto bij ' + locationName };
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
        } else {
            await navigator.share({ title: locationName, text: "Foto van de D'Artagnanlaan wandeltocht" });
        }
    } catch (err) {
        if (err.name !== 'AbortError') showToast('Delen mislukt. Probeer de downloadknop.', 'error');
    }
}

async function shareAllPhotos(photoData) {
    try {
        const files = photoData.map(p => {
            const blob = dataURLToBlob(p.dataURL);
            const name = 'foto-' + (p.index + 1) + '-' + p.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.jpg';
            return new File([blob], name, { type: blob.type });
        });
        const shareData = { files, title: "De Verloren Schatten van d'Artagnan", text: "Mijn foto's van de wandeltocht" };
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
        } else {
            showToast("Meerdere foto's delen wordt niet ondersteund door deze browser.", 'error');
        }
    } catch (err) {
        if (err.name !== 'AbortError') showToast("Delen mislukt. Probeer de foto's individueel te delen.", 'error');
    }
}

/* ============================================================
   END SCREEN
   ============================================================ */
function showEndScreen() {
    document.getElementById('end-name').textContent   = state.playerName;
    document.getElementById('end-points').textContent = state.points;

    // Render end-screen letters (static, no animation)
    const endLetters = document.getElementById('end-letters');
    endLetters.innerHTML = '';
    CONFIG.locations.forEach(loc => {
        const el = document.createElement('div');
        el.className   = 'letter-finale';
        el.textContent = loc.letter;
        endLetters.appendChild(el);
    });

    // Photos grid
    const grid         = document.getElementById('end-photos');
    const photoActions = document.getElementById('end-photo-actions');
    grid.innerHTML         = '';
    photoActions.innerHTML = '';
    let hasPhotos = false;

    CONFIG.locations.forEach((loc, i) => {
        const dataURL = state.photos[i];
        if (!dataURL) return;
        hasPhotos = true;

        const card = document.createElement('div');
        card.className = 'photo-card';

        const img = document.createElement('img');
        img.src     = dataURL;
        img.alt     = 'Foto bij ' + loc.name;
        img.loading = 'lazy';

        const label = document.createElement('div');
        label.className   = 'photo-label';
        label.textContent = loc.name;

        const actions = document.createElement('div');
        actions.className = 'photo-actions';

        // Download as local file
        const fileName = 'foto-' + (i + 1) + '-' + loc.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.jpg';
        const btnDl = document.createElement('a');
        btnDl.className  = 'btn-photo-action';
        btnDl.href       = dataURL;
        btnDl.download   = fileName;
        btnDl.textContent = '\u2B07 Download';
        actions.appendChild(btnDl);

        if (navigator.share) {
            const btnShare = document.createElement('button');
            btnShare.className   = 'btn-photo-action';
            btnShare.textContent = '\u2B06 Delen';
            btnShare.addEventListener('click', () => sharePhoto(dataURL, loc.name, i + 1));
            actions.appendChild(btnShare);
        }

        card.appendChild(img);
        card.appendChild(label);
        card.appendChild(actions);
        grid.appendChild(card);
    });

    if (!hasPhotos) {
        const p = document.createElement('p');
        p.className   = 'no-photos-text';
        p.textContent = "Geen foto's gemaakt tijdens de tocht.";
        grid.appendChild(p);
    }

    // "Share all" when multiple photos are available
    if (hasPhotos && navigator.share) {
        const allPhotos = CONFIG.locations
            .map((loc, i) => state.photos[i] ? { dataURL: state.photos[i], name: loc.name, index: i } : null)
            .filter(Boolean);
        if (allPhotos.length > 1) {
            const btnShareAll = document.createElement('button');
            btnShareAll.className   = 'btn btn-secondary';
            btnShareAll.textContent = '\u2B06 Deel alle foto\u2019s (' + allPhotos.length + ')';
            btnShareAll.addEventListener('click', () => shareAllPhotos(allPhotos));
            photoActions.appendChild(btnShareAll);
        }
    }

    showScreen('screen-end');
}

/* ============================================================
   UTILITY
   ============================================================ */
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initEventListeners() {
    // Screen 1 — Start
    document.getElementById('btn-start').addEventListener('click', handleStart);
    document.getElementById('player-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleStart();
    });

    // Screen 2 — Dashboard
    document.getElementById('btn-scan').addEventListener('click', () => startScanner());

    // Screen 3 — Scanner
    document.getElementById('btn-stop-scan').addEventListener('click', () => {
        stopScanner(() => navigateToDashboard());
    });

    // Screen 4 — Treasure
    document.getElementById('btn-make-photo').addEventListener('click', () => startCamera());
    document.getElementById('btn-treasure-next').addEventListener('click', () => proceedAfterTreasure());

    // Screen 5 — Photo
    document.getElementById('btn-capture').addEventListener('click', () => capturePhoto());
    document.getElementById('btn-photo-next').addEventListener('click', () => proceedAfterTreasure());
    document.getElementById('btn-photo-back').addEventListener('click', () => {
        stopCamera();
        showTreasureScreen(currentTreasureIndex);
    });

    // Screen 6 — Finale
    document.getElementById('btn-goto-finale').addEventListener('click', () => showScreen('screen-question'));

    // Screen 7 — Question (event delegation; buttons rendered dynamically by applyConfigToDOM)
    document.getElementById('answer-options').addEventListener('click', e => {
        const btn = e.target.closest('.btn-answer');
        if (btn) submitAnswer(btn.dataset.answer);
    });

    // Screen 8 — End
    document.getElementById('btn-restart').addEventListener('click', () => {
        clearState();
        document.getElementById('player-name').value = '';
        showScreen('screen-start');
    });
}

/* ============================================================
   SERVICE WORKER REGISTRATION
   ============================================================ */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadState();
    applyConfigToDOM();
    initEventListeners();
    registerServiceWorker();

    // Restore session if in-progress
    if (state.playerName && state.foundLocations.length < CONFIG.locations.length) {
        document.getElementById('player-name').value = state.playerName;
        updateDashboard();
        showScreen('screen-dashboard');
    } else if (state.playerName) {
        // Completed — let them restart
        document.getElementById('player-name').value = state.playerName;
    }
});
