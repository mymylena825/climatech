import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJbkfuryRyDq5eHCTQ0XLtGNuuuOyml-4",
    projectId: "app-clima-3a002"
};

const STORAGE_KEYS = {
    settings: "climate-settings",
    readings: "climate-readings",
    theme: "dashboard-theme",
    palette: "dashboard-palette",
    minTemp: "min-temp",
    maxTemp: "max-temp"
};

const palettes = {
    violet: { bg: "#09051b", bgAccent: "#1c0d3d", surface: "rgba(19, 12, 48, .95)", surfaceStrong: "#21134c", surfaceContrast: "#2b1b5d", border: "rgba(173, 124, 255, .38)", accent: "#b78cff", temp: "#ff6b9d", humid: "#58c7ff" },
    teal: { bg: "#031316", bgAccent: "#073936", surface: "rgba(5, 39, 42, .95)", surfaceStrong: "#0a4c4c", surfaceContrast: "#0e5e5b", border: "rgba(61, 224, 194, .38)", accent: "#48f0c1", temp: "#ff7180", humid: "#55d5ff" },
    sunset: { bg: "#1b0a08", bgAccent: "#4a1d15", surface: "rgba(57, 24, 19, .95)", surfaceStrong: "#61291b", surfaceContrast: "#783821", border: "rgba(255, 157, 90, .4)", accent: "#ffad5c", temp: "#ff6680", humid: "#6ac6ed" },
    forest: { bg: "#04120c", bgAccent: "#0a3322", surface: "rgba(7, 41, 27, .95)", surfaceStrong: "#0d5132", surfaceContrast: "#146541", border: "rgba(113, 222, 133, .38)", accent: "#9cf06b", temp: "#ff956b", humid: "#62d6df" },
    graphite: { bg: "#080b10", bgAccent: "#202832", surface: "rgba(25, 31, 39, .96)", surfaceStrong: "#303a46", surfaceContrast: "#3d4854", border: "rgba(190, 207, 220, .34)", accent: "#c7e6f2", temp: "#ff7883", humid: "#72c9e8" },
    cosmic: { bg: "#10051d", bgAccent: "#32104e", surface: "rgba(35, 12, 57, .95)", surfaceStrong: "#481872", surfaceContrast: "#5b2387", border: "rgba(216, 139, 255, .4)", accent: "#e3a2ff", temp: "#ff729e", humid: "#72c7ff" }
};

const elements = {
    canvas: document.getElementById("meuGrafico"),
    themeToggle: document.getElementById("themeToggle"),
    toggleIcon: document.querySelector(".toggle-icon"),
    toggleLabel: document.querySelector(".toggle-label"),
    alertBanner: document.getElementById("alertBanner"),
    minTemp: document.getElementById("minTemp"),
    maxTemp: document.getElementById("maxTemp"),
    stationName: document.getElementById("stationName"),
    historyNote: document.getElementById("historyNote"),
    welcomeModal: document.getElementById("welcomeModal"),
    setupForm: document.getElementById("setupForm"),
    stationInput: document.getElementById("stationInput"),
    intervalInput: document.getElementById("intervalInput")
};

const assistantProfiles = {
    bummy: { name: "Bummy", avatar: "👩🏻‍🚀", message: "Atenção: sistema operando normalmente. Temperatura estável." },
    riftan: { name: "Dr. Riftan", avatar: "🧑🏻‍🔬", message: "Análise concluída: as condições climáticas estão dentro do padrão." }
};

