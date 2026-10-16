
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

// 起動時間
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
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!steps.length) return;

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
}

// 数式をグラフ用に整える
function normalizeMathExpression(expression) {
  let result = expression.trim();

  result = result
    .replace(/[−–]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/＝/g, "=")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4")
    .replace(/π/g, "pi")
    .replace(/√\s*\(([^)]+)\)/g, "sqrt($1)")
    .replace(/√\s*(\d+(?:\.\d+)?|x)/g, "sqrt($1)")
    .replace(/\s+/g, "");

  // 2x → 2*x
  result = result.replace(/(\d)(x)/gi, "$1*$2");

  // 2(x+1) → 2*(x+1)
  result = result.replace(/(\d)\(/g, "$1*(");

  // (x+1)x → (x+1)*x
  result = result.replace(/\)(x|\d|\()/g, ")*$1");

  return result;
}

// 数式として安全に扱える文字か確認
function isSupportedExpression(expression) {
  if (!expression || !expression.includes("x")) return false;

  // 数式以外の文章を実行させない
  if (!/^[0-9x+\-*/^().piqrtabs]+$/i.test(expression)) {
    return false;
  }

  // 代入や複数の式は受け付けない
  if (expression.includes("=")) return false;

  return true;
}

// 質問文から y = ... を取り出す

function extractExpressionFromQuestion(question) {
  const text = question
    .replace(/[−–]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/＝/g, "=");

  // y = ... または f(x) = ... を抽出
  const match = text.match(
    /(?:y|f\s*\(\s*x\s*\))\s*=\s*(.*)/i
  );

  if (!match) return null;

  let expression = match[1];

  // グラフの依頼文など、数式の後ろの文章を削除
  expression = expression.split(
    /のグラフ|グラフを|を描いて|をかいて|を表示|を図示|のグラフを/
  )[0];

  // 空白と不要な末尾記号を整理
  expression = expression
    .replace(/[。！？!?].*$/, "")
    .trim();

  expression = normalizeMathExpression(expression);

  return isSupportedExpression(expression)
    ? expression
    : null;
}


// AIの回答文から y = ... を取り出す
function extractGraphExpressions(answer) {
  const expressions = [];
  const seen = new Set();

  const regex =
    /(?:y\s*=|f\(x\)\s*=)\s*([^。\n；;，,]+)/g;

  let match;

  while ((match = regex.exec(answer)) !== null) {
    let expression = match[1]
      .replace(/[。！？!?].*$/, "")
      .trim();

    // 数式の後ろに説明文が続いている場合
    expression = expression
      .replace(/\s+(?:となる|である|です|になります).*$/, "")
      .trim();

    expression = normalizeMathExpression(expression);

    if (!isSupportedExpression(expression)) continue;

    if (!seen.has(expression)) {
      seen.add(expression);
      expressions.push(expression);
    }
  }

  return expressions.slice(0, 5);
}

