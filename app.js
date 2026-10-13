const timelineData = [
  { date: "SEP 2020", title: "The activist entry", price: 7.0, label: "RC / ENTRY", id: "event-rc" },
  { date: "NOV 2020", title: "A letter, not a whisper", price: 8.0, label: "RC / LETTER", id: "event-letter" },
  { date: "JAN 2021", title: "DFV keeps showing the receipts", price: 18.0, label: "DFV / WSB", id: "event-dfv" },
  { date: "27 JAN 2021", title: "The squeeze goes vertical", price: 347.5, label: "SQUEEZE / PEAK", id: "event-squeeze" },
  { date: "28 JAN 2021", title: "The buy button goes dark", price: 193.0, label: "BROKER / FRICTION", id: "event-robinhood" },
  { date: "FEB 2021", title: "The hearing enters the record", price: 40.7, label: "HEARING / RECORD", id: "event-hearing" },
  { date: "JUN 2021", title: "Superstonk builds an archive", price: 55.0, label: "DD / ARCHIVE", id: "event-superstonk" },
  { date: "JUL 2022", title: "A split dividend, a new denominator", price: 35.0, label: "SPLIT / STRUCTURE", id: "event-split" },
  { date: "MAR 2023", title: "Profit changes the texture", price: 23.0, label: "EARNINGS / BUSINESS", id: "event-profit" },
  { date: "MAY 2024", title: "The return of Roaring Kitty", price: 46.6, label: "RETURN / VOLATILITY", id: "event-return" },
  { date: "2025 →", title: "Warrants, filings, the long tail", price: 25.0, label: "FILINGS / LONG TAIL", id: "event-tail" }
];

const chartColors = {
  background: "#090b09",
  acid: "#d8f13e",
  orange: "#ff5c31"
};

const chartDimensions = {
  width: 1000,
  height: 470,
  pad: { top: 28, right: 28, bottom: 47, left: 54 }
};

let activeIndex = 0;

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text) element.textContent = text;
  return element;
}

