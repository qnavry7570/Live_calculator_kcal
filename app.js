// app.js

// ==== STATE MANAGEMENT ====
const STORAGE_KEY = 'kcalTrackerState';

// Default State
let state = {
    balance: 0,             // Główny bilans 24/7
    burnRate: 120,          // Spalanie na godzinę
    dailyEaten: 0,          // Zjedzone dzisiaj (resetowane o 00:00)
    targetGoal: null,       // Cel (np. 35000)
    targetStart: null,      // Data startu yyyy-mm-dd
    targetEnd: null,        // Data końca yyyy-mm-dd
    lastTickTime: null,     // Timestamp z ostatniego przeliczenia spalonych (co 5 min)
    lastResetDate: null,    // Data w formacie YYYY-MM-DD ostatniego restu "Zjedzone"
    history: [],            // Lista obiektów np. { date: 'YYYY-MM-DD', eaten: 2500 }
    digestKcal: null,       // Wielkość ostatniego posiłku (kotwica licznika trawienia)
    digestTime: null        // Timestamp dodania ostatniego posiłku
};

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        state = { ...state, ...JSON.parse(saved) };
    } else {
        // First time load
        state.lastTickTime = Date.now();
        state.lastResetDate = getFormattedDate(new Date());
        saveState();
        showSettings(); // Force user to setup
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateUI();
}

