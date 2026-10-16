
"use strict";

const API_URL = "https://nexus-ai-backend.sur0730donald.workers.dev";

const $ = (id) => document.getElementById(id);

let messages = [];
let recognition = null;
let cameraStream = null;
let startedAt = Date.now();
let speechRate = 1;
let captionTimer = null;
let returnTimer = null;

// 時計
function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function updateUptime() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  $("uptime").textContent = `${h}:${m}:${s}`;
}

// メッセージ表示
function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "YOU" : "N.E.X.U.S";

  const body = document.createElement("div");
  body.textContent = content;

  article.append(label, body);
  $("messages").appendChild(article);
  $("messages").scrollTop = $("messages").scrollHeight;

  return body;
}

function setStatus(text) {
  $("aiStatus").textContent = text;
}

// 図解機能
function renderDiagram(container, answer) {
  const oldDiagram = container.querySelector(".nexus-diagram");
  if (oldDiagram) oldDiagram.remove();

  const steps = answer
    .split(/\n+|(?<=[。！？])/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 6);

  if (steps.length === 0) return;

  const diagram = document.createElement("div");
  diagram.className = "nexus-diagram";
  diagram.style.cssText = [
    "margin-top:16px",
    "padding:16px",
    "border:1px solid #64748b",
    "border-radius:12px",
    "text-align:center",
    "background:rgba(100,116,139,0.08)"
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "📊 図解";
  title.style.cssText =
    "font-weight:bold;margin-bottom:12px;font-size:18px";
  diagram.appendChild(title);

  steps.forEach((step, index) => {
    const box = document.createElement("div");
    box.textContent = step;
    box.style.cssText = [
      "padding:12px",
      "margin:6px auto",
      "border:1px solid #64748b",
      "border-radius:8px",
      "overflow-wrap:anywhere",
      "background:rgba(100,116,139,0.12)"
    ].join(";");
    diagram.appendChild(box);

    if (index < steps.length - 1) {
      const arrow = document.createElement("div");
      arrow.textContent = "↓";
      arrow.style.cssText = "font-size:22px";
      diagram.appendChild(arrow);
    }
  });

  container.appendChild(diagram);
  $("messages").scrollTop = $("messages").scrollHeight;
}

// AIへの質問
async function sendMessage(text) {
  const question = text.trim();
  if (!question) return;

  messages.push({ role: "user", content: question });
  addMessage("user", question);

  $("question").value = "";
  $("sendBtn").disabled = true;
  setStatus("回答中...");
  $("captions").textContent = "考えています...";

  const pending = addMessage("assistant", "回答を生成しています...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(
        data.detail || data.error || "AIへの接続に失敗しました。"
      );
    }

    pending.textContent = data.reply;

    // 図解を希望したときだけ表示
    if (/図解|図を表示|図で説明|図にして/.test(question)) {
      renderDiagram(pending.parentElement, data.reply);
    }

    messages.push({ role: "assistant", content: data.reply });
    $("captions").textContent = data.reply;
    setStatus("ONLINE");

    if (document.body.classList.contains("voice-layout")) {
      speak(data.reply);
    }
  } catch (error) {
    pending.textContent = "エラー：" + error.message;
    $("captions").textContent = "接続設定を確認してください。";
    setStatus("接続エラー");
    console.error(error);
  } finally {
    $("sendBtn").disabled = false;
  }
}

$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage($("question").value);
});

