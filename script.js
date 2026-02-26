// ============================================================
//  GirlMath Decision Engine — script.js (Groq — free & fast)
//  Flow: Step1 (type) → Step2 (description) → Step3 (sliders/inputs) → Step4 (results)
// ============================================================

const GROQ_KEY = "YOUR_GROQ_API_KEY_HERE";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
    const dot = $(`dot${i}`);
    dot.classList.remove("active", "done");
    if (i < current) { dot.classList.add("done"); dot.textContent = "✓"; }
    else if (i === current) { dot.classList.add("active"); dot.textContent = i; }
    else { dot.textContent = i; }
  });
  [1, 2].forEach(i => $(`line${i}`).classList.toggle("done", i < current));
}

// Step 1 — pick type
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

// Step 2 — description nav
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

// Step 3 — sliders + analyze
$("back3").addEventListener("click", () => goToStep(2));
$("analyzeBtn").addEventListener("click", analyze);

// Sliders
function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, var(--hot-pink) 0%, var(--hot-pink) ${pct}%, rgba(244,167,195,0.3) ${pct}%)`;
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
    state[["cost","capacity","months"][i]] = Number(e.target.value) || 0;
  });
});

// Scoring
function calcScores() {
  const { mood, urgency, confidence, futureDep, type, cost, capacity, months } = state;
  const isFinancial = type === "financial";
  const emotional = Math.round(Math.min(100, (mood * 0.4 + urgency * 0.6) * 10 * (1 - (confidence - 1) / 18)));
  const dependency = futureDep ? Math.round(Math.min(100, 40 + urgency * 6)) : Math.round(urgency * 3);
  const strain = (isFinancial && capacity > 0)
    ? Math.round(Math.min(100, Math.min(cost / capacity, 5) * 20 * (1 + Math.min(months, 24) / 24 * 0.5))) : 0;
  const delay = Math.round(Math.min(100, (urgency * 7 + (10 - confidence) * 3) * (futureDep ? 1.25 : 1)));
  const overall = isFinancial
    ? Math.round(emotional * 0.3 + dependency * 0.2 + strain * 0.3 + delay * 0.2)
    : Math.round(emotional * 0.4 + dependency * 0.25 + delay * 0.35);
  return { emotional, dependency, strain, delay, overall };
}

// Analyze
async function analyze() {
  const btn = $("analyzeBtn");
  const errorBox = $("errorBox");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> Analyzing...`;
  errorBox.classList.add("hidden");

  const scores = calcScores();
  const isFinancial = state.type === "financial";

  const prompt = `You are the GirlMath Decision Engine — a sharp, honest, warm analyst who tells people exactly whether they're thinking clearly or acting on impulse.

A user wants to analyze this decision:
"${state.description}"

CONTEXT:
- Decision type: ${state.type}
- Mood (1-10): ${state.mood}${state.mood >= 8 ? " (very high)" : state.mood <= 3 ? " (very low)" : ""}
- Urgency (1-10): ${state.urgency}
- Confidence (1-10): ${state.confidence}
- Future plans depend on this: ${state.futureDep ? "Yes" : "No"}
${isFinancial ? `- Cost: $${state.cost}\n- Monthly capacity: $${state.capacity}\n- Months until benefit: ${state.months}` : ""}

RISK SCORES (0-100):
- Emotional Bias: ${scores.emotional}/100
- Future Dependency: ${scores.dependency}/100
${isFinancial ? `- Resource Strain: ${scores.strain}/100` : ""}
- Delay Risk: ${scores.delay}/100
- Overall Impulse Risk: ${scores.overall}/100

Reply with ONLY a raw JSON object, no markdown, no backticks:
{"overallScore":${scores.overall},"verdict":"2-3 sentences specific to their actual decision, warm but honest","breakdown":{"emotionalBias":"one sentence","futureDependency":"one sentence","resourceStrain":"one sentence or Not applicable for personal decision","delayRisk":"one sentence"},"recommendation":"one clear actionable sentence"}`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Status ${res.status}`);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);
    renderResults(result, scores.overall);
    goToStep(4);

  } catch (err) {
    errorBox.classList.remove("hidden");
    errorBox.textContent = `Error: ${err.message}`;
    console.error("Analyze error:", err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Analyze ✦";
  }
}

// Results
function getRiskMeta(score) {
  if (score <= 20) return { level: "Clear-Headed",         bg: "linear-gradient(135deg,#e8f5ee,#d4ede0)", color: "#3a7d5a" };
  if (score <= 40) return { level: "Mostly Rational",      bg: "linear-gradient(135deg,#fdf6ee,#f5ead8)", color: "#b8843a" };
  if (score <= 60) return { level: "Proceed With Caution", bg: "linear-gradient(135deg,#fdf3ee,#f5ddd8)", color: "#c97b6e" };
  if (score <= 80) return { level: "High Impulse Energy",  bg: "linear-gradient(135deg,#fdeeed,#f5d8d4)", color: "#c06050" };
  return             { level: "Danger Zone 🚨",            bg: "linear-gradient(135deg,#fde8e6,#f5ccc8)", color: "#9e4f44" };
}

function renderResults(result, overallScore) {
  const meta = getRiskMeta(overallScore);
  $("riskBanner").style.background = meta.bg;
  $("riskLevel").textContent = meta.level;
  $("riskLevel").style.color = meta.color;
  $("riskScore").style.color = meta.color;
  $("riskBanner").querySelector(".risk-score-label").style.color = meta.color;
  animateCount($("riskScore"), overallScore);
  $("aiVerdict").textContent   = result.verdict;
  $("bdEmotional").textContent = result.breakdown?.emotionalBias    || "—";
  $("bdFuture").textContent    = result.breakdown?.futureDependency || "—";
  $("bdResource").textContent  = result.breakdown?.resourceStrain   || "—";
  $("bdDelay").textContent     = result.breakdown?.delayRisk        || "—";
  $("recText").textContent     = result.recommendation              || "—";
}

function animateCount(el, target, duration = 800) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Restart
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