// ==== HELPERS ====
function getFormattedDate(date) {
    // Czas LOKALNY (nie UTC) - inaczej reset "o północy" wypadałby o złej godzinie
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`; // YYYY-MM-DD
}

// ==== CORE ENGINE (spalanie & resety) ====

function checkDayReset() {
    const today = getFormattedDate(new Date());

    if (state.lastResetDate !== today) {
        if (state.lastResetDate) {
            state.history.unshift({
                date: state.lastResetDate,
                eaten: state.dailyEaten,
                balanceAtMidnight: state.balance
            });
            if (state.history.length > 30) state.history.pop();
        }

        state.dailyEaten = 0;
        state.lastResetDate = today;
        saveState();
    }
}

function tickBurn() {
    if (!state.lastTickTime) {
        state.lastTickTime = Date.now();
        return;
    }

    const now = Date.now();
    const diffMs = now - state.lastTickTime;

    // Oblicz ile minut minęło (nawet jak apka była wyłączona przez kilka dni, timestamp działa)
    const diffMinutes = diffMs / (1000 * 60);

    // Spalanie na godzinę / 60 = spalanie na min
    const burnPerMin = state.burnRate / 60;

    // Ile spaliliśmy
    const burnedKcal = diffMinutes * burnPerMin;

    // Odejmij od balansu (Math.floor żeby uniknąć setnych części na UI ciągle)
    // Ale w stanie trzymamy precyzyjniej
    state.balance -= burnedKcal;
    state.lastTickTime = now;

    saveState();
}

// Odpalane przy starcie i potem interwałowo
function engineCycle() {
    checkDayReset();
    tickBurn();
}

// ==== UI UPDATES ====

function updateUI() {
    // 1. Dashboard - Balance
    document.getElementById('valBalance').innerHTML = `${Math.floor(state.balance)} <span class="unit">kcal</span>`;
    document.getElementById('valBurnRate').innerText = state.burnRate;
    document.getElementById('valDailyEaten').innerText = Math.floor(state.dailyEaten);

    // 2. Target calculations
    const tCurrent = document.getElementById('valTargetCurrent');
    const tGoal = document.getElementById('valTargetGoal');
    const tProgress = document.getElementById('targetProgress');
    const tStatus = document.getElementById('valTargetStatus');
    const tName = document.getElementById('valTargetName');

    if (state.targetGoal && state.targetStart && state.targetEnd) {
        // Jest włączony cel
        document.querySelector('.target-card').style.display = 'block';

        // Jeżeli bilans jest na minusie (-500), to dodajemy go do Targetu -> Target spada.
        // Skoro balance jest ujemne, to zwykle dodawanie ujemnych daje odejmowanie, 
        // czyli: target_obecny = targetGoal + balance (jeśli balance to -500, to wyjdzie 14500).
        // Jeśli balance to +200, to wyjdzie 15200.
        const currentTarget = state.targetGoal + state.balance;

        tName.innerText = `(Cel Główny: ${state.targetGoal} kcal)`;
        document.getElementById('valTargetStart').innerText = state.targetStart;
        document.getElementById('valTargetEnd').innerText = state.targetEnd;

        // Pokażmy Obecny Zredukowany/Powiększony Cel zamiast samego statycznego balance
        // Oraz Pasek Postępu pokaże czy dobijamy do 0.
        tCurrent.innerText = Math.floor(currentTarget);
        tGoal.innerText = state.targetGoal;

        // Pasek postępu. Postęp to to, ile z naszego Target Goal już "spaliliśmy w dół".
        // Startujemy z 15000 (0%). Chcemy zjechać do 0 (100%).
        let pct = ((state.targetGoal - currentTarget) / state.targetGoal) * 100;
        if (pct > 100) pct = 100;
        if (pct < 0) pct = 0;
        tProgress.style.width = `${pct}%`;

        // Calculate Target Pacing
        if (state.balance > 0) {
            tStatus.innerText = `Cel oddalił się o: +${Math.floor(state.balance)} kcal`;
            tStatus.className = 'target-status status-positive'; // Czerwony - cel rośnie
        } else {
            tStatus.innerText = `Cel zbliżył się o: ${Math.floor(Math.abs(state.balance))} kcal`;
            tStatus.className = 'target-status status-negative'; // Zielony - cel maleje
        }
    } else {
        document.querySelector('.target-card').style.display = 'none';
    }

    // 3. Update History List if active
    renderHistory();

    // 4. Asystent
    updateCoachUI();
}

function renderHistory() {
    const hl = document.getElementById('historyList');
    if (state.history.length === 0) {
        hl.innerHTML = '<div class="empty-state">Brak zapisanych dni wstecz.</div>';
        return;
    }

    hl.innerHTML = state.history.map(item => `
        <div class="history-item">
            <div class="history-left">
                <div class="history-date">${item.date}</div>
                <div class="history-eaten" style="font-size: 0.75rem; color: var(--text-secondary);">Zjedzono: ${Math.floor(item.eaten)} kcal</div>
            </div>
            <div class="history-kcal" style="text-align: right;">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">Bilans O 24:00</div>
                ${item.balanceAtMidnight !== undefined ? Math.floor(item.balanceAtMidnight) : '?'} kcal
            </div>
        </div>
    `).join('');
}


// ==== NAVIGATION & MODALS ====

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Update bottom nav state
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.dataset.target === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function showSettings() {
    // Wypełnij obecnymi danymi
    document.getElementById('inputInitialBalance').value = Math.floor(state.balance);
    document.getElementById('inputBurnRate').value = state.burnRate;
    document.getElementById('inputTargetGoal').value = state.targetGoal || '';
    document.getElementById('inputTargetStart').value = state.targetStart || '';
    document.getElementById('inputTargetEnd').value = state.targetEnd || '';
    switchView('viewSettings');
}

// Event Listeners
document.getElementById('btnSettings').addEventListener('click', showSettings);

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
        switchView(e.currentTarget.dataset.target);
    });
});

// Settings Submit
document.getElementById('formSettings').addEventListener('submit', (e) => {
    e.preventDefault();
    state.balance = parseFloat(document.getElementById('inputInitialBalance').value);
    state.burnRate = parseFloat(document.getElementById('inputBurnRate').value);

    const tg = document.getElementById('inputTargetGoal').value;
    state.targetGoal = tg ? parseFloat(tg) : null;
    state.targetStart = document.getElementById('inputTargetStart').value || null;
    state.targetEnd = document.getElementById('inputTargetEnd').value || null;

    // Reset timera przy nowym bilansie żeby nie doliczyło dziwnych wartości
    state.lastTickTime = Date.now();

    saveState();
    switchView('viewDashboard');
});

// Add Meal Logic
const modal = document.getElementById('modalAddMeal');
document.getElementById('btnAddMeal').addEventListener('click', () => {
    modal.classList.add('active');
});

document.getElementById('btnCloseModal').addEventListener('click', () => {
    modal.classList.remove('active');
});

document.getElementById('formAddMeal').addEventListener('submit', (e) => {
    e.preventDefault();
    const kcal = parseFloat(document.getElementById('inputMealKcal').value);
    if (!isNaN(kcal) && kcal > 0) {
        state.balance += kcal;
        state.dailyEaten += kcal;

        // Licznik trawienia startuje od nowa od właśnie dodanego posiłku
        state.digestKcal = kcal;
        state.digestTime = Date.now();
        updateDigestUI();

        saveState();

        // Reset input and close
        document.getElementById('inputMealKcal').value = '';
        modal.classList.remove('active');
    }
});


// ==== LICZNIK TRAWIENIA / SPALANIA OSTATNIEGO POSIŁKU ====
function formatHMS(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(s)}`;
}