const context = elements.canvas.getContext("2d");
let chart = null;
let readings = loadReadings();
let simulationTimer = null;
let latestSensorReadingReceived = false;

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function extractValue(value) {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") return Number.parseFloat(value) || 0;
    if (typeof value === "object") {
        if (typeof value.toMillis === "function") return value.toMillis();
        return Number(value.doubleValue ?? value.integerValue ?? value.stringValue ?? 0) || 0;
    }
    return 0;
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function updateClock() {
    const now = new Date();
    document.getElementById("liveClock").textContent = now.toLocaleTimeString("pt-BR");
    document.getElementById("liveDate").textContent = now.toLocaleDateString("pt-BR");
}

function selectAssistant(key) {
    const profile = assistantProfiles[key];
    if (!profile) return;
    document.querySelectorAll(".assistant-card").forEach((card) => {
        card.classList.toggle("active", card.dataset.assistant === key);
    });
    document.getElementById("assistantMessage").textContent = profile.message;
    document.getElementById("messageAvatar").textContent = profile.avatar;
    localStorage.setItem("selected-assistant", key);
}

function loadReadings() {
    const stored = readJson(STORAGE_KEYS.readings, []);
    return Array.isArray(stored) ? stored.filter((item) => Number.isFinite(item.temperatura) && Number.isFinite(item.umidade)) : [];
}

function readingKey(reading) {
    return `${reading.timestamp}-${reading.temperatura}-${reading.umidade}`;
}

function saveReadings(newReadings) {
    // Mantém um histórico local limitado e sem duplicidades.
    const unique = new Map();
    [...readings, ...newReadings].forEach((reading) => unique.set(readingKey(reading), reading));
    readings = [...unique.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
    saveJson(STORAGE_KEYS.readings, readings);
    return readings;
}

function getSettings() {
    const settings = readJson(STORAGE_KEYS.settings, {});
    return {
        station: settings.station || "Estação IoT",
        interval: Math.max(2, Math.min(3600, Number(settings.interval) || 10))
    };
}

function showSetupModal() {
    const settings = readJson(STORAGE_KEYS.settings, {});
    elements.stationInput.value = settings.station || "";
    elements.intervalInput.value = settings.interval || 10;
    elements.welcomeModal.hidden = false;
    elements.stationInput.focus();
}

function initializeSetup() {
    const settings = getSettings();
    elements.stationName.textContent = settings.station;
    if (!localStorage.getItem(STORAGE_KEYS.settings)) showSetupModal();

    if (!elements.setupForm) return;
    elements.setupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const station = elements.stationInput.value.trim() || "Estação IoT";
        const interval = Math.max(2, Math.min(3600, Number(elements.intervalInput.value) || 10));
        saveJson(STORAGE_KEYS.settings, { station, interval, configuredAt: new Date().toISOString() });
        elements.stationName.textContent = station;
        elements.intervalInput.value = interval;
        elements.welcomeModal.hidden = true;
        startSimulation();
    });
}

function applyTheme(theme) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = activeTheme;
    localStorage.setItem(STORAGE_KEYS.theme, activeTheme);
    if (elements.toggleIcon) elements.toggleIcon.textContent = activeTheme === "dark" ? "☀️" : "🌙";
    if (elements.toggleLabel) elements.toggleLabel.textContent = activeTheme === "dark" ? "Modo claro" : "Modo escuro";
    renderChart();
}

function applyPalette(name) {
    const activePalette = palettes[name] ? name : "violet";
    Object.entries(palettes[activePalette]).forEach(([variable, value]) => {
        const cssVariable = variable.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        document.body.style.setProperty(`--${cssVariable}`, value);
    });
    localStorage.setItem(STORAGE_KEYS.palette, activePalette);
    document.querySelectorAll(".palette-button").forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.palette === activePalette ? "true" : "false");
    });
    renderChart();
}

