// ============================================================
//  GirlMath Decision Engine — script.js
//  Flow: Step1 (type) → Step2 (description) → Step3 (sliders) → Step4 (results)
// ============================================================

const GROQ_URL = "/api/groq";

const state = {
  step: 1, type: "", mood: 5, urgency: 5, confidence: 5,
  futureDep: false, cost: 0, capacity: 0, months: 0, description: "",
};

const $ = id => document.getElementById(id);
const steps = { 1: $("step1"), 2: $("step2"), 3: $("step3"), 4: $("step4") };
const stepIndicator = $("stepIndicator");

function goToStep(n) {
  state.step = n;
  Object.keys(steps).forEach(k => steps[k].classList.toggle("hidden", Number(k) !== n));
  updateStepDots(n);
  stepIndicator.classList.toggle("hidden", n === 4);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateStepDots(current) {
  [1, 2, 3].forEach(i => {
    const dot = $("dot" + i);
    dot.classList.remove("active", "done");
    if (i < current) { dot.classList.add("done"); dot.textContent = "✓"; }
    else if (i === current) { dot.classList.add("active"); dot.textContent = i; }
    else { dot.textContent = i; }
  });
  [1, 2].forEach(i => $("line" + i).classList.toggle("done", i < current));
}

// Step 1
["cardPersonal", "cardFinancial"].forEach(id => {
  $(id).addEventListener("click", () => {
    state.type = $(id).dataset.type;
    $("cardPersonal").classList.toggle("selected", state.type === "personal");
    $("cardFinancial").classList.toggle("selected", state.type === "financial");
    $("financeSection").classList.toggle("hidden", state.type !== "financial");
    $("descriptionInput").placeholder = state.type === "financial"
      ? "e.g. I want to buy the new iPhone even though mine works fine. It's on sale today only..."
      : "e.g. I'm thinking of texting my ex because I've been feeling lonely lately...";
    setTimeout(() => goToStep(2), 180);
  });
});

// Step 2
$("back2").addEventListener("click", () => goToStep(1));
$("next2").addEventListener("click", () => {
  if (!state.description.trim()) {
    $("descriptionInput").focus();
    $("descriptionInput").style.borderColor = "var(--hot-pink)";
    setTimeout(() => $("descriptionInput").style.borderColor = "", 1500);
    return;
  }
  goToStep(3);
});
$("descriptionInput").addEventListener("input", e => { state.description = e.target.value; });

// Step 3
$("back3").addEventListener("click", () => goToStep(2));
$("analyzeBtn").addEventListener("click", analyze);

function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = "linear-gradient(to right, var(--hot-pink) 0%, var(--hot-pink) " + pct + "%, rgba(244,167,195,0.3) " + pct + "%)";
}

function initSlider(sliderId, valId, stateKey) {
  const slider = $(sliderId);
  updateSliderFill(slider);
  slider.addEventListener("input", () => {
    state[stateKey] = Number(slider.value);
    $(valId).textContent = slider.value;
    updateSliderFill(slider);
  });
}

initSlider("moodSlider", "moodVal", "mood");
initSlider("urgencySlider", "urgencyVal", "urgency");
initSlider("confidenceSlider", "confidenceVal", "confidence");

$("checkRow").addEventListener("click", () => {
  state.futureDep = !state.futureDep;
  $("checkRow").classList.toggle("on", state.futureDep);
  $("checkBox").classList.toggle("on", state.futureDep);
  $("checkBox").textContent = state.futureDep ? "✓" : "";
});

["costInput", "capacityInput", "monthsInput"].forEach((id, i) => {
  $(id).addEventListener("input", e => {
    state[["cost", "capacity", "months"][i]] = Number(e.target.value) || 0;
  });
});

