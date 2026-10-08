const PLACE_STORAGE = "sky.lastPlace";
const DEFAULT_PLACE = { name: "Київ", country: "UA", lat: 50.4501, lon: 30.5234 };

const THEME_COLORS = {
  "clear-day": "#8ec8f5",
  "clear-night": "#070b16",
  "clouds-day": "#8ea3b8",
  "clouds-night": "#121722",
  rain: "#1b3348",
  snow: "#c5d4e6",
  storm: "#120c18",
  mist: "#b7c4c2",
};

const DIRS = ["Пн", "Пн-Сх", "Сх", "Пд-Сх", "Пд", "Пд-Зх", "Зх", "Пн-Зх"];

const WMO = {
  0: { day: "01d", night: "01n", text: "Ясно" },
  1: { day: "01d", night: "01n", text: "Переважно ясно" },
  2: { day: "02d", night: "02n", text: "Мінлива хмарність" },
  3: { day: "04d", night: "04n", text: "Хмарно" },
  45: { day: "50d", night: "50n", text: "Туман" },
  48: { day: "50d", night: "50n", text: "Інійний туман" },
  51: { day: "09d", night: "09n", text: "Мряка" },
  53: { day: "09d", night: "09n", text: "Мряка" },
  55: { day: "09d", night: "09n", text: "Сильна мряка" },
  56: { day: "09d", night: "09n", text: "Крижана мряка" },
  57: { day: "09d", night: "09n", text: "Сильна крижана мряка" },
  61: { day: "10d", night: "10n", text: "Невеликий дощ" },
  63: { day: "10d", night: "10n", text: "Дощ" },
  65: { day: "10d", night: "10n", text: "Сильний дощ" },
  66: { day: "10d", night: "10n", text: "Крижаний дощ" },
  67: { day: "10d", night: "10n", text: "Сильний крижаний дощ" },
  71: { day: "13d", night: "13n", text: "Невеликий сніг" },
  73: { day: "13d", night: "13n", text: "Сніг" },
  75: { day: "13d", night: "13n", text: "Сильний сніг" },
  77: { day: "13d", night: "13n", text: "Снігова крупа" },
  80: { day: "09d", night: "09n", text: "Невеликі зливи" },
  81: { day: "09d", night: "09n", text: "Зливи" },
  82: { day: "09d", night: "09n", text: "Сильні зливи" },
  85: { day: "13d", night: "13n", text: "Снігові зливи" },
  86: { day: "13d", night: "13n", text: "Сильні снігові зливи" },
  95: { day: "11d", night: "11n", text: "Гроза" },
  96: { day: "11d", night: "11n", text: "Гроза з градом" },
  99: { day: "11d", night: "11n", text: "Сильна гроза з градом" },
};

const state = {
  place: null,
  weather: null,
  loading: false,
  error: "",
};

let weatherReq = 0;
let lookupId = 0;
let regionNames;

const $ = (id) => document.getElementById(id);
const cityInput = $("city");
const suggest = $("suggest");
const statusEl = $("status");
const stage = $("stage");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function cap(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toLocaleUpperCase("uk") + text.slice(1) : "";
}

function degrees(value) {
  return `${Math.round(value)}°`;
}

function oneDecimal(value) {
  return Number(value).toFixed(1).replace(".", ",");
}