// グラフ描画

  area.append(title, graph, formulaList);

  try {
    window.functionPlot({
      target: graph,
      width: Math.max(300, Math.floor(area.clientWidth || 400)),
      height: 340,
      grid: true,
      xAxis: {
        label: "x（横軸）",
        domain: [-5, 5],
        ticks: 11
      },
      yAxis: {
        label: "y（縦軸）",
        domain: [-10, 10],
        ticks: 11
      },
      data: expressions.map((expression) => ({
        fn: expression,
        graphType: "polyline",
        nSamples: 500
      }))
    });

    const tableTitle = document.createElement("h4");
    tableTitle.textContent = "📋 座標表（x = -5 ～ 5）";
    tableTitle.style.cssText = "margin:16px 0 8px";
    area.appendChild(tableTitle);

    const table = document.createElement("table");
    table.style.cssText =
      "width:100%;border-collapse:collapse;text-align:center";

    const header = document.createElement("tr");

    ["x", ...expressions.map((_, i) =>
      expressions.length > 1 ? `y${i + 1}` : "y"
    )].forEach((text) => {
      const th = document.createElement("th");
      th.textContent = text;
      th.style.cssText = "border:1px solid #888;padding:8px";
      header.appendChild(th);
    });

    table.appendChild(header);

    for (let x = -5; x <= 5; x++) {
      const row = document.createElement("tr");

      const xCell = document.createElement("td");
      xCell.textContent = x;
      xCell.style.cssText = "border:1px solid #888;padding:8px";
      row.appendChild(xCell);

      expressions.forEach((expression) => {
        const cell = document.createElement("td");

        try {
          // math.js が読み込まれている場合に数値を計算
          if (window.math && typeof window.math.evaluate === "function") {
            const result = window.math.evaluate(expression, { x });
            cell.textContent =
              typeof result === "number" && Number.isFinite(result)
                ? Number(result.toFixed(4)).toString()
                : "—";
          } else {
            cell.textContent = "—";
          }
        } catch (_) {
          cell.textContent = "—";
        }

        cell.style.cssText = "border:1px solid #888;padding:8px";
        row.appendChild(cell);
      });

      table.appendChild(row);
    }

    area.appendChild(table);
  } catch (error) {
    console.error("Graph error:", error);
    area.textContent =
      "グラフを描画できませんでした。数式やライブラリ設定を確認してください。";
  }
}

  });

  area.append(title, graph, formulaList);

  try {
    window.functionPlot({
      target: graph,
      width: Math.max(280, Math.floor(area.clientWidth || 400)),
      height: 320,
      grid: true,
      xAxis: {
        label: "x",
        domain: [-5, 5]
      },
      yAxis: {
        label: "y",
        domain: [-10, 10]
      },
      data: expressions.map((expression) => ({
        fn: expression,
        graphType: "polyline",
        sampler: "builtIn",
        nSamples: 500
      }))
    });
  } catch (error) {
    console.error("Graph error:", error);
    area.replaceChildren();

    const message = document.createElement("p");
    message.textContent =
      "グラフを描画できませんでした。数式の書き方を確認してください。";
    area.appendChild(message);
  }
}

// グラフを表示する質問か
function wantsGraph(question) {
  return /グラフ|関数を描いて|関数をかいて|曲線を描いて|曲線をかいて|接線を描いて|接線をかいて|極値.*図|図を表示|グラフで説明/.test(question);
}

// AIへの質問
async function sendMessage(text) {
  const question = text.trim();
  if (!question) return;

  messages.push({
    role: "user",
    content: question
  });

  addMessage("user", question);

  $("question").value = "";
  $("sendBtn").disabled = true;
  setStatus("回答中...");
  $("captions").textContent = "考えています...";

  const pending = addMessage(
    "assistant",
    "回答を生成しています..."
  );

  // AIへ送信する前に質問から数式を抽出する
  const requestedGraph = wantsGraph(question);
  const questionExpression = requestedGraph
    ? extractExpressionFromQuestion(question)
    : null;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages })
    });

    const data = await response.json();

    if (!response.ok || !data.reply) {
      throw new Error(
        data.detail || data.error || "AIへの接続に失敗しました。"
      );
    }

    pending.textContent = data.reply;

    if (/図解|図を表示|図で説明|図にして/.test(question)) {
      renderDiagram(pending.parentElement, data.reply);
    }

    // 質問文に式があれば、AIの回答内容に関係なく描画する
    
if (requestedGraph) {
  renderMathGraph(["x^2"]);
}


    messages.push({
      role: "assistant",
      content: data.reply
    });

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
    $("captions").textContent =
      sentences.slice(index, index + 2).join("");
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

// 読み上げ停止
$("stopVoiceBtn").addEventListener("click", () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

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
    alert(
      "このブラウザでは音声入力に対応していません。Chromeなどで試してください。"
    );
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
  speechRate = Number(
    localStorage.getItem("nexusSpeechRate") || "1"
  );

  $("speechRate").value = String(speechRate);

  const fontSize =
    localStorage.getItem("nexusFontSize") || "17px";

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
    alert(
      "カメラを起動できませんでした。ブラウザの権限を確認してください。"
    );
  }
});

// ページを閉じるときに停止
window.addEventListener("beforeunload", () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
});

// 天気情報
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
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
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