// ─── Severity classifier ──────────────────────────────────────────────────────
function classifySeverity(description) {
  const text = description.toLowerCase();
  const BETRAYAL_KEYWORDS = [
    "cheat","cheated","cheating","infidelity","affair",
    "lied","lying","deceived","deceiving","deceit",
    "manipulate","manipulated","manipulating","manipulative","gaslighting","gaslit",
    "abused","abuse","abusive","hit me","hurt me","threatened","threatening",
    "controlling","stole","stolen","betrayed","betrayal",
    "two-timing","two timing","behind my back",
  ];
  const ACTION_KEYWORDS = [
    "leave","leaving","break up","breaking up","break-up",
    "quit","end it","ending it","walk away","walking away",
    "cut off","cutting off","block","blocking","report","done with",
    "move on","moving on","should i stay","should i go",
  ];
  const hasBetrayalKeyword = BETRAYAL_KEYWORDS.some(kw => text.includes(kw));
  const hasActionKeyword   = ACTION_KEYWORDS.some(kw => text.includes(kw));
  if (hasBetrayalKeyword && hasActionKeyword) return "justified_exit";
  if (hasBetrayalKeyword) return "betrayal";
  return "standard";
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
function calcScores() {
  const { mood, urgency, confidence, futureDep, type, cost, capacity, months } = state;
  const isFinancial = type === "financial";
  const emotional   = Math.round(Math.min(100, (mood * 0.4 + urgency * 0.6) * 10 * (1 - (confidence - 1) / 18)));
  const dependency  = futureDep ? Math.round(Math.min(100, 40 + urgency * 6)) : Math.round(urgency * 3);
  const strain      = (isFinancial && capacity > 0)
    ? Math.round(Math.min(100, Math.min(cost / capacity, 5) * 20 * (1 + Math.min(months, 24) / 24 * 0.5))) : 0;
  const delay   = Math.round(Math.min(100, (urgency * 7 + (10 - confidence) * 3) * (futureDep ? 1.25 : 1)));
  const overall = isFinancial
    ? Math.round(emotional * 0.3 + dependency * 0.2 + strain * 0.3 + delay * 0.2)
    : Math.round(emotional * 0.4 + dependency * 0.25 + delay * 0.35);
  return { emotional, dependency, strain, delay, overall };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(scores, severity) {
  const { mood, urgency, confidence, futureDep, type, cost, capacity, months, description } = state;
  const isFinancial = type === "financial";

  const severityBlocks = {
    justified_exit: "CRITICAL: The user describes betrayal, cheating, or abuse AND is considering leaving/acting. DO NOT both-sides this. Their decision is JUSTIFIED. Name the wrongdoing directly. High emotional scores reflect appropriate pain, NOT impulsiveness. Do NOT say take a moment to reflect. Empower and validate. Rename emotional bias as emotional response.",
    betrayal: "CRITICAL: The user describes betrayal, cheating, manipulation, or abuse. Acknowledge the wrongdoing first. Do NOT advise them to see the other side. Be warm, direct, validating. Strong emotions here are correct.",
    standard: "Give a warm, sharp, real-friend take. Talk TO them, not ABOUT them. Use casual language, not clinical language. No phrases like 'emotional intensity score' or 'it is crucial to'. If they seem impulsive, say so like a friend would — directly but kindly. If their decision seems fine, just say so.",
  };

  return "You are the GirlMath Decision Engine — sharp, honest, warm, and direct.\n\n" +
    severityBlocks[severity] + "\n\n" +
    'The user\'s decision: "' + description + '"\n\n' +
    "CONTEXT:\n" +
    "- Decision type: " + type + "\n" +
    "- Mood (1-10): " + mood + (mood >= 8 ? " (high)" : mood <= 3 ? " (very low)" : "") + "\n" +
    "- Urgency (1-10): " + urgency + "\n" +
    "- Confidence (1-10): " + confidence + "\n" +
    "- Future plans depend on this: " + (futureDep ? "Yes" : "No") + "\n" +
    (isFinancial ? "- Cost: $" + cost + "\n- Monthly capacity: $" + capacity + "\n- Months until benefit: " + months + "\n" : "") +
    "\nSCORES:\n" +
    "- Emotional Intensity: " + scores.emotional + "/100\n" +
    "- Future Dependency: " + scores.dependency + "/100\n" +
    (isFinancial ? "- Resource Strain: " + scores.strain + "/100\n" : "") +
    "- Delay Risk: " + scores.delay + "/100\n" +
    "- Overall Score: " + scores.overall + "/100\n\n" +
    'Reply with ONLY a raw JSON object — no markdown, no backticks, no preamble:\n{"overallScore":' + scores.overall + ',"verdict":"2-3 SHORT punchy sentences. Talk directly to them like a friend texting them. No corporate speak, no \'it is crucial\', no \'emotional intensity\'. Be specific to their actual situation.","breakdown":{"emotionalBias":"one casual sentence — are they being emotional or logical? say it plainly","futureDependency":"one casual sentence about how much rides on this","resourceStrain":"one sentence about money, or Not applicable","delayRisk":"one casual sentence — should they wait or act now?"},"recommendation":"one bold, direct sentence. Tell them exactly what to do. Like a best friend would."}';
}

// ─── Analyze ──────────────────────────────────────────────────────────────────
async function analyze() {
  const btn      = $("analyzeBtn");
  const errorBox = $("errorBox");
  btn.disabled  = true;
  btn.innerHTML = '<div class="spinner"></div> Analyzing...';
  errorBox.classList.add("hidden");

  const scores   = calcScores();
  const severity = classifySeverity(state.description);
  const prompt   = buildPrompt(scores, severity);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Status " + res.status);
    }

    const data      = await res.json();
    const raw       = data?.choices?.[0]?.message?.content || "";
    const cleaned   = raw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const result    = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

    renderResults(result, scores.overall, severity);
    goToStep(4);

  } catch (err) {
    errorBox.classList.remove("hidden");
    errorBox.textContent = "Error: " + err.message;
    console.error("Analyze error:", err);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = "Analyze ✦";
  }
}

