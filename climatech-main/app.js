import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const NOME_PADRAO = "Laboratório Central";
const INTERVALO_PADRAO = 10000;

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
    connectionLed: document.getElementById("connectionLed"),
    connectionLabel: document.getElementById("connectionLabel"),
    toast: document.getElementById("toast"),
    notificationsModal: document.getElementById("notificationsModal"),
    notificationList: document.getElementById("notificationList"),
    notificationSummary: document.getElementById("notificationSummary"),
    markNotificationsRead: document.getElementById("markNotificationsRead"),
    clearNotifications: document.getElementById("clearNotifications"),
    testAlarm: document.getElementById("testAlarm"),
    calibrationModal: document.getElementById("calibrationModal"),
    calibrationForm: document.getElementById("calibrationForm"),
    temperatureCorrection: document.getElementById("temperatureCorrection"),
    humidityCorrection: document.getElementById("humidityCorrection"),
    calibrationPreview: document.getElementById("calibrationPreview"),
    tempTrend: document.getElementById("tempTrend"),
    humidityTrend: document.getElementById("humidityTrend"),
    chatMessages: document.getElementById("chat-mensagens"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-enviar"),
    welcomeModal: document.getElementById("welcomeModal"),
    setupForm: document.getElementById("setupForm"),
    stationInput: document.getElementById("stationInput"),
    intervalInput: document.getElementById("intervalInput")
    ,comfortModal: document.getElementById("comfortModal")
    ,comfortForm: document.getElementById("comfortForm")
    ,comfortTemperature: document.getElementById("comfortTemperature")
    ,comfortHumidity: document.getElementById("comfortHumidity")
    ,comfortResult: document.getElementById("comfortResult")
    ,heatIndexValue: document.getElementById("heatIndexValue")
    ,heatIndexDescription: document.getElementById("heatIndexDescription")
    ,heatIndexMarker: document.getElementById("heatIndexMarker")
};

const assistantProfiles = {
    climabot: { name: "Clima-Bot", message: "Olá, tudo bem?" }
};

const context = elements.canvas.getContext("2d");
let chart = null;
let analyticsCharts = {};
let readings = loadReadings();
let simulationTimer = null;
let latestSensorReadingReceived = false;
const savedUnit = localStorage.getItem("climate-unit");
let currentUnit = savedUnit === "F" || savedUnit === "fahrenheit" ? "F" : "C";
let displayUnit = currentUnit === "F" ? "fahrenheit" : "celsius";
let calibration = readJson("climate-calibration", { temperature: 0, humidity: 0 });
let toastTimer = null;
let connectionTimeout = null;
let chartPeriod = localStorage.getItem("chart-period") || "hour";
let notifications = readJson("climate-notifications", [
    { message: "Sistema operando normalmente", time: "Monitoramento contínuo" },
    { message: "Alerta de baixa umidade em análise", time: "Central meteorológica" },
    { message: "Temperatura acima da média monitorada", time: "Estação Climatech" }
]).map(normalizeNotification);
let alertState = { criticalTemperature: false, criticalHumidity: false, warningTemperature: false, warningHumidity: false };

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