function countryName(code) {
  if (!code) return "";
  try {
    regionNames ||= new Intl.DisplayNames(["uk"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

function parseLocal(iso) {
  return new Date(`${iso}:00`);
}

function dayKeyFromIso(iso) {
  return String(iso).slice(0, 10);
}

function formatWhen(iso) {
  const date = parseLocal(iso);
  const label = new Intl.DateTimeFormat("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${cap(label)} · ${hm}`;
}

function formatHour(iso) {
  const date = parseLocal(iso);
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatDayName(iso, currentIso) {
  if (dayKeyFromIso(iso) === dayKeyFromIso(currentIso)) return "Сьогодні";
  const name = new Intl.DateTimeFormat("uk-UA", { weekday: "short" }).format(parseLocal(iso));
  return cap(name.replace(".", ""));
}

function formatDayDate(iso) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
  }).format(parseLocal(iso));
}

function clockFromIso(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function windDir(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return "";
  return DIRS[Math.round(Number(deg) / 45) % 8];
}

function km(meters) {
  if (meters == null) return "—";
  const value = meters / 1000;
  return `${value >= 10 ? Math.round(value) : oneDecimal(value)} км`;
}

function wxInfo(code, isDay = true) {
  const entry = WMO[code] || { day: "03d", night: "03n", text: "Хмарно" };
  return {
    icon: isDay ? entry.day : entry.night,
    text: entry.text,
  };
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function loadStoredPlace() {
  try {
    const place = JSON.parse(localStorage.getItem(PLACE_STORAGE) || "null");
    if (place && typeof place.lat === "number" && typeof place.lon === "number" && place.name) return place;
  } catch {
    /* ignore broken storage */
  }
  return null;
}

async function api(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    const error = new Error("Немає з’єднання з Open-Meteo.");
    error.status = 0;
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.reason || data?.error || "Запит не вдався.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function iconSvg(code) {
  const bodies = {
    sun: '<circle cx="24" cy="24" r="7"/><path d="M24 5v4.5M24 38.5V43M5 24h4.5M38.5 24H43M10 10l3.2 3.2M34.8 34.8 38 38M38 10l-3.2 3.2M13.2 34.8 10 38"/>',
    moon: '<path d="M30 8.5A12.5 12.5 0 1 0 37 29 10 10 0 0 1 30 8.5z"/>',
    cloud: '<path d="M16 34h16.5a7 7 0 0 0 .8-14 9.2 9.2 0 0 0-17.6-2.4A6.2 6.2 0 0 0 16 34z"/>',
    overcast: '<path d="M13 29h15a6 6 0 0 0 .4-12 8 8 0 0 0-15.2-1.6A5.5 5.5 0 0 0 13 29z"/><path d="M20 36h15a5.5 5.5 0 0 0 .3-11 7 7 0 0 0-13.2-1.4"/>',
    "part-day": '<circle cx="16" cy="15" r="5"/><path d="M18 36h15a6.2 6.2 0 0 0 .4-12.4 8 8 0 0 0-15.2-1.6A5.4 5.4 0 0 0 18 36z"/>',
    "part-night": '<path d="M18 7.5a7 7 0 1 0 4 12.2A6 6 0 0 1 18 7.5z"/><path d="M18 36h15a6.2 6.2 0 0 0 .4-12.4 8 8 0 0 0-15.2-1.6A5.4 5.4 0 0 0 18 36z"/>',
    rain: '<path d="M16 31h16.5a7 7 0 0 0 .8-14 9.2 9.2 0 0 0-17.6-2.4A6.2 6.2 0 0 0 16 31z"/><path d="M20 36v6M26 37v6M32 36v6"/>',
    shower: '<path d="M16 30h16.5a7 7 0 0 0 .8-14 9.2 9.2 0 0 0-17.6-2.4A6.2 6.2 0 0 0 16 30z"/><path d="M18 35v7M24 36v7M30 35v7M36 36v5"/>',
    storm: '<path d="M15 30h16a6.5 6.5 0 0 0 .6-13 8.6 8.6 0 0 0-16.4-2A5.8 5.8 0 0 0 15 30z"/><path d="M27 32l-6 8h5l-4 8"/>',
    snow: '<path d="M16 31h16.5a7 7 0 0 0 .8-14 9.2 9.2 0 0 0-17.6-2.4A6.2 6.2 0 0 0 16 31z"/><circle cx="21" cy="38" r="1.4" fill="currentColor" stroke="none"/><circle cx="28" cy="42" r="1.4" fill="currentColor" stroke="none"/><circle cx="34" cy="37" r="1.4" fill="currentColor" stroke="none"/>',
    mist: '<path d="M8 18h32M6 24h36M10 30h28M12 36h20"/>',
  };
  const names = {
    "01d": "sun",
    "01n": "moon",
    "02d": "part-day",
    "02n": "part-night",
    "03d": "cloud",
    "03n": "cloud",
    "04d": "overcast",
    "04n": "overcast",
    "09d": "shower",
    "09n": "shower",
    "10d": "rain",
    "10n": "rain",
    "11d": "storm",
    "11n": "storm",
    "13d": "snow",
    "13n": "snow",
    "50d": "mist",
    "50n": "mist",
  };
  const body = bodies[names[code] || "cloud"];
  return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function skyKind(code, isDay) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([45, 48].includes(code)) return "mist";
  if (code === 0 || code === 1) return isDay ? "clear-day" : "clear-night";
  return isDay ? "clouds-day" : "clouds-night";
}

function normalizeWeather(data) {
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  const isDay = Boolean(current.is_day);
  const nowInfo = wxInfo(current.weather_code, isDay);

  const hours = [{
    label: "Зараз",
    temp: current.temperature_2m,
    icon: nowInfo.icon,
    pop: null,
  }];

  const now = new Date(current.time);
  let added = 0;
  for (let i = 0; i < hourly.time.length && added < 8; i += 1) {
    const time = parseLocal(hourly.time[i]);
    if (time <= now) continue;
    const day = hourly.is_day?.[i] ?? (time.getHours() >= 6 && time.getHours() < 21 ? 1 : 0);
    const info = wxInfo(hourly.weather_code[i], Boolean(day));
    hours.push({
      label: formatHour(hourly.time[i]),
      temp: hourly.temperature_2m[i],
      icon: info.icon,
      pop: hourly.precipitation_probability[i] == null
        ? null
        : Math.round(hourly.precipitation_probability[i]),
    });
    added += 1;
  }

  const days = daily.time.map((date, index) => {
    const info = wxInfo(daily.weather_code[index], true);
    return {
      iso: `${date}T12:00`,
      min: daily.temperature_2m_min[index],
      max: daily.temperature_2m_max[index],
      icon: info.icon,
      desc: info.text,
      pop: daily.precipitation_probability_max[index] == null
        ? 0
        : Math.round(daily.precipitation_probability_max[index]),
    };
  }).slice(0, 5);

  return {
    time: current.time,
    temp: current.temperature_2m,
    feels: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
    windDeg: current.wind_direction_10m,
    pressure: current.surface_pressure ?? current.pressure_msl,
    visibility: current.visibility,
    code: current.weather_code,
    isDay,
    icon: nowInfo.icon,
    desc: nowInfo.text,
    sunrise: daily.sunrise?.[0],
    sunset: daily.sunset?.[0],
    hours,
    days,
  };
}

function sparkline(temps) {
  if (temps.length < 2) return "";
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const width = 120;
  const height = 36;
  const pad = 4;
  const points = temps.map((temp, index) => {
    const x = (index / (temps.length - 1)) * width;
    const y = pad + (1 - (temp - min) / (max - min || 1)) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" /></svg>`;
}

function rangeStyle(min, max, weekMin, weekMax) {
  const span = weekMax - weekMin || 1;
  const left = ((min - weekMin) / span) * 100;
  const width = Math.max(((max - min) / span) * 100, 8);
  return `left:${left.toFixed(1)}%;width:${Math.min(width, 100 - left).toFixed(1)}%`;
}

function stat(label, value, hint = "") {
  return `<article class="stat"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-hint">${hint}</p></article>`;
}

function welcomeHtml() {
  if (state.error) {
    return `<section class="empty"><h1>Не вийшло завантажити</h1><p class="lead">${esc(state.error)}</p><button class="primary" id="retry" type="button">Спробувати ще</button></section>`;
  }
  return `<section class="empty"><p class="eyebrow">Open-Meteo</p><h1>Небо над вашим містом</h1><p class="lead">Оберіть місто або дозвольте геолокацію — і тут з’явиться погода, вітер і прогноз на п’ять днів.</p></section>`;
}

function skeletonHtml() {
  return `<div class="skel hero-skel"></div><div class="skel"></div><div class="skel tall"></div>`;
}

function viewHtml() {
  const weather = state.weather;
  const today = weather.days[0];
  const weekMin = weather.days.length ? Math.min(...weather.days.map((day) => day.min)) : 0;
  const weekMax = weather.days.length ? Math.max(...weather.days.map((day) => day.max)) : 1;
  const country = countryName(state.place.country);
  const pressure = weather.pressure == null ? "—" : `${Math.round(weather.pressure * 0.75006156)} мм`;

  const hourCards = weather.hours.map((hour) => `
    <article class="hour">
      <span class="label">${esc(hour.label)}</span>
      ${iconSvg(hour.icon)}
      <span class="t">${degrees(hour.temp)}</span>
      <span class="pop">${hour.pop ? `${hour.pop}%` : ""}</span>
    </article>
  `).join("");

  const dayRows = weather.days.map((day) => `
    <article class="day">
      <div class="day-name">
        <strong>${esc(formatDayName(day.iso, weather.time))}</strong>
        <span>${esc(formatDayDate(day.iso))}</span>
      </div>
      <div class="day-wx">
        ${iconSvg(day.icon)}
        <span class="day-desc">${esc(day.desc)}${day.pop ? ` · ${day.pop}%` : ""}</span>
      </div>
      <div class="range">
        <span class="lo">${degrees(day.min)}</span>
        <span class="bar"><span class="fill" style="${rangeStyle(day.min, day.max, weekMin, weekMax)}"></span></span>
        <span class="hi">${degrees(day.max)}</span>
      </div>
    </article>
  `).join("");

  return `
    <section class="hero">
      <div>
        ${country ? `<p class="eyebrow">${esc(country)}</p>` : ""}
        <h1>${esc(state.place.name)}</h1>
        <p class="when">${esc(formatWhen(weather.time))}</p>
      </div>
      <div class="now">
        <div class="wx-lg">${iconSvg(weather.icon)}</div>
        <p class="temp">${degrees(weather.temp)}</p>
        <div class="now-copy">
          <p class="desc">${esc(weather.desc)}</p>
          <p class="feels">Відчувається як ${degrees(weather.feels)}${today ? ` · від ${degrees(today.min)} до ${degrees(today.max)}` : ""}</p>
        </div>
      </div>
    </section>
    <section class="stats panel">
      ${stat("Вітер", `${oneDecimal(weather.wind || 0)} м/с`, windDir(weather.windDeg))}
      ${stat("Вологість", `${Math.round(weather.humidity)}%`)}
      ${stat("Тиск", pressure, "рт. ст.")}
      ${stat("Видимість", km(weather.visibility))}
      ${stat("Схід", clockFromIso(weather.sunrise))}
      ${stat("Захід", clockFromIso(weather.sunset))}
    </section>
    <section class="panel block" aria-labelledby="hourly-title">
      <div class="block-head">
        <h2 id="hourly-title">Найближчі години</h2>
        ${sparkline(weather.hours.map((hour) => hour.temp))}
      </div>
      <div class="hours">${hourCards}</div>
    </section>
    <section class="panel block" aria-labelledby="daily-title">
      <h2 id="daily-title">П’ять днів</h2>
      <div class="days">${dayRows}</div>
    </section>
  `;
}

function markChip() {
  const name = state.place?.name;
  document.querySelectorAll(".chip").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.city === name);
  });
}

function render() {
  const sky = state.weather
    ? skyKind(state.weather.code, state.weather.isDay)
    : "clear-day";
  document.body.dataset.sky = sky;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", THEME_COLORS[sky] || "#8ec8f5");
  if (!state.weather) {
    stage.innerHTML = state.loading ? skeletonHtml() : welcomeHtml();
  } else {
    stage.innerHTML = viewHtml();
    document.title = `${Math.round(state.weather.temp)}° ${state.place.name} — Небо`;
  }
  markChip();
}

function hideSuggest() {
  suggest.hidden = true;
  suggest.replaceChildren();
}

function toPlace(item) {
  return {
    name: item.name,
    country: item.country_code || "",
    state: item.admin1 || "",
    lat: item.latitude,
    lon: item.longitude,
  };
}

async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=uk&format=json`;
  const data = await api(url);
  return Array.isArray(data?.results) ? data.results : [];
}

function showSuggestions(places) {
  suggest.replaceChildren();
  if (!places.length) {
    suggest.hidden = true;
    return;
  }
  for (const place of places) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    const name = document.createElement("span");
    const meta = document.createElement("small");
    name.textContent = place.name;
    meta.textContent = [countryName(place.country), place.state].filter(Boolean).join(" · ");
    button.append(name, meta);
    button.addEventListener("click", () => selectPlace(place));
    item.append(button);
    suggest.append(item);
  }
  suggest.hidden = false;
}

async function lookup(query) {
  const id = ++lookupId;
  try {
    const places = (await geocode(query)).map(toPlace);
    if (id !== lookupId) return;
    showSuggestions(places);
  } catch {
    if (id !== lookupId) return;
    hideSuggest();
  }
}

async function loadWeather() {
  if (!state.place) state.place = DEFAULT_PLACE;
  const req = ++weatherReq;
  state.loading = true;
  state.error = "";
  setStatus("Оновлюємо погоду…");
  render();

  try {
    const { lat, lon } = state.place;
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "pressure_msl",
        "surface_pressure",
        "wind_speed_10m",
        "wind_direction_10m",
        "visibility",
      ].join(","),
      hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "5",
      wind_speed_unit: "ms",
    });
    const data = await api(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (req !== weatherReq) return;
    state.weather = normalizeWeather(data);
    setStatus("");
  } catch (error) {
    if (req !== weatherReq) return;
    state.error = error.message || "Не вдалося отримати дані.";
    setStatus(state.weather ? state.error : "");
  } finally {
    if (req === weatherReq) {
      state.loading = false;
      render();
    }
  }
}

async function selectPlace(place) {
  state.place = place;
  localStorage.setItem(PLACE_STORAGE, JSON.stringify(place));
  cityInput.value = place.name;
  hideSuggest();
  await loadWeather();
}

async function searchAndLoad(query) {
  setStatus("Шукаємо місто…");
  try {
    const list = await geocode(query);
    if (!list.length) {
      setStatus("Місто не знайдено.");
      return;
    }
    await selectPlace(toPlace(list[0]));
  } catch (error) {
    setStatus(error.message || "Помилка пошуку.");
  }
}

let searchTimer = 0;
cityInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = cityInput.value.trim();
  if (query.length < 2) {
    hideSuggest();
    return;
  }
  searchTimer = setTimeout(() => lookup(query), 280);
});

$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;
  const first = suggest.querySelector("button");
  if (first && !suggest.hidden) {
    first.click();
    return;
  }
  searchAndLoad(query);
});

cityInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideSuggest();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search")) hideSuggest();
});

$("chips").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  searchAndLoad(button.dataset.city);
});

$("geo").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Браузер не підтримує геолокацію.");
    return;
  }
  setStatus("Визначаємо місце…");
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const { latitude: lat, longitude: lon } = position.coords;
      await selectPlace({ name: "Моє місце", country: "", lat, lon });
    } catch (error) {
      setStatus(error.message || "Не вдалося визначити місце.");
    }
  }, () => {
    setStatus("Доступ до геолокації заборонено.");
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
});

stage.addEventListener("click", (event) => {
  if (event.target.closest("#retry")) loadWeather();
});

state.place = loadStoredPlace() || DEFAULT_PLACE;
cityInput.value = state.place.name;
loadWeather();