// ─── Risk meta ────────────────────────────────────────────────────────────────
function getRiskMeta(score, severity) {
  const isJustified = severity === "justified_exit" || severity === "betrayal";
  if (score <= 20) return { level: "Clear-Headed",         bg: "linear-gradient(135deg,#e8f5ee,#d4ede0)", color: "#3a7d5a" };
  if (score <= 40) return { level: "Mostly Rational",      bg: "linear-gradient(135deg,#fdf6ee,#f5ead8)", color: "#b8843a" };
  if (score <= 60) return { level: "Proceed With Caution", bg: "linear-gradient(135deg,#fdf3ee,#f5ddd8)", color: "#c97b6e" };
  if (score <= 80) return { level: isJustified ? "Justified Emotional Response" : "High Impulse Energy", bg: "linear-gradient(135deg,#fdeeed,#f5d8d4)", color: "#c06050" };
  return { level: isJustified ? "Trust Your Gut 🔥" : "Danger Zone 🚨", bg: "linear-gradient(135deg,#fde8e6,#f5ccc8)", color: "#9e4f44" };
}

// ─── Render results ───────────────────────────────────────────────────────────
function renderResults(result, overallScore, severity) {
  severity = severity || "standard";
  const meta        = getRiskMeta(overallScore, severity);
  const isJustified = severity === "justified_exit" || severity === "betrayal";
  const isFinancial = state.type === "financial";

  $("riskBanner").style.background = meta.bg;
  $("riskLevel").textContent        = meta.level;
  $("riskLevel").style.color        = meta.color;
  $("riskScore").style.color        = meta.color;
  const scoreLabel = $("riskBanner").querySelector(".risk-score-label");
  scoreLabel.textContent = isJustified ? "EMOTIONAL INTENSITY / 100" : "IMPULSE RISK SCORE / 100";
  scoreLabel.style.color = meta.color;

  const resourceCard  = $("bdResourceCard");
  const breakdownGrid = $("breakdownGrid");
  if (isFinancial) {
    resourceCard.classList.remove("hidden");
    breakdownGrid.classList.remove("personal-mode");
  } else {
    resourceCard.classList.add("hidden");
    breakdownGrid.classList.add("personal-mode");
  }

  animateCount($("riskScore"), overallScore);
  $("aiVerdict").textContent    = result.verdict                     || "—";
  $("bdEmotional").textContent  = result.breakdown?.emotionalBias    || "—";
  $("bdFuture").textContent     = result.breakdown?.futureDependency || "—";
  $("bdResource").textContent   = result.breakdown?.resourceStrain   || "—";
  $("bdDelay").textContent      = result.breakdown?.delayRisk        || "—";
  $("recText").textContent      = result.recommendation              || "—";

  $("followupPanel").classList.add("hidden");
  $("whatdoBtn").disabled = false;
  $("whatdoBtn").innerHTML = "What should I do? ✦";
}

