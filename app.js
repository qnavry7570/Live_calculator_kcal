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
    history: []             // Lista obiektów np. { date: 'YYYY-MM-DD', eaten: 2500 }
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
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ==== CORE ENGINE (spalanie & resety) ====

function checkDayReset() {
    const today = getFormattedDate(new Date());
    
    // Day changed?
    if (state.lastResetDate !== today) {
        // Zapisz do historii z dniem wczorajszym
        // Uwaga: "wczoraj" mogło być kilka dni temu, jeśli apka była trzymana offline długo. Zapiszemy pod kątem lastResetDate
        if(state.lastResetDate) {
            state.history.unshift({
                date: state.lastResetDate,
                eaten: state.dailyEaten
            });
            // Ograniczamy historię np. do 30 dni
            if(state.history.length > 30) state.history.pop();
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
        
        tName.innerText = `(${state.targetGoal} kcal)`;
        document.getElementById('valTargetStart').innerText = state.targetStart;
        document.getElementById('valTargetEnd').innerText = state.targetEnd;

        tCurrent.innerText = Math.floor(state.balance);
        tGoal.innerText = state.targetGoal;

        // Procent paska
        let pct = (state.balance / state.targetGoal) * 100;
        if(pct > 100) pct = 100;
        if(pct < 0) pct = 0;
        tProgress.style.width = `${pct}%`;

        // Calculate Target Pacing (Status czy obniża czy podwyższa)
        const diff = Math.floor(state.balance - state.targetGoal);
        if (diff > 0) {
            tStatus.innerText = `Nadwyżka ponad Cel: +${diff} kcal`;
            tStatus.className = 'target-status status-positive';
        } else {
            tStatus.innerText = `Brakuje do Celu: ${Math.abs(diff)} kcal`;
            tStatus.className = 'target-status status-negative';
        }
    } else {
        document.querySelector('.target-card').style.display = 'none';
    }

    // 3. Update History List if active
    renderHistory();
}

function renderHistory() {
    const hl = document.getElementById('historyList');
    if (state.history.length === 0) {
        hl.innerHTML = '<div class="empty-state">Brak zapisanych dni wstecz.</div>';
        return;
    }

    hl.innerHTML = state.history.map(item => `
        <div class="history-item">
            <span class="history-date">${item.date}</span>
            <span class="history-kcal">${Math.floor(item.eaten)} kcal</span>
        </div>
    `).join('');
}


// ==== NAVIGATION & MODALS ====

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Update bottom nav state
    document.querySelectorAll('.nav-item').forEach(btn => {
        if(btn.dataset.target === viewId) btn.classList.add('active');
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
        saveState();
        
        // Reset input and close
        document.getElementById('inputMealKcal').value = '';
        modal.classList.remove('active');
    }
});


// ==== INIT ====
loadState();

// Ticks (co 5 minut odpala cykl)
// Tutaj ustawione na 1 minutę (60000ms) dla precyzji działania, aktualizacja "co kropelkę" cieszy oko
setInterval(engineCycle, 60000); 

// Wykonanie natychmiast przy otwarciu
engineCycle();