function buildChart(svg) {
  if (!svg) return;

  const { width, height, pad } = chartDimensions;
  svg.setAttribute("preserveAspectRatio", "none");
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const minLog = Math.log(4);
  const maxLog = Math.log(400);
  const xFor = (index) => pad.left + (index / (timelineData.length - 1)) * plotWidth;
  const yFor = (price) => pad.top + (1 - (Math.log(price) - minLog) / (maxLog - minLog)) * plotHeight;
  const yBottom = height - pad.bottom;

  const gradientId = `chart-area-gradient-${svg.id}`;
  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", { id: gradientId, x1: "0", x2: "0", y1: "0", y2: "1" });
  gradient.append(
    svgElement("stop", { offset: "0%", "stop-color": chartColors.acid, "stop-opacity": "0.19" }),
    svgElement("stop", { offset: "100%", "stop-color": chartColors.acid, "stop-opacity": "0" })
  );
  defs.append(gradient);
  svg.append(defs);

  const grid = svgElement("g", { "aria-hidden": "true" });
  [400, 100, 25, 5].forEach((value) => {
    const y = yFor(value);
    grid.append(
      svgElement("line", { class: "chart-grid major", x1: pad.left, x2: width - pad.right, y1: y, y2: y }),
      svgElement("text", { class: "chart-axis-label", x: 7, y: y + 4 }, `$${value}`)
    );
  });

  const dateLabels = [0, 3, 4, 6, 7, 8, 9, 10];
  dateLabels.forEach((index) => {
    const x = xFor(index);
    grid.append(
      svgElement("line", { class: "chart-grid", x1: x, x2: x, y1: pad.top, y2: yBottom }),
      svgElement("text", { class: "chart-date-label", x, y: height - 15, "text-anchor": index === 0 ? "start" : index === timelineData.length - 1 ? "end" : "middle" }, timelineData[index].date)
    );
  });
  svg.append(grid);

  const points = timelineData.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.price) }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${yBottom} L${points[0].x.toFixed(2)},${yBottom} Z`;

  const area = svgElement("path", { class: "chart-area", d: areaPath });
  area.style.fill = `url(#${gradientId})`;
  svg.append(
    area,
    svgElement("path", { class: "chart-line-underlay", d: linePath }),
    svgElement("path", { class: "chart-line", d: linePath })
  );

  const guides = svgElement("g", { "aria-hidden": "true" });
  points.forEach((point) => {
    guides.append(svgElement("line", { class: "chart-event-guide", x1: point.x, x2: point.x, y1: point.y, y2: yBottom }));
  });
  svg.append(guides);

  const marks = svgElement("g");
  const labelIndexes = new Set([0, 3, 4, 9]);
  points.forEach((point, index) => {
    const pointGroup = svgElement("g", { "data-index": index });
    const hit = svgElement("circle", { class: "chart-point-hit", cx: point.x, cy: point.y, r: 18, tabindex: 0, role: "button", "aria-label": `${point.date}: ${point.title}` });
    const dot = svgElement("circle", { class: "chart-point", cx: point.x, cy: point.y, r: 4.2, "data-index": index });
    const title = svgElement("title", {}, `${point.date} — ${point.title} — $${point.price.toFixed(2)}`);
    dot.append(title);
    pointGroup.append(hit, dot);

    if (labelIndexes.has(index)) {
      const isPeak = index === 3;
      const labelY = isPeak ? point.y + 27 : Math.max(point.y - 16, 18);
      const label = svgElement("text", {
        class: "chart-point-label",
        x: point.x,
        y: labelY,
        "text-anchor": index === 0 ? "start" : index === 9 ? "end" : "middle"
      }, point.label);
      pointGroup.append(label);
    }
    marks.append(pointGroup);
  });
  svg.append(marks);

  svg.querySelectorAll(".chart-point-hit, .chart-point").forEach((target) => {
    const activate = () => {
      const index = Number(target.closest("[data-index]")?.dataset.index ?? target.dataset.index);
      if (!Number.isNaN(index)) setActiveEvent(index, true);
    };
    target.addEventListener("click", activate);
    target.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function setActiveEvent(index, shouldScroll = false) {
  if (!timelineData[index]) return;
  activeIndex = index;
  const item = timelineData[index];

  document.querySelectorAll(".market-chart .chart-point").forEach((point) => {
    point.classList.toggle("is-active", Number(point.dataset.index) === index);
  });
  document.querySelectorAll(".js-event-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.index) === index);
  });
  document.querySelectorAll(".chart-index-dot").forEach((button) => {
    const isActive = Number(button.dataset.index) === index;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });

  const heroDate = document.querySelector("#hero-readout-date");
  const heroPrice = document.querySelector("#hero-readout-price");
  const heroTitle = document.querySelector("#hero-readout-title");
  const activeTitle = document.querySelector("#active-event-title");
  const activeDate = document.querySelector("#active-event-date");
  const activePrice = document.querySelector("#active-event-price");
  const activeNumber = document.querySelector("#active-event-number");

  if (heroDate) heroDate.textContent = item.date;
  if (heroPrice) heroPrice.textContent = formatPrice(item.price);
  if (heroTitle) heroTitle.textContent = item.title;
  if (activeTitle) activeTitle.textContent = item.title;
  if (activeDate) activeDate.textContent = item.date;
  if (activePrice) activePrice.textContent = formatPrice(item.price);
  if (activeNumber) activeNumber.textContent = String(index + 1).padStart(2, "0");

  if (shouldScroll) {
    const eventCard = document.getElementById(item.id);
    eventCard?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function bindTimeline() {
  document.querySelectorAll(".chart-index-dot, [data-jump-index]").forEach((control) => {
    control.addEventListener("click", () => {
      const index = Number(control.dataset.index ?? control.dataset.jumpIndex);
      if (!Number.isNaN(index)) {
        if (control.dataset.jumpIndex !== undefined) {
          document.getElementById(timelineData[index].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          setActiveEvent(index, true);
        }
      }
    });
  });

  document.querySelectorAll(".js-event-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      setActiveEvent(Number(card.dataset.index));
    });
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight * 0.44) - Math.abs(b.boundingClientRect.top - window.innerHeight * 0.44));
    if (visible[0]) setActiveEvent(Number(visible[0].target.dataset.index));
  }, { rootMargin: "-35% 0px -48% 0px", threshold: [0, 0.12, 0.5, 1] });

  document.querySelectorAll(".js-event-card").forEach((card) => observer.observe(card));
}

function bindMobileNav() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".mobile-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const open = toggle.classList.toggle("is-open");
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Navigation schließen" : "Navigation öffnen");
    nav.setAttribute("aria-hidden", String(!open));
  });

  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    toggle.classList.remove("is-open");
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Navigation öffnen");
    nav.setAttribute("aria-hidden", "true");
  }));
}