// 天気表示パネルを自動作成
function createWeatherPanel() {
  if ($("weatherPanel")) return;

  const panel = document.createElement("section");
  panel.id = "weatherPanel";
  panel.style.cssText = [
    "margin:12px 0",
    "padding:16px",
    "border:1px solid #64748b",
    "border-radius:12px",
    "background:rgba(100,116,139,0.08)"
  ].join(";");

  const heading = document.createElement("h3");
  heading.textContent = "🌤️ 天気情報";
  heading.style.marginTop = "0";

  const description = document.createElement("p");
  description.textContent = "地域名を入力して現在の天気を確認できます。";

  const controls = document.createElement("div");
  controls.style.cssText =
    "display:flex;gap:8px;flex-wrap:wrap";

  const input = document.createElement("input");
  input.id = "weatherLocation";
  input.type = "text";
  input.value = "西尾市";
  input.placeholder = "例：名古屋市";
  input.setAttribute("aria-label", "天気を調べる地域");
  input.style.cssText =
    "flex:1;min-width:130px;padding:10px;border-radius:8px;" +
    "border:1px solid #64748b;font-size:16px";

  const button = document.createElement("button");
  button.id = "weatherBtn";
  button.type = "button";
  button.textContent = "天気を調べる";
  button.style.cssText =
    "padding:10px 14px;border-radius:8px;cursor:pointer";

  const result = document.createElement("div");
  result.id = "weatherResult";
  result.setAttribute("aria-live", "polite");
  result.style.cssText =
    "margin-top:12px;line-height:1.8;overflow-wrap:anywhere";
  result.textContent = "地域を入力して「天気を調べる」を押してください。";

  controls.append(input, button);
  panel.append(heading, description, controls, result);

  const messagesArea = $("messages");
  if (messagesArea && messagesArea.parentElement) {
    messagesArea.parentElement.insertBefore(panel, messagesArea);
  } else {
    document.body.prepend(panel);
  }

  button.addEventListener("click", getWeather);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") getWeather();
  });
}

// 天気コードを日本語に変換
function weatherDescription(code) {
  if (code === 0) return "快晴";
  if (code === 1) return "おおむね晴れ";
  if (code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if ([45, 48].includes(code)) return "霧";
  if ([51, 53, 55].includes(code)) return "霧雨";
  if ([56, 57].includes(code)) return "凍る霧雨";
  if ([61, 63, 65].includes(code)) return "雨";
  if ([66, 67].includes(code)) return "凍る雨";
  if ([71, 73, 75, 77].includes(code)) return "雪";
  if ([80, 81, 82].includes(code)) return "にわか雨";
  if ([85, 86].includes(code)) return "にわか雪";
  if (code === 95) return "雷雨";
  if ([96, 99].includes(code)) return "ひょうを伴う雷雨";
  return "天気情報を取得しました";
}

// 地域名から現在の天気を取得
async function getWeather() {
  const location = $("weatherLocation").value.trim();
  const result = $("weatherResult");
  const button = $("weatherBtn");

  if (!location) {
    result.textContent = "地域名を入力してください。";
    return;
  }

  button.disabled = true;
  result.textContent = "天気情報を取得しています...";

  try {
    // 地域名を座標に変換
    const geoURL =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: location,
        count: "1",
        language: "ja",
        format: "json"
      });

    const geoResponse = await fetch(geoURL);
    if (!geoResponse.ok) throw new Error("地域情報を取得できませんでした。");

    const geoData = await geoResponse.json();
    const place = geoData.results && geoData.results[0];

    if (!place) {
      throw new Error("地域が見つかりません。別の地名で試してください。");
    }

    // 座標を使って現在の天気を取得
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
        timezone: "auto"
      });

    const weatherResponse = await fetch(weatherURL);
    if (!weatherResponse.ok) throw new Error("天気情報を取得できませんでした。");

    const weatherData = await weatherResponse.json();
    const current = weatherData.current;

    if (!current) throw new Error("現在の天気データがありません。");

    // HTMLとしてではなく、テキストとして安全に表示
    result.replaceChildren();

    const lines = [
      `📍 地域：${place.name}${place.admin1 ? "（" + place.admin1 + "）" : ""}`,
      `🌥️ 天気：${weatherDescription(current.weather_code)}`,
      `🌡️ 気温：${current.temperature_2m} ℃`,
      `🥵 体感温度：${current.apparent_temperature} ℃`,
      `💧 湿度：${current.relative_humidity_2m} %`,
      `💨 風速：${current.wind_speed_10m} km/h`,
      `🕒 観測時刻：${current.time.replace("T", " ")}`,
      "データ提供：Open-Meteo"
    ];

    lines.forEach((line) => {
      const row = document.createElement("div");
      row.textContent = line;
      result.appendChild(row);
    });
  } catch (error) {
    result.textContent = "天気取得エラー：" + error.message;
    console.error("Weather error:", error);
  } finally {
    button.disabled = false;
  }
}