function normalizeNotification(item) {
    const severity = ["critical", "warning", "info"].includes(item?.severity) ? item.severity : "info";
    const timestamp = item?.timestamp || (item?.time && !Number.isNaN(Date.parse(item.time)) ? new Date(item.time).toISOString() : new Date().toISOString());
    return { id: item?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message: item?.message || "Evento do sistema", severity, timestamp, read: item?.read === true };
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

function getDisplayReading(reading) {
    const temperature = reading.temperatura + Number(calibration.temperature || 0);
    const humidity = Math.min(100, Math.max(0, reading.umidade + Number(calibration.humidity || 0)));
    return { ...reading, temperatura: temperature, umidade: humidity };
}

function formatTemperature(value) {
    if (displayUnit === "fahrenheit") return `${((value * 9) / 5 + 32).toFixed(1)} °F`;
    return `${value.toFixed(1)} °C`;
}

function chartTemperature(value) {
    return displayUnit === "fahrenheit" ? (value * 9) / 5 + 32 : value;
}

function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function setConnectionStatus(isConnected) {
    if (!elements.connectionLed) return;
    clearTimeout(connectionTimeout);
    elements.connectionLed.classList.toggle("is-connected", isConnected);
    elements.connectionLed.setAttribute("aria-label", isConnected ? "Conexão Arduino ativa" : "Falha de comunicação com o Arduino");
    if (elements.connectionLabel) elements.connectionLabel.textContent = isConnected ? "Arduino: conexão ativa" : "Arduino: falha de comunicação";
    if (isConnected) connectionTimeout = setTimeout(() => setConnectionStatus(false), 15000);
}

function addNotification(message, severity = "info") {
    notifications.unshift(normalizeNotification({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message, severity, timestamp: new Date().toISOString(), read: false }));
    notifications = notifications.slice(0, 20);
    saveJson("climate-notifications", notifications);
    renderNotifications();
}

function renderNotifications() {
    if (!elements.notificationList) return;
    const severityLabels = { critical: "Crítico", warning: "Atenção", info: "Informação" };
    const severityIcons = { critical: "!", warning: "⚠", info: "i" };
    elements.notificationList.replaceChildren(...(notifications.length ? notifications.map((item) => {
        const listItem = document.createElement("li");
        listItem.className = `notification-item severity-${item.severity}${item.read ? "" : " is-unread"}`;
        const icon = document.createElement("span");
        icon.className = "notification-icon";
        icon.textContent = severityIcons[item.severity];
        icon.setAttribute("aria-hidden", "true");
        const content = document.createElement("div");
        content.className = "notification-content";
        const header = document.createElement("header");
        const label = document.createElement("strong");
        label.className = "notification-severity";
        label.textContent = severityLabels[item.severity];
        header.append(label);
        const message = document.createElement("p");
        message.textContent = item.message;
        const time = document.createElement("time");
        time.dateTime = item.timestamp;
        time.textContent = new Date(item.timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
        content.append(header, message, time);
        listItem.append(icon, content);
        return listItem;
    }) : [Object.assign(document.createElement("li"), { className: "notification-empty", textContent: "Nenhuma notificação registrada." })]));
    const unread = notifications.filter((item) => !item.read).length;
    if (elements.notificationSummary) elements.notificationSummary.textContent = unread ? `${unread} alerta(s) pendente(s) · ${notifications.length} evento(s) no histórico` : `${notifications.length} evento(s) no histórico · tudo lido`;
}

function markNotificationsAsRead() {
    notifications = notifications.map((item) => ({ ...item, read: true }));
    saveJson("climate-notifications", notifications);
    renderNotifications();
    showToast("Alertas marcados como lidos.");
}

function clearNotifications() {
    notifications = [];
    saveJson("climate-notifications", notifications);
    renderNotifications();
    showToast("Central de alertas limpa.");
}

function testAlarm() {
    addNotification("Alarme de laboratório simulado: temperatura crítica detectada acima do limite.", "critical");
    showToast("Alarme de teste disparado.");
}

function evaluateReadingAlerts(reading) {
    const current = getDisplayReading(reading);
    const nextState = {
        criticalTemperature: current.temperatura > 28,
        criticalHumidity: current.umidade < 30,
        warningTemperature: current.temperatura > 26 && current.temperatura <= 28,
        warningHumidity: current.umidade >= 30 && current.umidade < 40
    };
    if (nextState.criticalTemperature && !alertState.criticalTemperature) addNotification(`Temperatura crítica: ${current.temperatura.toFixed(1)} °C. Limite de segurança ultrapassado.`, "critical");
    if (nextState.criticalHumidity && !alertState.criticalHumidity) addNotification(`Umidade crítica: ${current.umidade.toFixed(1)}%. Ventilação e hidratação do ambiente recomendadas.`, "critical");
    if (nextState.warningTemperature && !alertState.warningTemperature) addNotification(`Atenção: temperatura atípica de ${current.temperatura.toFixed(1)} °C em acompanhamento.`, "warning");
    if (nextState.warningHumidity && !alertState.warningHumidity) addNotification(`Atenção: umidade reduzida em ${current.umidade.toFixed(1)}%.`, "warning");
    alertState = nextState;
}

function appendChatMessage(message, type = "assistente") {
    if (!elements.chatMessages) return;
    const messageElement = document.createElement("div");
    messageElement.className = `chat-mensagem${type === "usuario" ? " usuario" : ""}`;
    messageElement.textContent = message;
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    return messageElement;
}

function getAssistantResponse(question) {
    const normalizedQuestion = question
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const searchableQuestion = ` ${normalizedQuestion.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
    const temperature = document.getElementById("tempAtual")?.textContent || "indisponível";
    const humidity = document.getElementById("umidAtual")?.textContent || "indisponível";
    const humidityValue = Number.parseFloat(humidity.replace(",", "."));
    const aqiText = document.querySelector(".aqi-value")?.textContent || "33";
    const aqiValue = Number.parseFloat(aqiText.replace(",", ".")) || 33;
    const alertIsActive = elements.alertBanner?.classList.contains("is-visible");
    const alertMessage = alertIsActive
        ? elements.alertBanner.textContent
        : "No momento, não há alertas meteorológicos ativos.";
    const mentions = (...terms) => terms.some((term) => searchableQuestion.includes(` ${term} `) || normalizedQuestion.includes(term));

    if (mentions("oi", "ola", "bom dia", "boa tarde", "boa noite", "tudo bem", "como voce esta")) {
        return "Olá, tudo bem? Eu sou o Clima-Bot, o sistema inteligente do Climatech. Posso ajudar com as leituras da estação, previsões e explicações meteorológicas.";
    }
    if (mentions("quem e voce", "quem voce e", "seu nome", "clima bot", "climabot")) {
        return "Sou o Clima-Bot, assistente inteligente do Climatech. Combino atendimento amigável com análise técnica de meteorologia e climatologia para interpretar os dados da estação.";
    }
    if (mentions("ajuda", "o que voce pode fazer", "como funciona", "painel", "dashboard", "climatech")) {
        return "O Climatech monitora a estação meteorológica, reúne leituras dos sensores em tempo real, exibe histórico, previsões e alertas. Também posso explicar umidade, qualidade do ar, pressão, vento e conforto térmico.";
    }

    if (mentions("qualidade do ar", "aqi", "poluicao", "poluente", "particulas", "ozonio", "ozônio")) {
        if (aqiValue <= 50) {
            return `O AQI atual é ${aqiValue}, faixa boa. A concentração estimada de partículas inaláveis e ozônio está em nível que, em geral, apresenta baixo risco à saúde. Pessoas muito sensíveis ainda devem observar sintomas em exposições prolongadas.`;
        }
        if (aqiValue <= 100) {
            return `O AQI atual é ${aqiValue}, faixa moderada. Partículas inaláveis e ozônio podem afetar pessoas sensíveis; grupos com asma, idosos e crianças devem reduzir esforço intenso ao ar livre se houver desconforto.`;
        }
        if (aqiValue <= 150) {
            return `O AQI atual é ${aqiValue}, faixa prejudicial para grupos sensíveis. A combinação de partículas inaláveis e ozônio pode agravar problemas respiratórios; reduza atividade intensa ao ar livre e acompanhe os alertas.`;
        }
        return `O AQI atual é ${aqiValue}, faixa de atenção elevada. Poluentes como partículas inaláveis e ozônio podem afetar a população em geral; priorize ambientes ventilados com filtragem e siga orientações das autoridades de saúde.`;
    }

    if (mentions("umidade", "umido", "umida", "seco", "ar seco", "desidratacao", "mucosa")) {
        const currentStatus = Number.isFinite(humidityValue) ? ` A leitura atual é ${humidity}.` : "";
        return `Atenção aos níveis de umidade.${currentStatus} Com índices abaixo de 30%, o ar seco irrita as mucosas respiratórias e aumenta o risco de desidratação. Recomenda-se o uso de umidificadores e hidratação constante.`;
    }

    if (mentions("sensacao termica", "sensacao", "temperatura aparente", "conforto termico", "conforto")) {
        return `A sensação térmica é a temperatura aparente percebida pelo corpo, não apenas a temperatura medida no sensor. Em calor e umidade elevados, a evaporação do suor fica menos eficiente e o corpo parece mais quente; vento e ar seco aceleram a evaporação e podem aumentar o resfriamento percebido.`;
    }

    if (mentions("vento", "velocidade do vento", "rajada", "evaporacao")) {
        return "O vento altera a troca de calor entre a pele e o ambiente. Em dias quentes, ele pode acelerar a evaporação do suor e aliviar o calor; em dias frios, remove a camada de ar aquecida junto à pele e reduz a sensação térmica. A temperatura real continua sendo a medida do ar, enquanto a aparente combina vento, umidade e temperatura.";
    }

    if (mentions("pressao", "pressão", "atmosferica", "atmosférica", "hpa", "barometro")) {
        const pressure = document.getElementById("pressure")?.textContent || "indisponível";
        return `A pressão atmosférica resulta do peso da coluna de ar sobre a superfície e é expressa em hPa. A leitura disponível é ${pressure}. Quedas persistentes podem acompanhar a aproximação de sistemas instáveis, enquanto pressão mais alta costuma estar associada a maior estabilidade, mas a interpretação deve considerar a tendência e outros sensores.`;
    }

    if (mentions("maxima", "minima", "temperatura", "calor", "frio", "graus")) {
        if (mentions("maxima")) {
            return `A leitura atual do painel está em ${temperature}. Para hoje, esse é o melhor indicador disponível neste momento; continuarei acompanhando o sensor para identificar a tendência de máxima.`;
        }
        if (mentions("minima")) {
            return `A temperatura atual registrada é ${temperature}. Ainda não há uma mínima calculada separadamente no painel, mas posso acompanhar a evolução das próximas leituras com você.`;
        }
        return `A temperatura atual registrada pelo sensor é de ${temperature}. Posso também acompanhar a umidade, os alertas e a evolução das próximas leituras.`;
    }
    if (mentions("clima", "tempo", "sol", "chuva", "chover", "previsao", "amanha")) {
        return `As condições monitoradas no Centro de Tecnologia Avançada indicam ${temperature} e umidade de ${humidity}. Não há alerta meteorológico ativo no momento. Continuarei observando a estação para atualizar você sobre sol, chuva e mudanças no tempo.`;
    }
    if (mentions("alerta", "inmet", "aviso", "risco")) {
        return `Status meteorológico: ${alertMessage}`;
    }
    if (mentions("sistema", "firebase", "sensor", "conectado", "operando", "funcionando", "status", "monitoramento")) {
        return "O sistema está operando normalmente, com monitoramento ativo e leituras sincronizadas com a estação. Posso interpretar os dados atuais ou explicar o significado de cada indicador.";
    }
    if (mentions("obrigado", "obrigada", "valeu", "grato", "grata")) {
        return "Por nada! O Clima-Bot está à disposição para consultar os dados da estação meteorológica.";
    }
    return `Vou analisar essa questão como especialista do Climatech. No momento, a estação indica ${temperature} e umidade de ${humidity}. Posso detalhar conforto térmico, umidade, qualidade do ar, pressão atmosférica, vento ou alertas; diga qual indicador deseja investigar.`;
}

function initializeChat() {
    if (!elements.chatForm || !elements.chatInput) return;
    const internalQuestions = ["Como está a qualidade do ar?", "A sala está muito quente?", "Como está a umidade?", "O ambiente está confortável?"];
    document.querySelectorAll(".quick-prompt").forEach((button, index) => {
        if (internalQuestions[index]) {
            button.dataset.question = internalQuestions[index];
            button.textContent = internalQuestions[index];
        }
        button.addEventListener("click", () => {
            elements.chatInput.value = button.dataset.question || "";
            elements.chatForm.requestSubmit();
        });
    });
    elements.chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const question = elements.chatInput.value.trim();
        if (!question) return;
        appendChatMessage(question, "usuario");
        elements.chatInput.value = "";
        elements.chatInput.disabled = true;
        if (elements.chatSend) elements.chatSend.disabled = true;
        const thinkingMessage = appendChatMessage("Analisando leitura da estação...", "assistente");
        thinkingMessage?.classList.add("pensando");
        setTimeout(() => {
            thinkingMessage?.remove();
            appendChatMessage(getAssistantResponse(question));
            elements.chatInput.disabled = false;
            if (elements.chatSend) elements.chatSend.disabled = false;
            elements.chatInput.focus();
        }, 500);
    });
}

function initializeMascot() {
    const avatar = document.querySelector(".assistant-avatar");
    if (!avatar) return;
    avatar.setAttribute("aria-label", "Avatar do robô assistente Clima-Bot");
    avatar.innerHTML = `<svg viewBox="0 0 96 112" aria-hidden="true"><path class="robot-outline" d="M48 15V7m-6 0h12M48 7l-5-5m5 5 5-5"/><path class="robot-shell" d="M25 25h46a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H25a12 12 0 0 1-12-12V37a12 12 0 0 1 12-12Z"/><path class="robot-panel" d="M23 35h50v18H23z"/><path class="robot-outline" d="M19 42h-7m72 0h-7M28 25v-5m40 5v-5"/><circle class="robot-led" cx="36" cy="44" r="4"/><circle class="robot-led" cx="60" cy="44" r="4"/><path class="robot-outline" d="M39 54c5 3 13 3 18 0"/><path class="robot-shell" d="M30 71h36l8 11v22H22V82l8-11Z"/><path class="robot-outline" d="M30 76h36M28 88h40M34 104V93m28 11V93M22 84l-8 9m60-9 8 9"/><path class="robot-panel" d="M40 80h16v16H40z"/><circle class="robot-core" cx="48" cy="88" r="5"/><path class="robot-outline" d="M48 83v10m-5-5h10"/></svg>`;
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
        station: settings.station || NOME_PADRAO,
        interval: Math.max(2, Math.min(3600, Number(settings.interval) || INTERVALO_PADRAO / 1000))
    };
}

function initializeSetup(station = NOME_PADRAO, intervalMs = INTERVALO_PADRAO) {
    const settings = getSettings();
    if (!localStorage.getItem(STORAGE_KEYS.settings)) {
        saveJson(STORAGE_KEYS.settings, {
            station,
            interval: intervalMs / 1000,
            configuredAt: new Date().toISOString()
        });
    }
    const activeSettings = localStorage.getItem(STORAGE_KEYS.settings) ? getSettings() : { station, interval: intervalMs / 1000 };
    elements.stationName.textContent = activeSettings.station;
    elements.welcomeModal.hidden = true;

    if (!elements.setupForm) return;
    elements.setupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const station = elements.stationInput.value.trim() || NOME_PADRAO;
        const interval = Math.max(2, Math.min(3600, Number(elements.intervalInput.value) || 10));
        saveJson(STORAGE_KEYS.settings, { station, interval, configuredAt: new Date().toISOString() });
        elements.stationName.textContent = station;
        elements.intervalInput.value = interval;
        elements.welcomeModal.hidden = true;
        startSimulation();
    });
    startSimulation(activeSettings.interval * 1000);
}

function applyTheme(theme) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = activeTheme;
    localStorage.setItem(STORAGE_KEYS.theme, activeTheme);
    if (elements.toggleIcon) elements.toggleIcon.textContent = activeTheme === "dark" ? "☀️" : "🌙";
    if (elements.toggleLabel) elements.toggleLabel.textContent = activeTheme === "dark" ? "Modo claro" : "Modo escuro";
    if (elements.themeToggle) elements.themeToggle.setAttribute("aria-pressed", activeTheme === "light" ? "true" : "false");
    renderChart();
    renderAnalyticsCharts();
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
    renderAnalyticsCharts();
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
    if (reading.umidade < 30) {
        elements.alertBanner.classList.add("is-visible", "low");
        elements.alertBanner.textContent = `⚠ Baixa umidade detectada: ${reading.umidade.toFixed(1)}%. Acompanhe a hidratação do ambiente.`;
    } else if (reading.temperatura >= maximum) {
        elements.alertBanner.classList.add("is-visible", "high");
        elements.alertBanner.textContent = `⚠ Temperatura crítica: ${reading.temperatura.toFixed(1)} °C. Redobre a atenção ao conforto térmico.`;
    } else if (reading.temperatura <= minimum) {
        elements.alertBanner.classList.add("is-visible", "low");
        elements.alertBanner.textContent = `❄ Temperatura muito baixa: ${reading.temperatura.toFixed(1)} °C (limite ${minimum.toFixed(1)} °C)`;
    }
}

function updateAnalysis(recentReadings) {
    const temperatures = recentReadings.map((reading) => getDisplayReading(reading).temperatura);
    if (!temperatures.length) return;
    const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
    document.getElementById("tempMedia").textContent = formatTemperature(average);
    document.getElementById("tempMaxima").textContent = formatTemperature(Math.max(...temperatures));
    document.getElementById("tempMinima").textContent = formatTemperature(Math.min(...temperatures));
}

function updateTrend(element, currentValue, previousValue, label) {
    if (!element) return;
    const difference = currentValue - previousValue;
    const direction = Math.abs(difference) < 0.05 ? "stable" : difference > 0 ? "up" : "down";
    const icon = direction === "up" ? "▲" : direction === "down" ? "▼" : "➔";
    const description = direction === "up" ? "em alta" : direction === "down" ? "em queda" : "estável";
    element.className = `metric-trend ${direction}`;
    element.textContent = icon;
    element.setAttribute("aria-label", `${label} ${description}`);
}

function getPeriodReadings() {
    const now = Date.now();
    const limits = { hour: 60 * 60 * 1000, today: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000 };
    const filtered = readings.filter((reading) => reading.timestamp >= now - (limits[chartPeriod] || limits.hour));
    return (filtered.length ? filtered : readings).slice(-30);
}

function calculateHeatIndex(temperature, humidity) {
    const fahrenheit = temperature * 9 / 5 + 32;
    if (fahrenheit < 80) return temperature;
    const index = -42.379 + 2.04901523 * fahrenheit + 10.14333127 * humidity - 0.22475541 * fahrenheit * humidity - 0.00683783 * fahrenheit ** 2 - 0.05481717 * humidity ** 2 + 0.00122874 * fahrenheit ** 2 * humidity + 0.00085282 * fahrenheit * humidity ** 2 - 0.00000199 * fahrenheit ** 2 * humidity ** 2;
    return (index - 32) * 5 / 9;
}

function updateHeatIndex(reading) {
    if (!elements.heatIndexValue) return;
    const heatIndex = calculateHeatIndex(reading.temperatura, reading.umidade);
    const level = heatIndex < 27 ? "Confortável" : heatIndex < 32 ? "Atenção ao calor" : heatIndex < 41 ? "Desconforto elevado" : "Risco de calor";
    elements.heatIndexValue.textContent = `${heatIndex.toFixed(1)} °C`;
    elements.heatIndexDescription.textContent = `${level} · calculada com ${reading.umidade.toFixed(1)}% de umidade.`;
    elements.heatIndexMarker.style.left = `${Math.min(100, Math.max(3, ((heatIndex - 15) / 35) * 100))}%`;
}

function updateWindIndicator(reading) {
    const value = Number(reading.ventoVelocidade ?? reading.velocidadeVento ?? reading.vento ?? 12);
    const directionIndex = Number(reading.ventoDirecaoIndex ?? reading.direcaoVentoIndex);
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Number.isFinite(directionIndex) ? Math.round(directionIndex) % directions.length : Math.floor(Date.now() / 10000) % directions.length;
    const direction = directions[(index + directions.length) % directions.length];
    const valueElement = document.getElementById("windValue");
    const directionElement = document.getElementById("windDirection");
    const pointer = document.getElementById("windPointer");
    if (valueElement) valueElement.innerHTML = `${Math.max(0, value).toFixed(0)} <small>km/h</small>`;
    if (directionElement) directionElement.textContent = direction;
    if (pointer) pointer.style.setProperty("--wind-angle", `${index * 45}deg`);
}

function renderChart() {
    // O gráfico é recriado para acompanhar tema e paleta sem perder os dados.
    if (!readings.length || typeof Chart === "undefined") return;
    const recent = getPeriodReadings();
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text").trim() || "#effbfc";
    const mutedColor = style.getPropertyValue("--muted").trim() || "#789095";
    const gridColor = style.getPropertyValue("--chart-grid").trim() || "rgba(128,193,202,.2)";
    const tempColor = style.getPropertyValue("--temp").trim() || "#ff5b68";
    const humidColor = style.getPropertyValue("--humid").trim() || "#36c9ff";
    const displayReadings = recent.map(getDisplayReading);
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
                    label: `Temperatura °${displayUnit === "fahrenheit" ? "F" : "C"}`,
                    data: displayReadings.map((reading) => chartTemperature(reading.temperatura)),
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
                    data: displayReadings.map((reading) => reading.umidade),
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

function renderAnalyticsCharts() {
    const analyticsPage = document.getElementById("pagina-graficos");
    if (!analyticsPage || analyticsPage.hidden || !readings.length || typeof Chart === "undefined") return;
    Object.values(analyticsCharts).forEach((instance) => instance.destroy());
    analyticsCharts = {};

    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text").trim() || "#effbfc";
    const mutedColor = style.getPropertyValue("--muted").trim() || "#789095";
    const gridColor = style.getPropertyValue("--chart-grid").trim() || "rgba(128,193,202,.2)";
    const tempColor = style.getPropertyValue("--temp").trim() || "#ff5b68";
    const humidColor = style.getPropertyValue("--humid").trim() || "#36c9ff";
    const displayReadings = readings.slice(-30).map(getDisplayReading);
    const temperatureValues = displayReadings.map((reading) => chartTemperature(reading.temperatura));
    const humidityValues = displayReadings.map((reading) => reading.umidade);
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor, usePointStyle: true } }, tooltip: { backgroundColor: "rgba(15,23,42,.94)", titleColor: "#fff", bodyColor: "#e2e8f0" } }, scales: { x: { grid: { display: false }, ticks: { color: mutedColor, maxTicksLimit: 8 }, border: { display: false } }, y: { grid: { color: gridColor }, ticks: { color: mutedColor }, border: { display: false } } } };
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const getHour = (reading) => new Date(reading.timestamp).getHours();
    const morning = displayReadings.filter((reading) => getHour(reading) >= 5 && getHour(reading) < 12).map((reading) => chartTemperature(reading.temperatura));
    const afternoon = displayReadings.filter((reading) => getHour(reading) >= 12 && getHour(reading) < 19).map((reading) => chartTemperature(reading.temperatura));
    const fallback = temperatureValues.length ? [average(temperatureValues)] : [0];
    const morningStats = [average(morning) || fallback[0], morning.length ? Math.max(...morning) : fallback[0]];
    const afternoonStats = [average(afternoon) || fallback[0], afternoon.length ? Math.max(...afternoon) : fallback[0]];

    analyticsCharts.main = new Chart(document.getElementById("chartPrincipal"), { type: "line", data: { labels: displayReadings.map((reading) => reading.hora), datasets: [{ label: `Temperatura °${displayUnit === "fahrenheit" ? "F" : "C"}`, data: temperatureValues, borderColor: humidColor, backgroundColor: `${humidColor}1a`, borderWidth: 3, fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: humidColor }] }, options: { ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } } });
    analyticsCharts.shifts = new Chart(document.getElementById("chartTurnos"), { type: "bar", data: { labels: ["Média", "Pico Máx"], datasets: [{ label: "Manhã", data: morningStats, backgroundColor: `${humidColor}dd`, borderColor: humidColor, borderWidth: 1, borderRadius: 6 }, { label: "Tarde", data: afternoonStats, backgroundColor: "#facc15dd", borderColor: "#facc15", borderWidth: 1, borderRadius: 6 }] }, options: chartOptions });
    analyticsCharts.comparison = new Chart(document.getElementById("chartComparativo"), {
        type: "line",
        data: {
            labels: displayReadings.map((reading) => reading.hora),
            datasets: [
                {
                    label: `Temp (°${displayUnit === "fahrenheit" ? "F" : "C"})`,
                    data: temperatureValues,
                    borderColor: "#ff5b68",
                    backgroundColor: "rgba(255,91,104,.1)",
                    borderWidth: 2,
                    tension: .4,
                    pointRadius: 3
                },
                {
                    label: "Umidade (%)",
                    data: humidityValues,
                    borderColor: "#36c9ff",
                    backgroundColor: "rgba(54,201,255,.1)",
                    borderWidth: 2,
                    tension: .4,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, usePointStyle: true } }
            },
            scales: chartOptions.scales
        }
    });
}

function mostrarPagina(nomeDaPagina) {
    const paginas = document.querySelectorAll(".pagina-conteudo");
    paginas.forEach((pagina) => {
        pagina.hidden = true;
        pagina.classList.remove("active");
    });

    const paginaAlvo = document.getElementById(`pagina-${nomeDaPagina}`);
    if (!paginaAlvo) return;
    paginaAlvo.hidden = false;
    paginaAlvo.classList.add("active");
    document.querySelectorAll(".side-nav button[data-page]").forEach((button) => button.classList.toggle("is-active", button.dataset.page === nomeDaPagina));

    if (nomeDaPagina === "graficos") renderAnalyticsCharts();
}

function showDashboardPage(page) {
    mostrarPagina(page);
}

function updateDashboard() {
    if (!readings.length) return;
    const recent = readings.slice(-10);
    const current = getDisplayReading(recent[recent.length - 1]);
    const previous = recent.length > 1 ? getDisplayReading(recent[recent.length - 2]) : current;
    document.getElementById("tempAtual").textContent = formatTemperature(current.temperatura);
    document.getElementById("umidAtual").textContent = `${current.umidade.toFixed(1)} %`;
    const detailHumidity = document.getElementById("detailHumidity");
    if (detailHumidity) detailHumidity.innerHTML = `${current.umidade.toFixed(1)} <small>% atual</small>`;
    updateTrend(elements.tempTrend, current.temperatura, previous.temperatura, "Temperatura");
    updateTrend(elements.humidityTrend, current.umidade, previous.umidade, "Umidade");
    updateHeatIndex(current);
    updateWindIndicator(current);
    document.querySelector(".current-condition-card")?.classList.toggle("humidity-alert", current.umidade < 30);
    const temperatureForBar = displayUnit === "fahrenheit" ? chartTemperature(current.temperatura) : current.temperatura;
    const temperatureBar = document.querySelector(".current-condition-card .metric-bar span");
    if (temperatureBar) temperatureBar.style.width = `${Math.min(100, Math.max(4, (temperatureForBar / (displayUnit === "fahrenheit" ? 113 : 45)) * 100))}%`;
    elements.historyNote.textContent = `${readings.length} leitura(s) armazenada(s) localmente. O gráfico exibe as 10 mais recentes.`;
    updateAlert(current);
    updateAnalysis(recent);
    renderChart();
    renderAnalyticsCharts();
    evaluateReadingAlerts(recent[recent.length - 1]);
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

function startSimulation(intervalMs = getSettings().interval * 1000) {
    // A simulação funciona como fallback enquanto nenhum sensor envia dados.
    if (simulationTimer || latestSensorReadingReceived || !elements.welcomeModal.hidden) return;
    const addReading = () => {
        if (latestSensorReadingReceived) return;
        saveReadings([createSimulatedReading()]);
        updateDashboard();
    };
    if (!readings.length) addReading();
    simulationTimer = setInterval(addReading, intervalMs);
}

function stopSimulation() {
    if (simulationTimer) clearInterval(simulationTimer);
    simulationTimer = null;
}

function createRefreshReading() {
    const timestamp = Date.now();
    return {
        timestamp,
        hora: formatTime(timestamp),
        temperatura: Number((18 + Math.random() * 8).toFixed(1)),
        umidade: Number((55 + Math.random() * 20).toFixed(1)),
        origem: "atualização manual"
    };
}

function refreshData(button) {
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    showToast("Sincronizando com a Estação Meteorológica...");
    setTimeout(() => {
        saveReadings([createRefreshReading()]);
        updateDashboard();
        addNotification("Dados atualizados com sucesso!");
        showToast("Sincronizando com a Estação Meteorológica... Dados atualizados com sucesso!");
        button.classList.remove("is-loading");
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
    }, 1000);
}

function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector("input")?.focus();
}

function closeModal(modal) {
    if (modal) modal.hidden = true;
}

function toggleUnits() {
    currentUnit = currentUnit === "C" ? "F" : "C";
    displayUnit = currentUnit === "F" ? "fahrenheit" : "celsius";
    localStorage.setItem("climate-unit", currentUnit);
    updateDashboard();
    showToast(`Unidade alterada para °${currentUnit}.`);
}

function downloadBackup() {
    const backup = readings.map(getDisplayReading).map((reading) => ({
        ...reading,
        temperatura: Number(chartTemperature(reading.temperatura).toFixed(2)),
        unidade: displayUnit === "fahrenheit" ? "°F" : "°C"
    }));
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `climatech-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addNotification("Backup realizado com sucesso!");
    showToast("Backup realizado com sucesso!");
}

function getMetricType(card) {
    const label = card.querySelector(".detail-metric-head span:last-child")?.textContent.trim().toLowerCase();
    if (label?.includes("chuva")) return "rain";
    if (label?.includes("vento")) return "wind";
    if (label?.includes("umidade")) return "humidity";
    return "air";
}

function createHumidityDetail() {
    const current = readings.length ? getDisplayReading(readings[readings.length - 1]).umidade : 45;
    const source = readings.slice(-5).map((reading) => getDisplayReading(reading).umidade);
    const values = Array.from({ length: 5 }, (_, index) => source[index] ?? Math.min(98, Math.max(15, current + (index - 2) * 2)));
    const labels = readings.slice(-5).map((reading) => reading.hora).concat(["Agora"]).slice(-5);
    const minimum = Math.min(...values) - 2;
    const maximum = Math.max(...values) + 2;
    const points = values.map((value, index) => `${4 + index * 28},${52 - ((value - minimum) / Math.max(1, maximum - minimum)) * 40}`).join(" ");
    const dots = values.map((value, index) => `<circle cx="${4 + index * 28}" cy="${52 - ((value - minimum) / Math.max(1, maximum - minimum)) * 40}" r="3"/>`).join("");
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    return `<div><div class="metric-detail-meta"><span>Média do dia</span><strong>${average.toFixed(1)}%</strong></div><div class="hourly-chart"><svg viewBox="0 0 116 58" role="img" aria-label="Variação horária da umidade"><polyline points="${points}"/>${dots}</svg><div class="hourly-labels">${labels.map((label) => `<span>${label}</span>`).join("")}</div><div class="hourly-values">${values.map((value) => `<span>${value.toFixed(0)}%</span>`).join("")}</div></div></div>`;
}

function createMetricDetail(type) {
    if (type === "humidity") return createHumidityDetail();
    if (type === "wind") {
        const hours = [{ time: "Agora", value: 12, direction: "→" }, { time: "17h", value: 14, direction: "↗" }, { time: "18h", value: 11, direction: "↑" }, { time: "19h", value: 9, direction: "↖" }, { time: "20h", value: 8, direction: "←" }];
        return `<div><div class="metric-detail-meta"><span>Velocidade média</span><strong>10,8 km/h</strong></div><div class="wind-hours">${hours.map((hour) => `<span class="wind-hour"><span>${hour.time}</span><i class="wind-arrow" aria-hidden="true">${hour.direction}</i><strong>${hour.value} km/h</strong></span>`).join("")}</div></div>`;
    }
    if (type === "rain") return `<div><div class="metric-detail-meta"><span>Próximas horas</span><strong>20% de chance</strong></div><p class="detail-status"><i></i>Baixa probabilidade de chuva. Condições favoráveis para atividades externas.</p></div>`;
    return `<div><div class="metric-detail-meta"><span>Índice atual</span><strong>33 · Boa</strong></div><p class="detail-status"><i></i>Qualidade do ar adequada para a rotina e sem alerta de poluentes.</p></div>`;
}

function initializeMetricAccordions() {
    const firstMetric = document.querySelector(".climate-metrics .detail-metric");
    if (firstMetric) {
        firstMetric.innerHTML = `<div class="detail-metric-head"><span class="detail-metric-icon" aria-hidden="true">CO2</span><span>Nível de CO2</span></div><strong class="detail-metric-value">620 <small>ppm local</small></strong><svg class="metric-sparkline" viewBox="0 0 120 43" preserveAspectRatio="none" aria-hidden="true"><path d="M0 36L15 31L30 34L45 20L60 25L75 13L90 18L105 8L120 12V43H0Z"/><polyline points="0,36 15,31 30,34 45,20 60,25 75,13 90,18 105,8 120,12"/></svg>`;
    }
    document.querySelectorAll(".climate-metrics .detail-metric").forEach((card) => {
        const type = getMetricType(card);
        card.classList.add("is-expandable");
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-expanded", "false");
        const chevron = document.createElement("span");
        chevron.className = "metric-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "⌄";
        const detail = document.createElement("div");
        detail.className = "metric-detail-panel";
        detail.innerHTML = createMetricDetail(type);
        card.append(chevron, detail);
        const toggle = () => {
            const willExpand = !card.classList.contains("is-expanded");
            document.querySelectorAll(".detail-metric.is-expanded").forEach((openCard) => {
                openCard.classList.remove("is-expanded");
                openCard.setAttribute("aria-expanded", "false");
            });
            if (willExpand) {
                if (type === "humidity") detail.innerHTML = createHumidityDetail();
                card.classList.add("is-expanded");
                card.setAttribute("aria-expanded", "true");
            }
        };
        card.addEventListener("click", (event) => {
            if (!event.target.closest(".metric-expand")) toggle();
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
            }
        });
    });
}

function initializeForecastCards() {
    const forecastTitle = document.querySelector(".forecast-panel .section-title");
    const forecastSubtitle = document.querySelector(".forecast-panel .section-heading small");
    if (forecastTitle) forecastTitle.textContent = "Previsão da semana";
    if (forecastSubtitle) forecastSubtitle.textContent = "PRÓXIMOS 5 DIAS";
    const forecastData = [
        { day: "SEG", condition: "sunny", high: 32, low: 23, label: "Ensolarado e quente", curve: "0,46 18,38 36,26 54,12 72,7 90,18 108,34 120,43" },
        { day: "TER", condition: "cloudy", high: 29, low: 20, label: "Parcialmente nublado", curve: "0,45 18,39 36,28 54,17 72,12 90,22 108,35 120,42" },
        { day: "QUA", condition: "rain", high: 24, low: 18, label: "Chuva passageira", curve: "0,44 18,38 36,31 54,22 72,25 90,31 108,39 120,43" },
        { day: "QUI", condition: "overcast", high: 26, low: 19, label: "Nublado", curve: "0,45 18,40 36,30 54,21 72,18 90,25 108,36 120,42" },
        { day: "SEX", condition: "cold", high: 18, low: 12, label: "Frio e ventoso", curve: "0,46 18,42 36,34 54,24 72,20 90,28 108,39 120,45" }
    ];
    const iconMarkup = (condition) => {
        if (condition === "sunny") return `<div class="icone-clima sol-animado" aria-hidden="true"></div>`;
        if (condition === "rain") return `<div class="icone-clima chuva-animada" aria-hidden="true"><i></i><i></i><i></i></div>`;
        if (condition === "cold") return `<div class="icone-clima frio-animado" aria-hidden="true">❄</div>`;
        return `<div class="icone-clima ${condition === "overcast" ? "nublado-animado" : "parcial-animado"}" aria-hidden="true"><i></i><i></i></div>`;
    };
    document.querySelectorAll(".forecast-list .forecast-card").forEach((card, index) => {
        const forecast = forecastData[index % forecastData.length];
        const dayKey = forecast.day.toLowerCase();
        const icon = { sunny: "☀️", cloudy: "⛅", rain: "🌧️", overcast: "☁️", cold: "❄️" }[forecast.condition];
        const curveDots = forecast.curve.split(" ").map((point) => {
            const [cx, cy] = point.split(",");
            return `<circle cx="${cx}" cy="${cy}" r="2.5"/>`;
        }).join("");
        card.className = `forecast-card card-previsao ${forecast.condition}`;
        card.setAttribute("aria-label", `${forecast.day}: ${forecast.label}, máxima de ${forecast.high} graus e mínima de ${forecast.low} graus`);
        card.innerHTML = `<span class="dia-semana">${forecast.day}</span><button class="toggle-arrow" type="button" aria-label="Expandir detalhes de ${forecast.day}" aria-expanded="false"><span aria-hidden="true">⌄</span></button><div class="icone-container" id="icone-${dayKey}" aria-hidden="true">${icon}</div><div class="temp-container"><span class="temp-max" id="max-${dayKey}">${forecast.high}°</span><span class="temp-min" id="min-${dayKey}">/ ${forecast.low}°</span></div><div class="day-details"><div class="hourly-chart"><svg viewBox="0 0 120 54" preserveAspectRatio="none" role="img" aria-label="Curva de temperatura de ${forecast.day}"><polyline points="${forecast.curve}"></polyline>${curveDots}</svg><div class="hourly-labels"><span>06h</span><span>10h</span><span>14h</span><span>18h</span><span>22h</span></div><div class="hourly-values"><span>${forecast.low}°</span><span>${Math.round((forecast.low + forecast.high) / 2)}°</span><span>${forecast.high}°</span><span>${Math.round((forecast.low + forecast.high) / 2 - 1)}°</span><span>${forecast.low}°</span></div></div></div>`;
        const arrow = card.querySelector(".toggle-arrow");
        const toggle = () => {
            const willExpand = !card.classList.contains("is-expanded");
            document.querySelectorAll(".forecast-list .forecast-card.is-expanded").forEach((openCard) => {
                openCard.classList.remove("is-expanded");
                openCard.querySelector(".toggle-arrow")?.setAttribute("aria-expanded", "false");
            });
            if (willExpand) {
                card.classList.add("is-expanded");
                arrow.setAttribute("aria-expanded", "true");
            }
        };
        arrow.addEventListener("click", toggle);
    });
}

function calculateComfort(temperature, humidity) {
    const heatIndex = calculateHeatIndex(temperature, humidity);
    if (temperature < 18) return `Sensação fria (${heatIndex.toFixed(1)} °C). Aumente o aquecimento ou use uma camada extra.`;
    if (heatIndex <= 27 && humidity >= 40 && humidity <= 60) return `Confortável (${heatIndex.toFixed(1)} °C). Temperatura e umidade estão em uma faixa adequada.`;
    if (heatIndex <= 32) return `Atenção (${heatIndex.toFixed(1)} °C). A ventilação pode melhorar o conforto do ambiente.`;
    return `Desconfortável (${heatIndex.toFixed(1)} °C). Reduza o esforço físico e ative a ventilação.`;
}

function initializeComfortCalculator() {
    elements.comfortForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const temperature = Number(elements.comfortTemperature.value);
        const humidity = Number(elements.comfortHumidity.value);
        if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
            elements.comfortResult.textContent = "Informe uma temperatura válida e uma umidade entre 0% e 100%.";
            return;
        }
        elements.comfortResult.textContent = calculateComfort(temperature, humidity);
    });
}