function animateCount(el, target, duration) {
  duration = duration || 800;
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── What should I do ─────────────────────────────────────────────────────────
$("whatdoBtn").addEventListener("click", async () => {
  const btn = $("whatdoBtn");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Thinking...';

  $("followupPanel").classList.remove("hidden");
  $("followupBody").innerHTML = '<div style="display:flex;align-items:center;gap:0.6rem;font-size:0.82rem;font-weight:700;color:var(--muted)"><div class="spinner-blue"></div> Building your action plan\u2026</div>';

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: buildFollowupPrompt() }],
        max_tokens: 800,
        temperature: 0.5,
      }),
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const data      = await res.json();
    const raw       = data?.choices?.[0]?.message?.content || "";
    const cleaned   = raw.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const result    = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    renderFollowup(result);
  } catch (err) {
    $("followupBody").innerHTML = '<p style="color:var(--deep-pink);font-size:0.85rem;font-weight:700">Couldn\u2019t load action plan \u2014 try again. (' + err.message + ')</p>';
    btn.disabled = false;
    btn.innerHTML = "What should I do? \u2736";
  }
});

function buildFollowupPrompt() {
  const { type, description, mood, urgency, confidence } = state;
  return "You are the GirlMath Decision Engine. The user just received their decision analysis.\n\n" +
    'Situation: "' + description + '"\n' +
    "Type: " + type + " | Mood: " + mood + "/10 | Urgency: " + urgency + "/10 | Confidence: " + confidence + "/10\n\n" +
    'Reply with ONLY a raw JSON object — no markdown, no backticks, no preamble:\n{"actionPlan":"3-4 concrete numbered steps as a single string. Separate steps with <br>. No actual newlines inside the string.","deeperQuestion":"One personal, specific follow-up question to help them reflect. No preamble, just the question."}';
}

function renderFollowup(result) {
  const plan     = result.actionPlan || "";
  const question = result.deeperQuestion || "";
  $("followupBody").innerHTML =
    '<div class="followup-action-plan">' + plan + '</div>' +
    '<div class="followup-question">\uD83D\uDCAD ' + question + '</div>' +
    '<div class="followup-reply-wrap" id="replyWrap">' +
      '<textarea class="followup-reply-input" id="replyInput" rows="3" placeholder="Type your thoughts here\u2026"></textarea>' +
      '<button class="followup-send-btn" id="replySendBtn">Send \u2736</button>' +
    '</div>';
  $("replySendBtn").addEventListener("click", sendReply);
}

async function sendReply() {
  const input = $("replyInput");
  const reply = input.value.trim();
  if (!reply) {
    input.style.borderColor = "var(--hot-pink)";
    setTimeout(() => input.style.borderColor = "", 1500);
    return;
  }
  const btn = $("replySendBtn");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-blue"></div> Thinking\u2026';

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: buildReplyPrompt(reply) }],
        max_tokens: 400,
        temperature: 0.5,
      }),
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    const text = (data?.choices?.[0]?.message?.content || "").trim() || "\u2014";
    $("replyWrap").outerHTML = '<div class="followup-final">\u2728 ' + text + '</div>';
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = "Send \u2736";
  }
}

function buildReplyPrompt(reply) {
  return "You are the GirlMath Decision Engine. The user answered your follow-up question.\n\n" +
    'Their situation: "' + state.description + '"\n' +
    'Their answer: "' + reply + '"\n\n' +
    "Give a SHORT (2-3 sentences), warm, honest, grounded closing insight. No lists. No headers. Speak like a smart friend.";
}

// ─── Restart ──────────────────────────────────────────────────────────────────
$("restartBtn").addEventListener("click", () => {
  Object.assign(state, { step:1, type:"", mood:5, urgency:5, confidence:5, futureDep:false, cost:0, capacity:0, months:0, description:"" });
  ["cardPersonal","cardFinancial"].forEach(id => $(id).classList.remove("selected"));
  ["moodSlider","urgencySlider","confidenceSlider"].forEach(id => { $(id).value = 5; updateSliderFill($(id)); });
  $("moodVal").textContent = $("urgencyVal").textContent = $("confidenceVal").textContent = "5";
  $("checkRow").classList.remove("on");
  $("checkBox").classList.remove("on");
  $("checkBox").textContent = "";
  $("costInput").value = $("capacityInput").value = $("monthsInput").value = "";
  $("descriptionInput").value = "";
  $("financeSection").classList.add("hidden");
  $("errorBox").classList.add("hidden");
  goToStep(1);
});

goToStep(1);
