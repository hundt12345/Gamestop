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

const eventMedia = [
  [
    { kind: "MEME", title: "A thesis gets a face", source: "X / Ryan Cohen", url: "https://x.com/ryancohen", art: "meme", mark: "RC" },
    { kind: "DOC", title: "Ownership trail", source: "SEC / GameStop filings", url: "https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude", art: "doc", mark: "13D" },
    { kind: "VIDEO", title: "The entry, in context", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=Ryan+Cohen+GameStop+2020", art: "video", mark: "▶" }
  ],
  [
    { kind: "DOC", title: "Open letter / full text", source: "GameStop investor relations", url: "https://investor.gamestop.com/", art: "doc", mark: "READ" },
    { kind: "MEME", title: "When the thesis goes public", source: "Community archive", url: "https://www.reddit.com/r/wallstreetbets/", art: "meme", mark: "THESIS" },
    { kind: "VIDEO", title: "Strategy in the feed", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=Ryan+Cohen+GameStop+letter+2020", art: "video", mark: "▶" }
  ],
  [
    { kind: "MEME", title: "I like the stock", source: "X / Roaring Kitty", url: "https://x.com/TheRoaringKitty", art: "meme", mark: "LIKE" },
    { kind: "GIF", title: "Screenshot culture", source: "Giphy / GameStop search", url: "https://giphy.com/search/gamestop", art: "gif", mark: "GIF" },
    { kind: "VIDEO", title: "DFV / original videos", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=Roaring+Kitty+GameStop+DFV", art: "video", mark: "▶" }
  ],
  [
    { kind: "GIF", title: "The line goes vertical", source: "Giphy / squeeze search", url: "https://giphy.com/search/gamestop-squeeze", art: "gif", mark: "↑" },
    { kind: "VIDEO", title: "The week in tape", source: "YouTube / market archive", url: "https://www.youtube.com/results?search_query=GameStop+January+2021+squeeze", art: "video", mark: "▶" },
    { kind: "DOC", title: "Market structure notes", source: "SEC / GameStop spotlight", url: "https://www.sec.gov/spotlight/gamestop-short-squeeze.shtml", art: "doc", mark: "SEC" }
  ],
  [
    { kind: "MEME", title: "Where is the buy button?", source: "Robinhood / help center", url: "https://robinhood.com/us/en/support/articles/why-cant-i-buy-a-stock/", art: "meme", mark: "BUY?" },
    { kind: "VIDEO", title: "The moment becomes a hearing", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=Robinhood+GameStop+buy+button+January+2021", art: "video", mark: "▶" },
    { kind: "DOC", title: "Access / testimony", source: "SEC / testimony", url: "https://www.sec.gov/news/testimony/gensler-testimony-financial-services-2021-02-18", art: "doc", mark: "8-K" }
  ],
  [
    { kind: "VIDEO", title: "Congressional hearing", source: "House Financial Services", url: "https://financialservices.house.gov/calendar/eventsingle.aspx?EventID=4071076", art: "video", mark: "▶" },
    { kind: "MEME", title: "I am not a cat", source: "Hearing / public record", url: "https://www.youtube.com/results?search_query=Keith+Gill+I+am+not+a+cat+hearing", art: "meme", mark: "CAT" },
    { kind: "DOC", title: "The official record", source: "House committee archive", url: "https://financialservices.house.gov/", art: "doc", mark: "PDF" }
  ],
  [
    { kind: "DOC", title: "Due diligence index", source: "Superstonk / wiki", url: "https://www.reddit.com/r/Superstonk/wiki/index/", art: "doc", mark: "DD" },
    { kind: "MEME", title: "Community as archive", source: "Superstonk / live feed", url: "https://www.reddit.com/r/Superstonk/", art: "meme", mark: "DD" },
    { kind: "VIDEO", title: "Explain the mechanics", source: "YouTube / research search", url: "https://www.youtube.com/results?search_query=Superstonk+due+diligence+GameStop", art: "video", mark: "▶" }
  ],
  [
    { kind: "DOC", title: "Split dividend release", source: "GameStop investor relations", url: "https://investor.gamestop.com/", art: "doc", mark: "4:1" },
    { kind: "MEME", title: "A new denominator", source: "Giphy / stock split search", url: "https://giphy.com/search/stock-split", art: "meme", mark: "SPLIT" },
    { kind: "DOC", title: "Read the filing trail", source: "SEC EDGAR", url: "https://www.sec.gov/edgar/browse/?CIK=1326380&owner=exclude", art: "doc", mark: "EDGAR" }
  ],
  [
    { kind: "DOC", title: "Quarterly results", source: "GameStop investor relations", url: "https://investor.gamestop.com/financial-information/quarterly-results", art: "doc", mark: "10-Q" },
    { kind: "VIDEO", title: "Earnings, explained", source: "YouTube / earnings search", url: "https://www.youtube.com/results?search_query=GameStop+earnings+March+2023", art: "video", mark: "▶" },
    { kind: "MEME", title: "Numbers over narrative", source: "Community / research", url: "https://www.gmedd.com/", art: "meme", mark: "$" }
  ],
  [
    { kind: "MEME", title: "The avatar is back", source: "X / Roaring Kitty", url: "https://x.com/TheRoaringKitty", art: "meme", mark: "👀" },
    { kind: "GIF", title: "The feed wakes up", source: "Giphy / Roaring Kitty search", url: "https://giphy.com/search/roaring-kitty", art: "gif", mark: "GIF" },
    { kind: "VIDEO", title: "Return / reaction loop", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=Roaring+Kitty+return+May+2024", art: "video", mark: "▶" }
  ],
  [
    { kind: "DOC", title: "Warrants + filings", source: "SEC EDGAR / current trail", url: "https://investor.gamestop.com/financial-information/sec-filings", art: "doc", mark: "8-K" },
    { kind: "DOC", title: "Earnings / long tail", source: "GameStop quarterly results", url: "https://investor.gamestop.com/financial-information/quarterly-results", art: "doc", mark: "10-K" },
    { kind: "VIDEO", title: "Keep the archive open", source: "YouTube / source search", url: "https://www.youtube.com/results?search_query=GameStop+latest+earnings+filings", art: "video", mark: "▶" }
  ]
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

  const area = svgElement("path", { class: "chart-area line-mode", d: areaPath });
  area.style.fill = `url(#${gradientId})`;
  svg.append(
    area,
    svgElement("path", { class: "chart-line-underlay line-mode", d: linePath }),
    svgElement("path", { class: "chart-line line-mode", d: linePath })
  );

  const candleGroup = svgElement("g", { class: "candle-mode" });
  points.forEach((point, index) => {
    const previousClose = index === 0 ? point.price * 0.88 : points[index - 1].price;
    const open = Math.max(4, previousClose * (point.price >= previousClose ? 0.91 : 1.09));
    const high = Math.max(open, point.price) * 1.16;
    const low = Math.max(4, Math.min(open, point.price) * 0.82);
    const candleWidth = Math.max(8, plotWidth / timelineData.length * 0.42);
    const bodyTop = Math.min(yFor(open), yFor(point.price));
    const bodyHeight = Math.max(4, Math.abs(yFor(point.price) - yFor(open)));
    const candle = svgElement("g", { class: point.price >= open ? "candle up" : "candle down", "data-index": index });
    candle.append(
      svgElement("line", { class: "candle-wick", x1: point.x, x2: point.x, y1: yFor(high), y2: yFor(low) }),
      svgElement("rect", { class: "candle-body", x: point.x - candleWidth / 2, y: bodyTop, width: candleWidth, height: bodyHeight, rx: 1 })
    );
    candleGroup.append(candle);
  });
  svg.append(candleGroup);

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

  const technicalOverlay = svgElement("g", { class: "technical-overlay", "aria-hidden": "true" });
  const triangleOneStart = xFor(1) - 12;
  const triangleOneEnd = xFor(3) + 18;
  const triangleTwoStart = xFor(4) - 18;
  const triangleTwoEnd = xFor(6) + 14;
  technicalOverlay.append(
    svgElement("path", { class: "ta-channel", d: `M${triangleOneStart},${yFor(27)} L${triangleOneEnd},${yFor(78)}` }),
    svgElement("path", { class: "ta-channel support", d: `M${triangleOneStart},${yFor(10)} L${triangleOneEnd},${yFor(78)}` }),
    svgElement("text", { class: "ta-label", x: triangleOneStart + 10, y: yFor(29) - 8 }, "TRIANGLE / COMMUNITY"),
    svgElement("path", { class: "ta-channel", d: `M${triangleTwoStart},${yFor(151)} L${triangleTwoEnd},${yFor(89)}` }),
    svgElement("path", { class: "ta-channel support", d: `M${triangleTwoStart},${yFor(42)} L${triangleTwoEnd},${yFor(89)}` }),
    svgElement("text", { class: "ta-label", x: triangleTwoStart + 16, y: yFor(146) + 22 }, "WEDGE / RE-TEST"),
    svgElement("line", { class: "ta-resistance", x1: xFor(0), x2: xFor(5), y1: yFor(100), y2: yFor(100) }),
    svgElement("text", { class: "ta-label red", x: xFor(0) + 12, y: yFor(100) - 8 }, "RESISTANCE"),
    svgElement("line", { class: "ta-channel support", x1: xFor(5), x2: xFor(10), y1: yFor(22), y2: yFor(22) }),
    svgElement("text", { class: "ta-label blue", x: xFor(7), y: yFor(22) + 17 }, "SUPPORT ZONE")
  );
  svg.append(technicalOverlay);

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

function renderEventMedia(index) {
  const grid = document.querySelector("#media-dock-grid");
  const item = timelineData[index];
  if (!grid || !item) return;

  const media = eventMedia[index] || [];
  grid.innerHTML = media.map((asset) => `
    <a class="media-tile" href="${asset.url}" target="_blank" rel="noreferrer">
      <span class="media-art media-art-${asset.art}" aria-hidden="true"><span class="media-art-label">${asset.mark}<small>${asset.kind}</small></span></span>
      <span class="media-tile-copy"><span class="media-tile-type">${asset.kind} / DIRECT</span><strong>${asset.title}</strong><small>${asset.source} ↗</small></span>
    </a>
  `).join("");

  const title = document.querySelector("#media-event-title");
  const date = document.querySelector("#media-event-date");
  const number = document.querySelector("#media-event-number");
  if (title) title.textContent = item.title;
  if (date) date.textContent = item.date;
  if (number) number.textContent = `${String(index + 1).padStart(2, "0")} / ${timelineData.length}`;
  positionMediaDock(index);
}

function positionMediaDock(index) {
  const dock = document.querySelector("#chart-media-dock");
  const track = document.querySelector("#terminal-track");
  const point = document.querySelector(`#hero-chart .chart-point[data-index="${index}"]`);
  if (!dock || !track || !point) return;
  const trackRect = track.getBoundingClientRect();
  const pointRect = point.getBoundingClientRect();
  const desiredLeft = pointRect.left - trackRect.left + pointRect.width / 2 - dock.offsetWidth / 2;
  const maxLeft = Math.max(18, track.clientWidth - dock.offsetWidth - 18);
  const left = Math.max(18, Math.min(maxLeft, desiredLeft));
  dock.style.left = `${left}px`;
}

function terminalElements() {
  return {
    viewport: document.querySelector("#terminal-viewport"),
    track: document.querySelector("#terminal-track"),
    range: document.querySelector("#terminal-range")
  };
}

function scrollTerminalToIndex(index, behavior = "smooth") {
  const { viewport } = terminalElements();
  const point = document.querySelector(`#hero-chart .chart-point[data-index="${index}"]`);
  if (!viewport || !point) return;
  const viewportRect = viewport.getBoundingClientRect();
  const pointRect = point.getBoundingClientRect();
  const pointOffset = pointRect.left - viewportRect.left + viewport.scrollLeft;
  const target = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, pointOffset - viewport.clientWidth * 0.76));
  viewport.scrollTo({ left: target, behavior });
}

function updateTerminalFromScroll() {
  const { viewport } = terminalElements();
  if (!viewport) return;
  const points = [...document.querySelectorAll("#hero-chart .chart-point")];
  if (!points.length) return;
  const viewportRect = viewport.getBoundingClientRect();
  const targetX = viewportRect.left + viewportRect.width * 0.88;
  const visiblePoints = points.filter((point) => {
    const rect = point.getBoundingClientRect();
    return rect.right > viewportRect.left + 8 && rect.left < viewportRect.right - 8;
  });
  const candidates = visiblePoints.length ? visiblePoints : points;
  const closest = candidates.reduce((best, point) => {
    const bestDistance = Math.abs(best.getBoundingClientRect().left - targetX);
    const distance = Math.abs(point.getBoundingClientRect().left - targetX);
    return distance < bestDistance ? point : best;
  });
  const index = Number(closest.dataset.index);
  if (!Number.isNaN(index) && index !== activeIndex) setActiveEvent(index);
  positionMediaDock(activeIndex);
}

function bindChartTerminal() {
  const { viewport, range } = terminalElements();
  if (!viewport) return;

  let ticking = false;
  viewport.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateTerminalFromScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  viewport.addEventListener("wheel", (event) => {
    if (viewport.scrollWidth <= viewport.clientWidth) return;
    const direction = event.deltaX || event.deltaY;
    const nextScroll = viewport.scrollLeft - direction;
    const canMove = nextScroll >= 0 && nextScroll <= viewport.scrollWidth - viewport.clientWidth;
    if (canMove) {
      event.preventDefault();
      viewport.scrollLeft = nextScroll;
    }
  }, { passive: false });

  let dragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;
  viewport.addEventListener("pointerdown", (event) => {
    dragging = true;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture?.(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    viewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX);
  });
  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    if (event?.pointerId !== undefined) viewport.releasePointerCapture?.(event.pointerId);
  };
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) stopDragging(event);
  });

  range?.addEventListener("input", () => {
    const index = Number(range.value);
    setActiveEvent(index);
    scrollTerminalToIndex(index);
  });

  document.querySelectorAll("[data-terminal-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.terminalStep);
      const nextIndex = Math.max(0, Math.min(timelineData.length - 1, activeIndex + step));
      setActiveEvent(nextIndex);
      scrollTerminalToIndex(nextIndex);
    });
  });

  document.querySelectorAll("[data-terminal-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.terminalJump);
      if (Number.isNaN(index)) return;
      setActiveEvent(index);
      window.setTimeout(() => scrollTerminalToIndex(index), 30);
    });
  });

  const analysisToggle = document.querySelector("#ta-toggle");
  analysisToggle?.addEventListener("click", () => {
    const enabled = document.body.classList.toggle("ta-active");
    analysisToggle.setAttribute("aria-pressed", String(enabled));
    analysisToggle.querySelector("b").textContent = enabled ? "ON" : "OFF";
    document.querySelector("#analysis-panel")?.setAttribute("aria-hidden", String(!enabled));
  });

  const modeToggle = document.querySelector("#chart-mode-toggle");
  modeToggle?.addEventListener("click", () => {
    const candles = document.body.classList.toggle("candles-active");
    modeToggle.setAttribute("aria-pressed", String(candles));
    modeToggle.querySelector(".mode-signal").classList.toggle("is-candles", candles);
    modeToggle.querySelector(".mode-word").textContent = candles ? "CANDLES" : "LINE";
    modeToggle.querySelector("b").textContent = candles ? "↔ LINE" : "↔ CANDLES";
    const modeLabel = document.querySelector("#chart-mode-label");
    if (modeLabel) modeLabel.textContent = candles ? "CANDLE VIEW" : "LINE VIEW";
  });

  window.addEventListener("resize", () => positionMediaDock(activeIndex));
  window.requestAnimationFrame(() => {
    viewport.scrollLeft = viewport.scrollWidth;
    updateTerminalFromScroll();
    positionMediaDock(activeIndex);
  });
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

  const terminalPosition = document.querySelector("#terminal-position");
  const terminalRange = document.querySelector("#terminal-range");
  if (terminalPosition) terminalPosition.textContent = `${String(index + 1).padStart(2, "0")} / ${timelineData.length}`;
  if (terminalRange && document.activeElement !== terminalRange) terminalRange.value = String(index);
  renderEventMedia(index);

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
  setActiveEvent(timelineData.length - 1);
  bindChartTerminal();
  bindTimeline();
  bindMobileNav();
  bindMemePlayer();
  bindSourceFilters();
  bindScrollProgress();
}

document.addEventListener("DOMContentLoaded", initialise);