function initializeSidebarActions() {
    document.querySelectorAll(".side-nav button[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.action;
            if (action === "refresh") refreshData(button);
            if (action === "notifications") {
                renderNotifications();
                openModal(elements.notificationsModal);
            }
            if (action === "calibrate") {
                elements.temperatureCorrection.value = calibration.temperature || 0;
                elements.humidityCorrection.value = calibration.humidity || 0;
                openModal(elements.calibrationModal);
            }
            if (action === "units") toggleUnits();
            if (action === "backup") downloadBackup();
            if (action === "comfort") openModal(elements.comfortModal);
            if (action === "home") showDashboardPage("inicio");
            if (action === "charts") showDashboardPage("graficos");
        });
    });
    elements.notificationsModal?.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-notification-action]");
        if (!actionButton) return;
        event.preventDefault();
        const action = actionButton.dataset.notificationAction;
        if (action === "read") markNotificationsAsRead();
        if (action === "clear") clearNotifications();
        if (action === "test") testAlarm();
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
        button.addEventListener("click", () => closeModal(document.getElementById(button.dataset.closeModal)));
    });
    document.querySelectorAll(".utility-modal").forEach((modal) => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(modal);
        });
    });
    elements.calibrationForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        calibration = {
            temperature: Number(elements.temperatureCorrection.value) || 0,
            humidity: Number(elements.humidityCorrection.value) || 0
        };
        saveJson("climate-calibration", calibration);
        updateDashboard();
        closeModal(elements.calibrationModal);
        addNotification("Calibração do sensor salva");
        showToast("Calibração salva com sucesso!");
    });
    const updateCalibrationPreview = () => {
        if (!elements.calibrationPreview) return;
        const temperatureOffset = Number(elements.temperatureCorrection.value) || 0;
        const humidityOffset = Number(elements.humidityCorrection.value) || 0;
        elements.calibrationPreview.textContent = `Prévia ao vivo: temperatura ${temperatureOffset >= 0 ? "+" : ""}${temperatureOffset.toFixed(1)} °C · umidade ${humidityOffset >= 0 ? "+" : ""}${humidityOffset.toFixed(0)}%.`;
    };
    [elements.temperatureCorrection, elements.humidityCorrection].forEach((input) => input?.addEventListener("input", updateCalibrationPreview));
}