function updateAlert(reading) {
    const minimum = Number(elements.minTemp.value);
    const maximum = Number(elements.maxTemp.value);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
        elements.alertBanner.className = "alert-banner is-visible low";
        elements.alertBanner.textContent = "Defina um limite mínimo menor que o limite máximo.";
        return;
    }
    elements.alertBanner.className = "alert-banner";
    if (reading.temperatura >= maximum) {
        elements.alertBanner.classList.add("is-visible", "high");
        elements.alertBanner.textContent = `⚠ Temperatura muito alta: ${reading.temperatura.toFixed(1)} °C (limite ${maximum.toFixed(1)} °C)`;
    } else if (reading.temperatura <= minimum) {
        elements.alertBanner.classList.add("is-visible", "low");
        elements.alertBanner.textContent = `❄ Temperatura muito baixa: ${reading.temperatura.toFixed(1)} °C (limite ${minimum.toFixed(1)} °C)`;
    }
}

function updateAnalysis(recentReadings) {
    const temperatures = recentReadings.map((reading) => reading.temperatura);
    if (!temperatures.length) return;
    const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
    document.getElementById("tempMedia").textContent = `${average.toFixed(1)} °C`;
    document.getElementById("tempMaxima").textContent = `${Math.max(...temperatures).toFixed(1)} °C`;
    document.getElementById("tempMinima").textContent = `${Math.min(...temperatures).toFixed(1)} °C`;
}

function renderChart() {
    // O gráfico é recriado para acompanhar tema e paleta sem perder os dados.
    if (!readings.length || typeof Chart === "undefined") return;
    const recent = readings.slice(-10);
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text").trim();
    const mutedColor = style.getPropertyValue("--muted").trim();
    const gridColor = style.getPropertyValue("--chart-grid").trim();
    const tempColor = style.getPropertyValue("--temp").trim();
    const humidColor = style.getPropertyValue("--humid").trim();
    const temperatureGradient = context.createLinearGradient(0, 0, 0, 340);
    const humidityGradient = context.createLinearGradient(0, 0, 0, 340);
    temperatureGradient.addColorStop(0, `${tempColor}73`);
    temperatureGradient.addColorStop(1, `${tempColor}05`);
    humidityGradient.addColorStop(0, `${humidColor}61`);
    humidityGradient.addColorStop(1, `${humidColor}05`);

    if (chart) chart.destroy();
    chart = new Chart(context, {
        type: "line",
        data: {
            labels: recent.map((reading) => reading.hora),
            datasets: [
                {
                    label: "Temperatura °C",
                    data: recent.map((reading) => reading.temperatura),
                    borderColor: tempColor,
                    backgroundColor: temperatureGradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: tempColor,
                    pointBorderWidth: 0
                },
                {
                    label: "Umidade %",
                    data: recent.map((reading) => reading.umidade),
                    borderColor: humidColor,
                    backgroundColor: humidityGradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.38,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: humidColor,
                    pointBorderWidth: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true, padding: 18, boxWidth: 10, font: { weight: "600" } } },
                tooltip: { backgroundColor: "rgba(15, 23, 42, 0.92)", titleColor: "#ffffff", bodyColor: "#e2e8f0", padding: 12 }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: mutedColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, border: { display: false } },
                y: { grid: { color: gridColor }, ticks: { color: mutedColor }, border: { display: false } }
            }
        }
    });
}

function updateDashboard() {
    if (!readings.length) return;
    const recent = readings.slice(-10);
    const current = recent[recent.length - 1];
    document.getElementById("tempAtual").textContent = `${current.temperatura.toFixed(1)} °C`;
    document.getElementById("umidAtual").textContent = `${current.umidade.toFixed(1)} %`;
    document.querySelector(".metric-card.temp .metric-bar span").style.width = `${Math.min(100, Math.max(4, (current.temperatura / 45) * 100))}%`;
    document.querySelector(".metric-card.humid .metric-bar span").style.width = `${Math.min(100, Math.max(4, current.umidade))}%`;
    elements.historyNote.textContent = `${readings.length} leitura(s) armazenada(s) localmente. O gráfico exibe as 10 mais recentes.`;
    updateAlert(current);
    updateAnalysis(recent);
    renderChart();
}