const memeData = [
  { label: "WSB / 2021", quote: "I LIKE THE STOCK.", caption: "conviction, condensed." },
  { label: "HEARING / 2021", quote: "I AM NOT A CAT.", caption: "a meme becomes testimony." },
  { label: "COMMUNITY / ALWAYS", quote: "HODL THE LINE.", caption: "an internet learns to archive." }
];

let memeIndex = 0;
let memePlaying = false;
let memeStartedAt = 0;
let memeAnimationFrame = null;
const memeDuration = 4400;

function renderMeme(index, animate = true) {
  const card = document.querySelector("#meme-card");
  if (!card) return;
  const item = memeData[index];
  const update = () => {
    document.querySelector("#meme-label").textContent = item.label;
    document.querySelector("#meme-quote").textContent = item.quote;
    document.querySelector("#meme-caption").textContent = item.caption;
    document.querySelector("#meme-counter").textContent = `${String(index + 1).padStart(2, "0")} — ${String(memeData.length).padStart(2, "0")}`;
    document.querySelectorAll(".meme-selector").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.memeIndex) === index));
    card.classList.remove("is-changing");
  };

  if (animate) {
    card.classList.add("is-changing");
    window.setTimeout(update, 170);
  } else {
    update();
  }
}

function nextMeme() {
  memeIndex = (memeIndex + 1) % memeData.length;
  renderMeme(memeIndex);
  memeStartedAt = Date.now();
}

function tickMemeProgress() {
  const fill = document.querySelector("#meme-progress-fill");
  if (!fill) return;
  if (!memePlaying) {
    fill.style.width = "0%";
    memeAnimationFrame = null;
    return;
  }
  const elapsed = Date.now() - memeStartedAt;
  const percentage = Math.min(100, (elapsed / memeDuration) * 100);
  fill.style.width = `${percentage}%`;
  if (elapsed >= memeDuration) nextMeme();
  memeAnimationFrame = window.requestAnimationFrame(tickMemeProgress);
}

function setMemePlaying(playing) {
  memePlaying = playing;
  const playButton = document.querySelector("#meme-play");
  const playLabel = document.querySelector("#meme-play-label");
  if (playButton) {
    playButton.classList.toggle("is-playing", playing);
    playButton.setAttribute("aria-pressed", String(playing));
    playButton.setAttribute("aria-label", playing ? "Meme tape pausieren" : "Meme tape abspielen");
  }
  if (playLabel) playLabel.textContent = playing ? "PAUSE TAPE" : "PLAY TAPE";
  if (playing) {
    memeStartedAt = Date.now();
    if (!memeAnimationFrame) memeAnimationFrame = window.requestAnimationFrame(tickMemeProgress);
  } else if (memeAnimationFrame) {
    window.cancelAnimationFrame(memeAnimationFrame);
    memeAnimationFrame = null;
    const fill = document.querySelector("#meme-progress-fill");
    if (fill) fill.style.width = "0%";
  }
}

function bindMemePlayer() {
  const playButton = document.querySelector("#meme-play");
  playButton?.addEventListener("click", () => setMemePlaying(!memePlaying));
  document.querySelectorAll(".meme-selector").forEach((button) => {
    button.addEventListener("click", () => {
      memeIndex = Number(button.dataset.memeIndex);
      renderMeme(memeIndex);
      if (memePlaying) memeStartedAt = Date.now();
    });
  });
  renderMeme(0, false);
}

function bindSourceFilters() {
  document.querySelectorAll(".source-filter").forEach((filter) => {
    filter.addEventListener("click", () => {
      const value = filter.dataset.filter;
      document.querySelectorAll(".source-filter").forEach((button) => button.classList.toggle("is-active", button === filter));
      document.querySelectorAll(".source-card").forEach((card) => {
        card.classList.toggle("is-hidden", value !== "all" && card.dataset.sourceType !== value);
      });
    });
  });
}

function bindScrollProgress() {
  const fill = document.querySelector("#scroll-progress-fill");
  if (!fill) return;
  let ticking = false;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    fill.style.width = `${progress * 100}%`;
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  update();
}

function initialise() {
  document.querySelectorAll(".market-chart").forEach(buildChart);
  setActiveEvent(0);
  bindTimeline();
  bindMobileNav();
  bindMemePlayer();
  bindSourceFilters();
  bindScrollProgress();
}

document.addEventListener("DOMContentLoaded", initialise);
