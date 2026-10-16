
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

// 天気情報：既存の左側Weather欄に表示
async function updateWeather() {
  const weatherText = $("weatherText");
  if (!weatherText) return;

  weatherText.textContent = "天気情報を取得中...";

  try {
    const latitude = 34.862;
    const longitude = 137.061;

    const url =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
        timezone: "Asia/Tokyo"
      });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("天気情報を取得できませんでした。");
    }

    const data = await response.json();
    const current = data.current;

    if (!current) {
      throw new Error("天気データがありません。");
    }

    const weatherNames = {
      0: "快晴",
      1: "おおむね晴れ",
      2: "晴れ時々くもり",
      3: "くもり",
      45: "霧",
      48: "霧",
      51: "弱い霧雨",
      53: "霧雨",
      55: "強い霧雨",
      61: "弱い雨",
      63: "雨",
      65: "強い雨",
      71: "弱い雪",
      73: "雪",
      75: "強い雪",
      80: "にわか雨",
      81: "雨",
      82: "強いにわか雨",
      95: "雷雨",
      96: "ひょうを伴う雷雨",
      99: "強い雷雨"
    };

    weatherText.textContent =
      "📍 愛知県西尾市\n" +
      "🌤️ 天気：" +
      (weatherNames[current.weather_code] || "その他") +
      "\n🌡️ 気温：" + current.temperature_2m + " ℃" +
      "\n🤔 体感温度：" + current.apparent_temperature + " ℃" +
      "\n💧 湿度：" + current.relative_humidity_2m + " %" +
      "\n💨 風速：" + current.wind_speed_10m + " km/h" +
      "\n🕒 更新：" + current.time.replace("T", " ");
  } catch (error) {
    weatherText.textContent = "天気情報を取得できませんでした。";
    console.error("Weather error:", error);
  }
}

// 初期化
loadSettings();
updateClock();
updateUptime();
updateWeather();

setInterval(updateClock, 1000);
setInterval(updateUptime, 1000);
setInterval(updateWeather, 10 * 60 * 1000);

$("captions").textContent =
  "こんにちは！N.E.X.U.Sです。勉強について質問してください。";