function updateDigestUI() {
    const valEl = document.getElementById('digestValue');
    const timerEl = document.getElementById('digestTimer');
    const stateEl = document.getElementById('digestState');
    if (!valEl) return;

    // Brak posiłku albo brak sensownego spalania -> stan spoczynku
    if (!state.digestKcal || !state.digestTime || state.burnRate <= 0) {
        valEl.className = 'balance-mega digest-value';
        valEl.innerHTML = `--<span class="unit">kcal</span>`;
        timerEl.className = 'digest-timer';
        timerEl.innerText = '--:--:--';
        stateEl.innerText = 'Dodaj posiłek, aby uruchomić licznik';
        return;
    }

    const burnPerMs = state.burnRate / (60 * 60 * 1000); // kcal na milisekundę
    const elapsedMs = Date.now() - state.digestTime;
    const remaining = state.digestKcal - elapsedMs * burnPerMs;

    if (remaining > 0) {
        // CZERWONY: jeszcze trawisz, odliczanie w dół do zera
        const msToZero = remaining / burnPerMs;
        valEl.className = 'balance-mega digest-value red';
        valEl.innerHTML = `${Math.ceil(remaining)}<span class="unit">kcal</span>`;
        timerEl.className = 'digest-timer red';
        timerEl.innerText = formatHMS(msToZero);
        stateEl.innerText = `Spalasz posiłek ${state.digestKcal} kcal — zostało do strawienia`;
    } else {
        // ZIELONY: posiłek spalony, licznik leci w górę (deficyt rośnie)
        const deficit = -remaining;
        const msSinceZero = deficit / burnPerMs;
        valEl.className = 'balance-mega digest-value green';
        valEl.innerHTML = `${Math.floor(deficit)}<span class="unit">kcal</span>`;
        timerEl.className = 'digest-timer green';
        timerEl.innerText = `+${formatHMS(msSinceZero)}`;
        stateEl.innerText = `Posiłek ${state.digestKcal} kcal spalony — jesteś na deficycie`;
    }
}


// ==== ASYSTENT / COACH ====
const MEAL_REMINDER_HOURS = 5;  // po ilu h bez posiłku przypominać
const MIN_DAILY_EAT = 1200;     // bezpieczne minimum kcal/dzień (guardrail)
const ROLLOVER_DAYS = 7;        // z ilu dni liczyć korektę budżetu