function createSimulatedReading() {
    const previous = readings[readings.length - 1];
    const baseTemperature = previous?.temperatura ?? 24;
    const temperature = Math.max(-5, Math.min(45, baseTemperature + (Math.random() - 0.5) * 1.4));
    const baseHumidity = previous?.umidade ?? 65;
    const humidity = Math.max(15, Math.min(98, baseHumidity + (Math.random() - 0.5) * 5));
    const timestamp = Date.now();
    return { timestamp, hora: formatTime(timestamp), temperatura: temperature, umidade: humidity, origem: "simulado" };
}

function startSimulation() {
    // A simulação funciona como fallback enquanto nenhum sensor envia dados.
    if (simulationTimer || latestSensorReadingReceived || !elements.welcomeModal.hidden) return;
    const interval = getSettings().interval * 1000;
    const addReading = () => {
        if (latestSensorReadingReceived) return;
        saveReadings([createSimulatedReading()]);
        updateDashboard();
    };
    if (!readings.length) addReading();
    simulationTimer = setInterval(addReading, interval);
}

function stopSimulation() {
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = null;
}

function connectToFirebase() {
    // Quando o Firebase falha ou está vazio, o painel continua operando localmente.
    try {
        const app = initializeApp(firebaseConfig);
        const database = getFirestore(app);
        const readingsQuery = query(collection(database, "leituras"), orderBy("timestamp", "desc"), limit(10));
        onSnapshot(readingsQuery, (snapshot) => {
            if (snapshot.empty) {
                startSimulation();
                return;
            }
            latestSensorReadingReceived = true;
            stopSimulation();
            const sensorReadings = snapshot.docs.map((doc) => {
                const data = doc.data();
                const timestampValue = extractValue(data.timestamp);
                const timestamp = timestampValue > 10000000000 ? timestampValue : timestampValue * 1000;
                return {
                    timestamp,
                    hora: formatTime(timestamp),
                    temperatura: extractValue(data.temperatura),
                    umidade: extractValue(data.umidade),
                    origem: "sensor"
                };
            });
            saveReadings(sensorReadings.reverse());
            updateDashboard();
        }, (error) => {
            console.warn("Firebase indisponível; usando dados simulados.", error);
            startSimulation();
        });
    } catch (error) {
        console.warn("Não foi possível conectar ao Firebase; usando dados simulados.", error);
        startSimulation();
    }
}

function initializeControls() {
    const preferredTheme = localStorage.getItem(STORAGE_KEYS.theme) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    elements.minTemp.value = localStorage.getItem(STORAGE_KEYS.minTemp) || "10";
    elements.maxTemp.value = localStorage.getItem(STORAGE_KEYS.maxTemp) || "35";
    applyTheme(preferredTheme);
    applyPalette(localStorage.getItem(STORAGE_KEYS.palette) || "violet");

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
    }
    document.querySelectorAll(".palette-button").forEach((button) => {
        button.addEventListener("click", () => applyPalette(button.dataset.palette));
    });
    [elements.minTemp, elements.maxTemp].forEach((input) => {
        input.addEventListener("change", () => {
            const key = input === elements.minTemp ? STORAGE_KEYS.minTemp : STORAGE_KEYS.maxTemp;
            localStorage.setItem(key, input.value);
            if (readings.length) updateAlert(readings[readings.length - 1]);
        });
    });

    document.querySelectorAll(".assistant-card").forEach((card) => {
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.addEventListener("click", (event) => {
            if (event.target.closest(".assistant-select") || event.target.closest(".assistant-card")) {
                selectAssistant(card.dataset.assistant);
            }
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectAssistant(card.dataset.assistant);
            }
        });
    });
    const savedAssistant = localStorage.getItem("selected-assistant");
    selectAssistant(assistantProfiles[savedAssistant] ? savedAssistant : "bummy");
}

initializeControls();
initializeSetup();
updateClock();
setInterval(updateClock, 1000);
updateDashboard();
connectToFirebase();