function connectToFirebase() {
    // Quando o Firebase falha ou está vazio, o painel continua operando localmente.
    try {
        const app = initializeApp(firebaseConfig);
        const database = getFirestore(app);
        const readingsQuery = query(collection(database, "leituras"), orderBy("timestamp", "desc"), limit(10));
        onSnapshot(readingsQuery, (snapshot) => {
            if (snapshot.empty) {
                setConnectionStatus(false);
                startSimulation();
                return;
            }
            setConnectionStatus(true);
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
            setConnectionStatus(false);
            startSimulation();
        });
    } catch (error) {
        console.warn("Não foi possível conectar ao Firebase; usando dados simulados.", error);
        setConnectionStatus(false);
        startSimulation();
    }
}

function initializeControls() {
    const preferredTheme = localStorage.getItem(STORAGE_KEYS.theme) || "dark";
    elements.minTemp.value = localStorage.getItem(STORAGE_KEYS.minTemp) || "10";
    elements.maxTemp.value = localStorage.getItem(STORAGE_KEYS.maxTemp) || "35";
    applyTheme(preferredTheme);
    applyPalette(localStorage.getItem(STORAGE_KEYS.palette) || "teal");

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
    }
    document.querySelectorAll(".period-filter").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.period === chartPeriod);
        button.addEventListener("click", () => {
            chartPeriod = button.dataset.period;
            localStorage.setItem("chart-period", chartPeriod);
            document.querySelectorAll(".period-filter").forEach((item) => item.classList.toggle("is-active", item === button));
            renderChart();
            renderAnalyticsCharts();
        });
    });
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
    selectAssistant(assistantProfiles[savedAssistant] ? savedAssistant : "climabot");
    initializeMascot();
    initializeForecastCards();
    initializeMetricAccordions();
    initializeSidebarActions();
    initializeChat();
    initializeComfortCalculator();
}

initializeControls();
initializeSetup(NOME_PADRAO, INTERVALO_PADRAO);
setConnectionStatus(false);
updateClock();
setInterval(updateClock, 1000);
updateDashboard();
connectToFirebase();