/* ============================================================
   LULL — scroll, corruption, sound, and the thing at the end
   ============================================================ */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  const nav = $("#nav");
  const osText = $("#osText");
  const osTime = $("#osTime");
  const sideIndex = $("#sideIndex");
  const descent = $("#descent");
  const booking = $("#booking");
  const entity = $("#entity");
  const breach = $("#breach");
  const ending = $("#ending");
  const depthReadout = $("#depth");
  const descentStatus = $("#descentStatus");
  const staticCanvas = $("#staticCanvas");
  const toast = $("#toast");
  const toastText = $(".toast__text", toast);
  const soundToggle = $("#soundToggle");
  const film = $("#film");
  const filmScene = $("#filmScene");
  const filmButton = $("#filmButton");
  const filmClose = $("#filmClose");
  const filmTime = $("#filmTime");
  const bookingForm = $("#bookingForm");
  const restart = $("#restart");

  /* ---------- utilities ---------- */

  const fired = new Set();
  const once = (key, action) => {
    if (fired.has(key)) return;
    fired.add(key);
    action();
  };

  let toastTimer = 0;
  function showToast(message, duration = 4600) {
    if (body.classList.contains("in-descent")) return;
    window.clearTimeout(toastTimer);
    toastText.textContent = message;
    toast.classList.add("is-on");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), duration);
  }

  function mutateText(element, value) {
    if (!element || element.dataset.mutated === "1") return;
    element.dataset.mutated = "1";
    element.classList.add("text-glitch");
    window.setTimeout(() => {
      element.textContent = value;
      window.setTimeout(() => element.classList.remove("text-glitch"), 480);
    }, 110);
  }

  /* ---------- scroll state ---------- */

  let descentStart = 0;
  let descentLength = 1;
  let targetD = 0;
  let targetQ = 0;
  let currentD = 0;
  let currentQ = 0;
  let lastD = -1;
  let lastQ = -1;

  function measure() {
    const rect = descent.getBoundingClientRect();
    descentStart = rect.top + window.scrollY;
    descentLength = Math.max(1, descent.offsetHeight - window.innerHeight);
    updateScrollTargets();
  }

  function updateScrollTargets() {
    targetD = clamp(window.scrollY / Math.max(descentStart, 1));
    targetQ = clamp((window.scrollY - descentStart) / descentLength);

    if (window.scrollY === 0) {
      currentD = 0;
      currentQ = 0;
    }
  }

  window.addEventListener("scroll", updateScrollTargets, { passive: true });
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", () => window.setTimeout(measure, 250));

  /* ---------- audio ---------- */

  class Soundscape {
    constructor() {
      this.context = null;
      this.enabled = false;
      this.master = null;
      this.filter = null;
      this.noiseGain = null;
      this.droneGain = null;
      this.ready = false;
    }

    async enable() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      if (!this.context) {
        this.context = new AudioContextClass();
        this.build();
      }

      // Do not hold the interface hostage if a browser keeps the context
      // suspended until it receives another gesture.
      this.context.resume().catch(() => {});
      this.enabled = true;
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.16, now, 1.4);
      return true;
    }

    build() {
      const ctx = this.context;
      const master = ctx.createGain();
      master.gain.value = 0;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 20;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.03;
      compressor.release.value = 0.4;

      master.connect(compressor);
      compressor.connect(ctx.destination);

      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.48;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 230;
      filter.Q.value = 1.3;
      filter.connect(droneGain);
      droneGain.connect(master);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 42.5;
      const osc1Gain = ctx.createGain();
      osc1Gain.gain.value = 0.16;
      osc1.connect(osc1Gain);
      osc1Gain.connect(filter);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 56.1;
      osc2.detune.value = 7;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.1;
      osc2.connect(osc2Gain);
      osc2Gain.connect(filter);

      const osc3 = ctx.createOscillator();
      osc3.type = "triangle";
      osc3.frequency.value = 87.3;
      const osc3Gain = ctx.createGain();
      osc3Gain.gain.value = 0.018;
      osc3.connect(osc3Gain);
      osc3Gain.connect(filter);

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.065;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 76;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = (Math.random() * 2 - 1) * 0.6;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 510;
      noiseFilter.Q.value = 0.7;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.012;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      osc1.start();
      osc2.start();
      osc3.start();
      lfo.start();
      noise.start();

      this.master = master;
      this.filter = filter;
      this.noiseGain = noiseGain;
      this.droneGain = droneGain;
      this.ready = true;
    }

    disable() {
      if (!this.context || !this.master) return;
      this.enabled = false;
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.35);
    }

    update(q, d) {
      if (!this.enabled || !this.ready) return;
      const ctx = this.context;
      const now = ctx.currentTime;
      this.filter.frequency.setTargetAtTime(170 + d * 190 + q * 520, now, 0.5);
      this.noiseGain.gain.setTargetAtTime(0.007 + d * 0.012 + q * 0.037, now, 0.8);
      this.master.gain.setTargetAtTime(0.16 + q * 0.045, now, 0.7);
    }

    impact() {
      if (!this.enabled || !this.context || !this.master) return;
      const ctx = this.context;
      const now = ctx.currentTime;

      const length = Math.floor(ctx.sampleRate * 1.2);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const envelope = Math.pow(1 - i / length, 2.5);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 720;
      noiseFilter.Q.value = 0.55;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.24, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);

      const boom = ctx.createOscillator();
      boom.type = "sine";
      boom.frequency.setValueAtTime(88, now);
      boom.frequency.exponentialRampToValueAtTime(23, now + 1.8);

      const boomGain = ctx.createGain();
      boomGain.gain.setValueAtTime(0.0001, now);
      boomGain.gain.exponentialRampToValueAtTime(0.3, now + 0.025);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

      boom.connect(boomGain);
      boomGain.connect(this.master);
      boom.start(now);
      boom.stop(now + 2.2);
    }
  }

  const sound = new Soundscape();

  soundToggle?.addEventListener("click", async () => {
    if (!sound.enabled) {
      const enabled = await sound.enable();
      if (!enabled) {
        showToast("这个浏览器没有声音。", 2600);
        return;
      }
      soundToggle.classList.add("is-on");
      soundToggle.setAttribute("aria-pressed", "true");
      soundToggle.setAttribute("aria-label", "关闭环境声音");
      $(".sound__state", soundToggle).textContent = "开";
      showToast("环境声音已开启。请调低音量。", 3000);
      sound.update(currentQ, currentD);
    } else {
      sound.disable();
      soundToggle.classList.remove("is-on");
      soundToggle.setAttribute("aria-pressed", "false");
      soundToggle.setAttribute("aria-label", "开启环境声音");
      $(".sound__state", soundToggle).textContent = "关";
    }
  });

  /* ---------- page clock ---------- */

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function updateClock() {
    const now = new Date();
    if (osTime) osTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  updateClock();
  window.setInterval(updateClock, 1000);

  /* ---------- reveal ---------- */

  const revealItems = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  /* ---------- nav + section index ---------- */

  const sections = ["top", "presence", "spaces", "voices", "booking"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const navLinks = $$(".nav__links a");
  const navSwaps = [0.52, 0.62, 0.72, 0.83];

  function updateChrome(d) {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);

    const bookingRect = booking.getBoundingClientRect();
    // only go dark once the paper has actually scrolled past the bar
    const overBooking = bookingRect.top < -8;
    nav.classList.toggle("is-dark", overBooking);

    if (sideIndex) {
      let active = 0;
      sections.forEach((section, index) => {
        if (section.getBoundingClientRect().top <= window.innerHeight * 0.42) active = index;
      });
      sideIndex.textContent = pad(active + 1);
    }

    // The navigation remembers what it was called before.
    navLinks.forEach((link, index) => {
      const threshold = navSwaps[index] ?? 1.1;
      if (d > threshold) {
        const pieces = (link.dataset.swap || "").split("|");
        if (pieces[1]) mutateText(link, pieces[1]);
      }
    });

    const statusMessages = [
      [0.0, "LULL OS 4.0 · 在线"],
      [0.2, "正在校准感知场"],
      [0.38, "检测到 1 位住户"],
      [0.54, "正在学习你的节奏"],
      [0.67, "心率同步中"],
      [0.79, "门锁已解除"],
      [0.9, "请保持静止"],
    ];

    let status = statusMessages[0][1];
    statusMessages.forEach(([threshold, text]) => {
      if (d >= threshold) status = text;
    });
    if (osText && osText.textContent !== status) osText.textContent = status;

    if (d > 0.8 && osTime) osTime.textContent = "03:17";
  }

  /* ---------- gradual mutations ---------- */

  const corruptionContent = [
    {
      at: 0.31,
      apply: () => {
        const lead = $(".presence__copy .lead");
        const pieces = (lead?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(lead, pieces[1]);
      },
    },
    {
      at: 0.38,
      apply: () => {
        $$(".stat [data-wrong]").forEach((element) => {
          mutateText(element, element.dataset.wrong);
        });
        once("stat-class", () => body.classList.add("stats-corrupted"));
      },
    },
    {
      at: 0.46,
      apply: () => {
        const card = $(".space-card--dawn p[data-swap-long]");
        const pieces = (card?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(card, pieces[1]);
      },
    },
    {
      at: 0.55,
      apply: () => {
        const card = $(".space-card--return p[data-swap-long]");
        const pieces = (card?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(card, pieces[1]);
      },
    },
    {
      at: 0.64,
      apply: () => {
        const card = $(".space-card--night p[data-swap-long]");
        const pieces = (card?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(card, pieces[1]);
      },
    },
    {
      at: 0.68,
      apply: () => {
        const quote = $$(".quote blockquote")[0];
        const pieces = (quote?.dataset.normal || "").split("|");
        if (pieces[1]) mutateText(quote, pieces[1]);
      },
    },
    {
      at: 0.72,
      apply: () => {
        const quote = $$(".quote blockquote")[1];
        const pieces = (quote?.dataset.normal || "").split("|");
        if (pieces[1]) mutateText(quote, pieces[1]);
      },
    },
    {
      at: 0.77,
      apply: () => {
        const quote = $$(".quote blockquote")[2];
        const pieces = (quote?.dataset.normal || "").split("|");
        if (pieces[1]) mutateText(quote, pieces[1]);
      },
    },
    {
      at: 0.84,
      apply: () => {
        const lead = $(".booking__copy .lead");
        const pieces = (lead?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(lead, pieces[1]);
      },
    },
    {
      at: 0.87,
      apply: () => {
        $$("[data-label]").forEach((label) => {
          const pieces = (label.dataset.label || "").split("|");
          if (pieces[1]) mutateText(label, pieces[1]);
        });
        const slots = $(".booking__note [data-wrong]");
        if (slots) mutateText(slots, slots.dataset.wrong);
      },
    },
    {
      at: 0.9,
      apply: () => {
        const fine = $(".form-fine");
        const pieces = (fine?.dataset.swapLong || "").split("|");
        if (pieces[1]) mutateText(fine, pieces[1]);
      },
    },
  ];

  function applyCorruption(d) {
    corruptionContent.forEach((item) => {
      if (d > item.at) once(`corruption-${item.at}`, item.apply);
    });
  }

  /* ---------- toasts ---------- */

  const toastSchedule = [
    [0.24, "客厅 · 检测到轻微移动", 3000],
    [0.44, "正在学习你的作息", 3200],
    [0.62, "门锁状态：已打开", 3800],
    [0.78, "检测到呼吸频率上升", 4100],
    [0.9, "请不要回头", 5000],
  ];

  function applyToasts(d) {
    toastSchedule.forEach(([threshold, message, duration]) => {
      if (d > threshold) {
        once(`toast-${threshold}`, () => showToast(message, duration));
      }
    });
  }

  /* ---------- title ---------- */

  const titleMutations = [
    [0.55, "LULL — 它一直在听"],
    [0.78, "LULL — 不要回头"],
  ];

  function applyTitles(d) {
    titleMutations.forEach(([threshold, title]) => {
      if (d > threshold) once(`title-${threshold}`, () => { document.title = title; });
    });
  }

  /* ---------- body phases ---------- */

  function applyPhases(d, q) {
    const phase = d > 0.9 ? 7 : d > 0.84 ? 6 : d > 0.7 ? 5 : d > 0.55 ? 4 : d > 0.4 ? 3 : d > 0.25 ? 2 : d > 0.1 ? 1 : 0;
    if (body.dataset.phase !== String(phase)) {
      body.dataset.phase = String(phase);
      for (let index = 1; index <= 7; index += 1) {
        body.classList.toggle(`phase-${index}`, phase >= index);
      }
    }

    body.classList.toggle("in-descent", q > 0.0001);
  }

  /* ---------- descent copy + whispers ---------- */

  const descentLines = $$(".descent__line");
  const whispers = $$(".whisper");
  const whisperTimers = new Map();

  function updateDescentCopy(q) {
    descentLines.forEach((line) => {
      const from = Number(line.dataset.from);
      const to = Number(line.dataset.to);
      const active = q >= from && q < to;
      line.classList.toggle("is-on", active);
    });

    whispers.forEach((whisper) => {
      const at = Number(whisper.dataset.at);
      if (q >= at && !whisper.dataset.shown) {
        whisper.dataset.shown = "1";
        whisper.classList.add("is-on");
        const timer = window.setTimeout(() => {
          whisper.classList.remove("is-on");
          whisperTimers.delete(whisper);
        }, 3800);
        whisperTimers.set(whisper, timer);
      }
      if (q < at - 0.16 && whisper.dataset.shown) {
        whisper.classList.remove("is-on");
        const timer = whisperTimers.get(whisper);
        if (timer) window.clearTimeout(timer);
        whisperTimers.delete(whisper);
        delete whisper.dataset.shown;
      }
    });
  }

  /* ---------- descent scene ---------- */

  let breachPlayed = false;
  let endingTimer = 0;
  let endingVisible = false;
  let endingArmed = false;

  function setEnding(show) {
    if (show === endingVisible) return;
    endingVisible = show;
    window.__endCalls = (window.__endCalls || 0) + 1;
    window.__endArg = show;
    ending.classList.toggle("is-on", show);
    body.classList.toggle("is-ending", show);
    window.__endCls = ending.className;
    if (show) {
      document.title = "LULL — 晚安";
    }
  }

  function updateDescent(q, d) {
    // once the room is dark, it stays dark. nothing here moves again.
    if (endingVisible) return;

    const depth = Math.round(q * 87).toString().padStart(3, "0");
    if (depthReadout && depthReadout.textContent !== depth) depthReadout.textContent = depth;

    const descentMessages = [
      [0.0, "感知场已断开"],
      [0.16, "正在重新连接"],
      [0.3, "检测到未登记存在"],
      [0.45, "距离：12.4 米"],
      [0.58, "距离：4.1 米"],
      [0.7, "距离：0.8 米"],
      [0.82, "请保持静止"],
      [0.92, "已接触"],
    ];
    let message = descentMessages[0][1];
    descentMessages.forEach(([threshold, text]) => {
      if (q >= threshold) message = text;
    });
    if (descentStatus && descentStatus.textContent !== message) descentStatus.textContent = message;

    const approach = Math.pow(q, 2.4);
    const entityScale = 0.09 + approach * 1.85;
    // it never comes into focus. that is the point.
    const entityBlur = Math.max(1.2, 4.4 - q * 3.0);
    const entityY = 2 + approach * 3;

    root.style.setProperty("--entity-scale", entityScale.toFixed(3));
    root.style.setProperty("--entity-blur", `${entityBlur.toFixed(2)}px`);
    root.style.setProperty("--entity-y", `${entityY.toFixed(2)}vh`);

    if (entity) {
      entity.style.opacity = q > 0.94 ? String(clamp(1 - (q - 0.94) * 12)) : "1";
    }

    const shouldBreach = q >= 0.9;
    breach.classList.toggle("is-on", shouldBreach);
    body.classList.toggle("is-breaching", shouldBreach);

    if (shouldBreach) {
      once("breach", () => {
        breachPlayed = true;
        sound.impact();
        document.title = "LULL — 它看见你了";
      });
    }

    // an arrival, not a state: once armed it holds through small scroll jitter
    if (q >= 0.94 && !endingArmed) {
      endingArmed = true;
      endingTimer = window.setTimeout(() => {
        setEnding(true);
        endingTimer = 0;
      }, 5200);
    } else if (q < 0.86 && endingArmed) {
      endingArmed = false;
      window.clearTimeout(endingTimer);
      endingTimer = 0;
      if (endingVisible) setEnding(false);
    }

    updateDescentCopy(q);
  }

  /* ---------- entity eye + wall eyes ---------- */

  const wallEyes = $("#wallEyes");
  if (wallEyes) {
    const eyePositions = [
      [13, 31, 0.7], [23, 42, 1.3], [8, 58, 2.1], [18, 66, 3.1],
      [78, 27, 0.9], [87, 38, 2.4], [92, 53, 1.6], [82, 61, 3.7],
      [34, 18, 1.1], [47, 14, 2.7], [61, 17, 3.5], [71, 13, 0.6],
      [29, 72, 2.9], [42, 79, 1.9], [58, 76, 3.9], [69, 71, 0.4],
      [5, 45, 2.2], [95, 69, 1.4], [39, 37, 3.3], [59, 33, 0.2],
    ];
    eyePositions.forEach(([left, top, delay], index) => {
      const eye = document.createElement("span");
      eye.className = "eye-dot";
      eye.style.left = `${left}%`;
      eye.style.top = `${top}%`;
      eye.style.animationDelay = `${delay}s`;
      eye.style.opacity = String(0.2 + (index % 4) * 0.17);
      wallEyes.appendChild(eye);
    });
  }

  /* ---------- film modal ---------- */

  let filmGlitchTimer = 0;
  let filmClockTimer = 0;
  let filmSeconds = 0;

  function filmTimecode() {
    const hours = Math.floor(filmSeconds / 3600);
    const minutes = Math.floor((filmSeconds % 3600) / 60);
    const seconds = filmSeconds % 60;
    if (filmTime) filmTime.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function openFilm() {
    film.classList.add("is-open");
    film.setAttribute("aria-hidden", "false");
    body.style.overflow = "hidden";
    filmScene.classList.remove("is-glitched");
    filmSeconds = 0;
    filmTimecode();
    window.clearInterval(filmClockTimer);
    filmClockTimer = window.setInterval(() => {
      filmSeconds += 1;
      filmTimecode();
    }, 1000);

    window.clearTimeout(filmGlitchTimer);
    filmGlitchTimer = window.setTimeout(() => {
      filmScene.classList.add("is-glitched");
      sound.impact();
    }, 1700);
  }

  function closeFilm() {
    film.classList.remove("is-open");
    film.setAttribute("aria-hidden", "true");
    body.style.overflow = "";
    filmScene.classList.remove("is-glitched");
    window.clearTimeout(filmGlitchTimer);
    window.clearInterval(filmClockTimer);
  }

  filmButton?.addEventListener("click", openFilm);
  filmClose?.addEventListener("click", closeFilm);
  film?.addEventListener("click", (event) => {
    if (event.target === film) closeFilm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && film.classList.contains("is-open")) closeFilm();
  });

  /* ---------- booking form ---------- */

  bookingForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!bookingForm.reportValidity()) return;

    const nameField = bookingForm.elements.namedItem("name");
    const name = nameField && "value" in nameField ? nameField.value.trim() : "";
    const submitLabel = $(".btn--submit [data-label]", bookingForm);
    const submitButton = $(".btn--submit", bookingForm);

    if (submitButton) submitButton.classList.add("is-given");
    if (submitLabel) {
      submitLabel.removeAttribute("data-label");
      submitLabel.textContent = "门已经开了";
    }

    showToast(name ? `${name}，它记住你了。` : "已记录。它记住你了。", 5200);
    window.setTimeout(() => showToast("今晚 03:17，请保持安静。", 4600), 2600);
  });

  /* ---------- pointer ---------- */

  const cursor = $(".cursor");
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let cursorX = pointerX;
  let cursorY = pointerY;
  let mouseX = 0;
  let mouseY = 0;

  if (finePointer && cursor) {
    body.classList.add("has-cursor");
    window.addEventListener(
      "pointermove",
      (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        mouseX = clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1);
        mouseY = clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1);
        root.style.setProperty("--mx", mouseX.toFixed(3));
        root.style.setProperty("--my", mouseY.toFixed(3));
      },
      { passive: true }
    );

    document.addEventListener("pointerover", (event) => {
      if (event.target.closest("a, button, input, label")) body.classList.add("cursor-active");
    });
    document.addEventListener("pointerout", (event) => {
      if (event.target.closest("a, button, input, label")) body.classList.remove("cursor-active");
    });
  }

  /* ---------- static noise ---------- */

  const noiseContext = staticCanvas?.getContext("2d", { alpha: true });
  let staticWidth = 0;
  let staticHeight = 0;
  let lastStaticDraw = 0;

  function sizeStaticCanvas() {
    if (!staticCanvas) return;
    staticWidth = Math.max(80, Math.floor(window.innerWidth / 4));
    staticHeight = Math.max(80, Math.floor(window.innerHeight / 4));
    staticCanvas.width = staticWidth;
    staticCanvas.height = staticHeight;
  }

  function drawStatic(timestamp) {
    if (!noiseContext || !body.classList.contains("is-breaching") || body.classList.contains("ending")) return;
    if (timestamp - lastStaticDraw < 66) return;
    lastStaticDraw = timestamp;

    const image = noiseContext.createImageData(staticWidth, staticHeight);
    for (let i = 0; i < image.data.length; i += 4) {
      const shade = Math.random() > 0.52 ? 255 : 0;
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = Math.random() > 0.58 ? 120 : 20;
    }
    noiseContext.putImageData(image, 0, 0);
  }

  sizeStaticCanvas();
  window.addEventListener("resize", sizeStaticCanvas);

  /* ---------- card tilt ---------- */

  if (finePointer && !reduceMotion) {
    $$("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        if (body.classList.contains("in-descent")) return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `translateY(-8px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ---------- main loop ---------- */

  let frame = 0;

  function loop(timestamp) {
    const ease = reduceMotion ? 1 : 0.18;
    currentD += (targetD - currentD) * ease;
    currentQ += (targetQ - currentQ) * ease;

    if (Math.abs(targetD - currentD) < 0.0003) currentD = targetD;
    if (Math.abs(targetQ - currentQ) < 0.0003) currentQ = targetQ;

    // the final room does not move: freeze the scene where it ended
    if (!endingVisible) {
      if (currentD !== lastD) {
        root.style.setProperty("--d", currentD.toFixed(4));
        lastD = currentD;
      }
      if (currentQ !== lastQ) {
        root.style.setProperty("--q", currentQ.toFixed(4));
        lastQ = currentQ;
      }
    }

    if (currentD > 0) {
      applyCorruption(currentD);
      applyToasts(currentD);
      applyTitles(currentD);
    }
    applyPhases(currentD, currentQ);
    updateChrome(currentD);
    updateDescent(currentQ, currentD);
    sound.update(currentQ, currentD);
    drawStatic(timestamp);

    if (cursor) {
      cursorX += (pointerX - cursorX) * (reduceMotion ? 1 : 0.2);
      cursorY += (pointerY - cursorY) * (reduceMotion ? 1 : 0.2);
      cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
    }

    frame = requestAnimationFrame(loop);
  }

  /* ---------- start ---------- */

  measure();
  window.scrollTo(0, 0);

  window.addEventListener("load", () => {
    measure();
    updateScrollTargets();
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      measure();
      updateScrollTargets();
    });
  }

  restart?.addEventListener("click", () => {
    setEnding(false);
    window.scrollTo(0, 0);
    window.location.reload();
  });

  frame = requestAnimationFrame(loop);
})();