function formatAgo(ms) {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h ${m}min temu`;
    return `${m}min temu`;
}

// Wpisy historii z liczbowym bilansem o północy (najnowsze pierwsze)
function getMidnightPoints() {
    return state.history.filter(h => typeof h.balanceAtMidnight === 'number');
}

// Średnia dzienna zmiana bilansu (ujemna = deficyt); null gdy za mało danych
function getDailyRate() {
    const pts = getMidnightPoints();
    if (pts.length < 2) return null;
    const newest = pts[0];
    const oldest = pts[pts.length - 1];
    const spanDays = Math.max(1, (new Date(newest.date) - new Date(oldest.date)) / 86400000);
    return (newest.balanceAtMidnight - oldest.balanceAtMidnight) / spanDays;
}

function fmtDayMonth(d) {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function updateCoachUI() {
    const mainEl = document.getElementById('coachMain');
    const rollEl = document.getElementById('coachRollover');
    const foreEl = document.getElementById('coachForecast');
    const trendEl = document.getElementById('coachTrend');
    const sparkEl = document.getElementById('coachSparkline');
    const trendStatsEl = document.getElementById('coachTrendStats');
    const listEl = document.getElementById('coachList');
    if (!mainEl) return;

    if (!state.burnRate || state.burnRate <= 0) {
        mainEl.className = 'coach-main';
        mainEl.innerText = 'Ustaw spalanie (kcal/h) w ustawieniach, aby zacząć.';
        rollEl.innerText = '';
        foreEl.className = 'coach-forecast';
        foreEl.innerText = '';
        trendEl.classList.add('hidden');
        listEl.innerHTML = '';
        return;
    }

    const dailyBurn = state.burnRate * 24;
    let baseAllowance = dailyBurn; // domyślnie: jedz tyle ile spalasz (bilans 0)
    let hasTarget = false, requiredDailyDeficit = 0, currentTarget = 0, end = null, daysLeft = 0;

    if (state.targetGoal && state.targetStart && state.targetEnd) {
        hasTarget = true;
        const start = new Date(state.targetStart + 'T00:00:00');
        end = new Date(state.targetEnd + 'T23:59:59');
        const totalDays = Math.max(1, (end - start) / 86400000);
        requiredDailyDeficit = state.targetGoal / totalDays;
        baseAllowance = dailyBurn - requiredDailyDeficit;
        currentTarget = state.targetGoal + state.balance; // ile deficytu jeszcze brakuje
        daysLeft = Math.max(0, Math.ceil((end - new Date()) / 86400000));
    }

    // ===== B: ADAPTACYJNY BUDŻET (ROLLOVER) =====
    // Sumuj odchylenia (limit - zjedzone) z ostatnich dni: zapas (+) lub dług (-)
    let bank = 0, used = 0;
    for (const h of state.history) {
        if (used >= ROLLOVER_DAYS) break;
        if (typeof h.eaten === 'number') { bank += (baseAllowance - h.eaten); used++; }
    }
    bank = Math.max(-baseAllowance, Math.min(baseAllowance, bank)); // korekta max ±1 dzień

    let adjusted = baseAllowance + bank;
    let safetyRaised = false;
    if (adjusted < MIN_DAILY_EAT) { adjusted = MIN_DAILY_EAT; safetyRaised = true; }

    const canEat = adjusted - state.dailyEaten;

    if (canEat > 50) {
        mainEl.className = 'coach-main green';
        mainEl.innerText = `Możesz dziś zjeść jeszcze ~${Math.floor(canEat)} kcal 🍽️`;
    } else if (canEat < -50) {
        mainEl.className = 'coach-main red';
        mainEl.innerText = `Przekroczono dzisiejszy limit o ${Math.floor(-canEat)} kcal.`;
    } else {
        mainEl.className = 'coach-main green';
        mainEl.innerText = 'Idealnie — jesteś dokładnie na dzisiejszym limicie.';
    }

    if (safetyRaised) {
        rollEl.className = 'coach-rollover warn';
        rollEl.innerText = `Limit podniesiony do bezpiecznego minimum ${MIN_DAILY_EAT} kcal.`;
    } else if (Math.abs(bank) > 50) {
        const sign = bank > 0 ? '+' : '';
        const why = bank > 0 ? 'zapas z poprzednich dni' : 'nadrabiasz wcześniejsze nadwyżki';
        rollEl.className = 'coach-rollover';
        rollEl.innerText = `Korekta: ${sign}${Math.round(bank)} kcal (${why}) • bazowy limit ${Math.round(baseAllowance)} kcal`;
    } else {
        rollEl.className = 'coach-rollover';
        rollEl.innerText = `Dzisiejszy limit: ${Math.round(adjusted)} kcal`;
    }

    // ===== A: PROGNOZA CELU =====
    const rate = getDailyRate(); // ujemna = deficyt
    foreEl.className = 'coach-forecast';
    foreEl.innerText = '';
    if (hasTarget) {
        if (currentTarget <= 0) {
            foreEl.className = 'coach-forecast good';
            foreEl.innerText = '🎉 Cel osiągnięty! Możesz ustawić nowy w ustawieniach.';
        } else if (rate === null) {
            foreEl.innerText = `Do celu brakuje ${Math.floor(currentTarget)} kcal deficytu (${daysLeft} dni). Prognoza pojawi się po ~2 dniach historii.`;
        } else if (rate < -1) {
            const daysToGoal = currentTarget / (-rate);
            const proj = new Date(Date.now() + daysToGoal * 86400000);
            const diffDays = Math.round((end - proj) / 86400000);
            if (diffDays >= 0) {
                foreEl.className = 'coach-forecast good';
                foreEl.innerText = `📈 Prognoza: cel ok. ${fmtDayMonth(proj)} — ${diffDays} dni przed terminem. Tempo: ${Math.round(-rate)} kcal/dzień.`;
            } else {
                const needed = Math.ceil(currentTarget / Math.max(1, daysLeft));
                foreEl.className = 'coach-forecast bad';
                foreEl.innerText = `⚠️ Prognoza: cel ok. ${fmtDayMonth(proj)} — ${-diffDays} dni po terminie. Przyśpiesz do ~${needed} kcal deficytu/dzień.`;
            }
        } else {
            const needed = Math.ceil(currentTarget / Math.max(1, daysLeft));
            foreEl.className = 'coach-forecast bad';
            foreEl.innerText = `⚠️ Bilans nie spada — przy tym tempie nie osiągniesz celu. Potrzebujesz ~${needed} kcal deficytu/dzień.`;
        }
    }

    // ===== C: TREND I STREAK =====
    const pts = getMidnightPoints();
    if (pts.length >= 2) {
        trendEl.classList.remove('hidden');

        // Sparkline (od najstarszego do najnowszego)
        const vals = pts.slice().reverse().map(p => p.balanceAtMidnight);
        const min = Math.min(...vals), max = Math.max(...vals);
        const range = (max - min) || 1;
        const n = vals.length;
        const coords = vals.map((v, i) => {
            const x = n > 1 ? (i / (n - 1)) * 100 : 50;
            const y = 30 - ((v - min) / range) * 28 + 1; // wyższy bilans = wyżej
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        sparkEl.innerHTML = `<polyline points="${coords}" />`;

        // Streak dni w deficycie (od najnowszego) + najlepszy dzień
        let streak = 0, best = 0, streakActive = true;
        for (let i = 0; i < pts.length - 1; i++) {
            const delta = pts[i].balanceAtMidnight - pts[i + 1].balanceAtMidnight;
            if (streakActive && delta < 0) streak++; else streakActive = false;
            if (delta < best) best = delta;
        }
        const avg = rate !== null ? Math.round(-rate) : 0; // dodatnia = deficyt

        trendStatsEl.innerHTML = `
            <div class="trend-stat"><span class="ts-value">${avg}</span><span class="ts-label">śr. deficyt/dzień</span></div>
            <div class="trend-stat"><span class="ts-value">${streak} 🔥</span><span class="ts-label">dni deficytu</span></div>
            <div class="trend-stat"><span class="ts-value">${Math.round(-best)}</span><span class="ts-label">najlepszy dzień</span></div>
        `;
    } else {
        trendEl.classList.add('hidden');
    }

    // ===== Przypomnienie o posiłku + cel =====
    const items = [];
    if (state.digestTime) {
        const ago = Date.now() - state.digestTime;
        const isLate = ago > MEAL_REMINDER_HOURS * 3600000;
        items.push(['ri-time-line',
            `Ostatni posiłek: ${formatAgo(ago)}${isLate ? ' — czas coś zjeść!' : ''}`, isLate]);
    } else {
        items.push(['ri-time-line', 'Nie zalogowano jeszcze żadnego posiłku — dodaj wpis.', true]);
    }
    if (hasTarget && currentTarget > 0) {
        items.push(['ri-flag-line',
            `Do celu: ${Math.floor(currentTarget)} kcal deficytu • zostało ${daysLeft} dni`, false]);
    }

    listEl.innerHTML = items.map(([icon, text, alert]) =>
        `<div class="coach-item${alert ? ' alert' : ''}"><i class="${icon}"></i><span>${text}</span></div>`
    ).join('');
}


// ==== KALKULATOR 2: LIMIT TYGODNIOWY CLAUDE CODE ====
// Reset tygodnia: niedziela o 17:00 (czas lokalny).
const CLAUDE_KEY = 'claudeWeeklyState';
const CLAUDE_RESET_DAY = 0;   // 0 = niedziela (Date.getDay(): 0=ndz ... 6=sob)
const CLAUDE_RESET_HOUR = 17; // 17:00
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CLAUDE_TOLERANCE = 1.5; // margines "idealnego tempa" w punktach %

let claudeState = { actualPct: null };

function loadClaudeState() {
    const saved = localStorage.getItem(CLAUDE_KEY);
    if (saved) claudeState = { ...claudeState, ...JSON.parse(saved) };
}

function saveClaudeState() {
    localStorage.setItem(CLAUDE_KEY, JSON.stringify(claudeState));
}

// Zwraca info o obecnym tygodniu rozliczeniowym
function getClaudeWeek() {
    const now = new Date();

    // Znajdź ostatnią niedzielę o 17:00 (start bieżącego tygodnia)
    const reset = new Date(now);
    reset.setHours(CLAUDE_RESET_HOUR, 0, 0, 0);
    // Cofnij do dnia resetu (niedziela)
    let daysBack = (reset.getDay() - CLAUDE_RESET_DAY + 7) % 7;
    reset.setDate(reset.getDate() - daysBack);
    // Jeśli wyszło w przyszłości (np. niedziela przed 17:00) - cofnij o tydzień
    if (reset > now) reset.setDate(reset.getDate() - 7);

    const elapsed = now - reset;
    const next = new Date(reset.getTime() + WEEK_MS);
    let expectedPct = (elapsed / WEEK_MS) * 100;
    if (expectedPct > 100) expectedPct = 100;
    if (expectedPct < 0) expectedPct = 0;

    return { expectedPct, reset, next, elapsed };
}

function formatCountdown(ms) {
    if (ms < 0) ms = 0;
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    return `${d}d ${h}h ${m}m`;
}

function updateClaudeUI() {
    const { expectedPct, next, elapsed } = getClaudeWeek();

    document.getElementById('claudeExpected').innerHTML =
        `${expectedPct.toFixed(1)}<span class="unit">%</span>`;
    document.getElementById('claudeExpectedBar').style.width = `${expectedPct}%`;
    document.getElementById('claudeExpectedLabel').innerText = `${expectedPct.toFixed(1)}%`;

    const timeLeft = next - new Date();
    document.getElementById('claudeResetInfo').innerHTML =
        `Reset: niedziela 17:00 &bull; za ${formatCountdown(timeLeft)}`;

    const statusEl = document.getElementById('claudeStatus');
    const projEl = document.getElementById('claudeProjection');
    const actual = claudeState.actualPct;

    if (actual === null || actual === undefined || isNaN(actual)) {
        statusEl.className = 'target-status';
        statusEl.innerText = 'Wpisz swój % aby porównać z planem';
        projEl.innerText = '';
        return;
    }

    // diff > 0 => zużywasz SZYBCIEJ niż plan (ryzyko wyczerpania) => zwolnij (czerwony)
    // diff < 0 => masz zapas (wolniej niż plan) => możesz przyspieszyć (zielony)
    const diff = actual - expectedPct;

    if (diff > CLAUDE_TOLERANCE) {
        statusEl.className = 'target-status status-positive'; // czerwony
        statusEl.innerText = `⚠ Za szybko o ${diff.toFixed(1)} pkt% — ZWOLNIJ`;
    } else if (diff < -CLAUDE_TOLERANCE) {
        statusEl.className = 'target-status status-negative'; // zielony
        statusEl.innerText = `✓ Zapas ${Math.abs(diff).toFixed(1)} pkt% — możesz PRZYSPIESZYĆ`;
    } else {
        statusEl.className = 'target-status status-negative'; // zielony
        statusEl.innerText = `✓ Idealne tempo (różnica ${diff.toFixed(1)} pkt%)`;
    }

    // Projekcja: przy obecnym tempie ile % wyjdzie na koniec tygodnia
    const elapsedFrac = elapsed / WEEK_MS;
    if (elapsedFrac > 0.01 && actual > 0) {
        const projected = actual / elapsedFrac;
        if (projected > 100.5) {
            projEl.innerText =
                `Przy tym tempie wyczerpiesz 100% limitu jeszcze przed resetem ` +
                `(prognoza ~${projected.toFixed(0)}% gdyby tempo się utrzymało).`;
        } else {
            projEl.innerText =
                `Przy tym tempie zużyjesz ~${projected.toFixed(0)}% limitu do resetu.`;
        }
    } else {
        projEl.innerText = '';
    }
}

document.getElementById('inputClaudeActual').addEventListener('input', (e) => {
    const v = e.target.value;
    claudeState.actualPct = (v === '' ? null : parseFloat(v));
    saveClaudeState();
    updateClaudeUI();
});

loadClaudeState();
if (claudeState.actualPct !== null && claudeState.actualPct !== undefined) {
    document.getElementById('inputClaudeActual').value = claudeState.actualPct;
}
updateClaudeUI();
// Odświeżanie "na żywo" co sekundę (plan tempa rośnie płynnie)
setInterval(updateClaudeUI, 1000);

// Licznik trawienia również odświeżany co sekundę
updateDigestUI();
setInterval(updateDigestUI, 1000);

// Asystent odświeżany co 30s (czas "od ostatniego posiłku" + przypomnienia)
setInterval(updateCoachUI, 30000);


// ==== INIT ====
loadState();

// Ticks (co 5 minut odpala cykl)
// Tutaj ustawione na 1 minutę (60000ms) dla precyzji działania, aktualizacja "co kropelkę" cieszy oko
setInterval(engineCycle, 60000);

// Wykonanie natychmiast przy otwarciu
engineCycle();