// 音声読み上げ
function speak(text) {
  if (!("speechSynthesis" in window)) {
    $("captions").textContent =
      "このブラウザでは音声読み上げを利用できません。";
    return;
  }

  window.speechSynthesis.cancel();
  clearInterval(captionTimer);
  clearTimeout(returnTimer);

  const sentences = text.match(/[^。！？.!?]+[。！？.!?]?/g) || [text];
  let index = 0;

  function showCaption() {
    $("captions").textContent = sentences.slice(index, index + 2).join("");
  }

  showCaption();

  captionTimer = setInterval(() => {
    index += 2;
    if (index < sentences.length) {
      showCaption();
    } else {
      clearInterval(captionTimer);
    }
  }, 2500);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = speechRate;

  const voices = window.speechSynthesis.getVoices();
  const japaneseVoice = voices.find((voice) =>
    voice.lang.toLowerCase().startsWith("ja")
  );

  if (japaneseVoice) utterance.voice = japaneseVoice;

  utterance.onstart = () => {
    document.body.classList.add("speaking");
  };

  utterance.onend = () => {
    document.body.classList.remove("speaking");
    clearInterval(captionTimer);

    if (document.body.classList.contains("voice-layout")) {
      returnTimer = setTimeout(() => {
        document.body.classList.remove("voice-layout");
      }, 10000);
    }
  };

  utterance.onerror = () => {
    document.body.classList.remove("speaking");
    clearInterval(captionTimer);
  };

  window.speechSynthesis.speak(utterance);
}

$("stopVoiceBtn").addEventListener("click", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  clearInterval(captionTimer);
  clearTimeout(returnTimer);
  document.body.classList.remove("speaking");
  document.body.classList.remove("voice-layout");
});

// 音声入力
$("voiceBtn").addEventListener("click", () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("このブラウザでは音声入力に対応していません。Chromeなどで試してください。");
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.continuous = false;

  document.body.classList.add("voice-layout");
  $("captions").textContent = "話してください...";

  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    $("captions").textContent = spokenText;
    sendMessage(spokenText);
  };

  recognition.onerror = (event) => {
    $("captions").textContent = "音声入力エラー：" + event.error;
  };

  recognition.onend = () => {
    recognition = null;
  };

  recognition.start();
});

// 設定画面
$("settingsBtn").addEventListener("click", () => {
  $("settingsDialog").showModal();
});

$("closeSettings").addEventListener("click", () => {
  $("settingsDialog").close();
});

$("saveSettings").addEventListener("click", () => {
  speechRate = Number($("speechRate").value);
  document.body.style.fontSize = $("fontSize").value;
  document.body.classList.toggle(
    "light",
    $("theme").value === "light"
  );

  localStorage.setItem("nexusSpeechRate", String(speechRate));
  localStorage.setItem("nexusFontSize", $("fontSize").value);
  localStorage.setItem("nexusTheme", $("theme").value);

  $("settingsDialog").close();
});

function loadSettings() {
  speechRate = Number(localStorage.getItem("nexusSpeechRate") || "1");
  $("speechRate").value = String(speechRate);

  const fontSize = localStorage.getItem("nexusFontSize") || "17px";
  $("fontSize").value = fontSize;
  document.body.style.fontSize = fontSize;

  const theme = localStorage.getItem("nexusTheme") || "dark";
  $("theme").value = theme;
  document.body.classList.toggle("light", theme === "light");
}

// ファイル名の表示
$("fileInput").addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);

  $("fileNames").textContent = files.length
    ? files.map((file) => file.name).join(", ")
    : "ファイル未選択";

  if (files.length) {
    $("captions").textContent =
      "ファイルを選択しました。ただし、現在の版ではファイルの中身はAIに送信されません。";
  }
});

// カメラ
$("cameraBtn").addEventListener("click", async () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    $("cameraPreview").srcObject = null;
    $("cameraPreview").classList.remove("active");
    $("cameraBtn").textContent = "カメラを起動";
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    $("cameraPreview").srcObject = cameraStream;
    $("cameraPreview").classList.add("active");
    $("cameraBtn").textContent = "カメラを停止";
  } catch (error) {
    alert("カメラを起動できませんでした。ブラウザの権限を確認してください。");
  }
});

// ページを閉じるときにカメラなどを停止
window.addEventListener("beforeunload", () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

// 初期化
loadSettings();
createWeatherPanel();
updateClock();
updateUptime();

setInterval(updateClock, 1000);
setInterval(updateUptime, 1000);

$("captions").textContent =
  "こんにちは！N.E.X.U.Sです。勉強について質問してください。";
