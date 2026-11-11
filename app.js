/* =========================================================
   JACE BOOM BOX — application logic
   ========================================================= */
(() => {
  "use strict";

  const AUDIO_DIR = "";
  const MANIFEST_URL = "manifest.json";
  const POLL_MS = 10000;
  const KEYS = { lists: "jbb.lists", theme: "jbb.theme", accent: "jbb.accent", volume: "jbb.volume", muted: "jbb.muted" };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "html") node.innerHTML = v;
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  };

  const ICONS = {
    play: '<svg class="ic-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg class="ic-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  };

  /* ---------------- Storage ---------------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full / disabled */ }
    },
  };

  /* ---------------- State ---------------- */
  const state = {
    sounds: [],                         // [{ file, name }]
    lists: sanitizeLists(store.get(KEYS.lists, [])),
    current: null,                      // filename currently loaded
    volume: clamp(Number(store.get(KEYS.volume, 80)), 0, 100),
    muted: !!store.get(KEYS.muted, false),
    query: "",
    seeking: false,
  };

  function sanitizeLists(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l) => l && typeof l.name === "string")
      .map((l) => ({
        id: String(l.id || uid()),
        name: l.name.slice(0, 60),
        sounds: Array.isArray(l.sounds) ? [...new Set(l.sounds.filter((s) => typeof s === "string"))] : [],
      }));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(n, a, b) { return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : b; }
  const saveLists = () => store.set(KEYS.lists, state.lists);
  const soundByFile = (file) => state.sounds.find((s) => s.file === file);
  const displayName = (file) => soundByFile(file)?.name || prettyName(file.replace(/\.mp4$/i, ""));
  function prettyName(stem) {
    return stem.replace(/[_-]+/g, " ").split(/\s+/).filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  const fmt = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  };

  /* ---------------- Theme ---------------- */
  const root = document.documentElement;
  function applyTheme(theme) {
    root.dataset.theme = theme;
    $("#themeLabel").textContent = theme === "light" ? "Light" : "Dark";
    localStorage.setItem(KEYS.theme, theme);
  }
  function applyAccent(accent) {
    root.dataset.accent = accent;
    localStorage.setItem(KEYS.accent, accent);
    document.querySelectorAll(".swatch").forEach((s) => {
      const on = s.dataset.accent === accent;
      s.classList.toggle("active", on);
      s.setAttribute("aria-checked", on);
    });
  }
  $("#themeToggle").addEventListener("click", () => applyTheme(root.dataset.theme === "light" ? "dark" : "light"));
  document.querySelectorAll(".swatch").forEach((s) => {
    s.setAttribute("role", "radio");
    s.addEventListener("click", () => applyAccent(s.dataset.accent));
  });
  applyTheme(localStorage.getItem(KEYS.theme) === "light" ? "light" : "dark");
  applyAccent(localStorage.getItem(KEYS.accent) || "blue");

  /* ---------------- Audio engine (single player = no overlap) ---------------- */
  const player = $("#player");
  let audioCtx = null, gainNode = null, analyser = null, freqData = null;

  function initAudioGraph() {
    if (audioCtx || location.protocol === "file:") return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
      const src = audioCtx.createMediaElementSource(player);
      gainNode = audioCtx.createGain();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      src.connect(gainNode).connect(analyser).connect(audioCtx.destination);
    } catch {
      audioCtx = gainNode = analyser = null;
    }
    applyVolume();
  }

  function applyVolume() {
    const v = state.muted ? 0 : state.volume / 100;
    if (gainNode) { player.volume = 1; player.muted = false; gainNode.gain.value = v; }
    else { player.volume = state.volume / 100; player.muted = state.muted; }
    const slider = $("#volume");
    slider.value = state.volume;
    slider.style.setProperty("--fill", state.volume + "%");
    $("#volumeOut").textContent = state.volume + "%";
    $("#muteBtn").setAttribute("aria-pressed", state.muted);
    $("#muteLabel").textContent = state.muted ? "Muted" : "Mute";
  }

  function play(file) {
    if (state.current === file && !player.paused) { stop(); return; }
    initAudioGraph();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    // Always stop whatever is playing before starting the next sound.
    player.pause();
    state.current = file;
    player.src = AUDIO_DIR + encodeURIComponent(file);
    player.currentTime = 0;
    const p = player.play();
    if (p && p.catch) p.catch((err) => {
      if (err.name === "AbortError") return; // superseded by a newer click
      toast(`Could not play “${displayName(file)}”`);
      stop();
    });
    updateNowPlaying();
  }

  function stop() {
    player.pause();
    if (player.src) player.currentTime = 0;
    state.current = null;
    player.removeAttribute("src");
    player.load();
    updateNowPlaying();
  }

  ["play", "playing", "pause", "ended", "loadedmetadata", "emptied"].forEach((ev) =>
    player.addEventListener(ev, updateNowPlaying));
  player.addEventListener("ended", () => { state.current = null; updateNowPlaying(); });
  player.addEventListener("timeupdate", updateTime);

  function updateNowPlaying() {
    const file = state.current;
    const playing = !!file && !player.paused && !player.ended;
    const status = $("#npStatus");
    status.className = "lcd-status" + (playing ? " playing" : file ? " paused" : "");
    status.querySelector("b").textContent = playing ? "PLAYING" : file ? "LOADING" : "STOPPED";
    $("#npTitle").textContent = file ? displayName(file) : "— Select a sound —";
    $("#npFile").textContent = file || "\u00a0";
    $("#npSeek").disabled = !file;
    document.body.classList.toggle("is-playing", playing);
    document.title = playing ? `▶ ${displayName(file)} · JACE BOOM BOX` : "JACE BOOM BOX";
    document.querySelectorAll("[data-file]").forEach((n) => n.classList.toggle("playing", !!file && n.dataset.file === file));
    updateTime();
  }

  function updateTime() {
    const d = state.current ? player.duration : 0;
    const t = state.current ? player.currentTime : 0;
    $("#npCurrent").textContent = fmt(t);
    $("#npDuration").textContent = fmt(d);
    if (!state.seeking) $("#npSeek").value = d ? Math.round((t / d) * 1000) : 0;
  }

  const seek = $("#npSeek");
  seek.addEventListener("input", () => {
    state.seeking = true;
    if (player.duration) $("#npCurrent").textContent = fmt((seek.value / 1000) * player.duration);
  });
  seek.addEventListener("change", () => {
    if (player.duration) player.currentTime = (seek.value / 1000) * player.duration;
    state.seeking = false;
  });

  $("#stopBtn").addEventListener("click", stop);
  $("#muteBtn").addEventListener("click", () => {
    state.muted = !state.muted;
    store.set(KEYS.muted, state.muted);
    applyVolume();
  });
  $("#volume").addEventListener("input", (e) => {
    state.volume = clamp(Number(e.target.value), 0, 100);
    if (state.muted && state.volume > 0) { state.muted = false; store.set(KEYS.muted, false); }
    store.set(KEYS.volume, state.volume);
    applyVolume();
  });
  applyVolume();

  /* ---------------- VU meter ---------------- */
  const BAR_COUNT = 12;
  const vuBars = $("#vuBars");
  const bars = Array.from({ length: BAR_COUNT }, () => {
    const i = el("i");
    vuBars.append(el("div", { class: "vu-bar" }, i));
    return i;
  });
  const levels = new Array(BAR_COUNT).fill(0);
  (function renderVu() {
    const playing = state.current && !player.paused;
    if (analyser && playing) analyser.getByteFrequencyData(freqData);
    for (let b = 0; b < BAR_COUNT; b++) {
      let target = 0;
      if (playing) {
        if (analyser) {
          const idx = Math.min(freqData.length - 1, Math.floor((b / BAR_COUNT) * freqData.length * 0.85));
          target = freqData[idx] / 255;
        } else {
          target = (state.muted ? 0 : 0.25 + Math.random() * 0.6 * (1 - b / BAR_COUNT / 1.5));
        }
      }
      levels[b] = target > levels[b] ? target : levels[b] * 0.88;
      bars[b].style.height = Math.max(4, levels[b] * 100) + "%";
    }
    requestAnimationFrame(renderVu);
  })();
  const syncVuHeight = () => vuBars.style.setProperty("--h", vuBars.clientHeight + "px");
  window.addEventListener("resize", syncVuHeight);
  syncVuHeight();

  /* ---------------- Sound discovery ---------------- */
  async function fetchSounds() {
    // 1) manifest.json — generated by build.py (Vercel build) or live by server.py
    try {
      const res = await fetch(MANIFEST_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.sounds;
        if (Array.isArray(list)) return normalise(list.map((s) => (typeof s === "string" ? { file: s } : s)));
      }
    } catch { /* fall through */ }
    // 2) fallback: parse an auto-generated directory listing (e.g. `python -m http.server`)
    const res = await fetch(AUDIO_DIR || "./", { cache: "no-store" });
    if (!res.ok) throw new Error("No audio manifest or directory listing found");
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const files = [...doc.querySelectorAll("a[href]")]
      .map((a) => decodeURIComponent(a.getAttribute("href").split(/[?#]/)[0].split("/").pop()))
      .filter((f) => /\.mp4$/i.test(f));
    return normalise(files.map((file) => ({ file })));
  }

  function normalise(list) {
    const seen = new Set();
    return list
      .filter((s) => s && typeof s.file === "string" && /\.mp4$/i.test(s.file) && !seen.has(s.file) && seen.add(s.file))
      .map((s) => ({ file: s.file, name: s.name || prettyName(s.file.replace(/\.mp4$/i, "")) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }

  async function loadSounds({ silent = false } = {}) {
    try {
      const sounds = await fetchSounds();
      const before = new Set(state.sounds.map((s) => s.file));
      const changed = sounds.length !== state.sounds.length || sounds.some((s) => !before.has(s.file));
      if (!changed && silent) return;
      const added = silent ? sounds.filter((s) => !before.has(s.file)).length : 0;
      state.sounds = sounds;
      renderLibrary();
      renderLists();
      if (added) toast(`${added} new sound${added > 1 ? "s" : ""} detected`);
    } catch (err) {
      if (silent) return;
      console.error(err);
      $("#libCount").textContent = "Could not load sounds";
      const empty = $("#libraryEmpty");
      empty.hidden = false;
      empty.innerHTML = location.protocol === "file:"
        ? "Open the app through a local server: run <code>python server.py</code> and visit <code>http://localhost:8000</code>."
        : "No sounds found. Add MP4 files to the project folder and run <code>python build.py</code>.";
    }
  }

  /* ---------------- Library rendering ---------------- */
  const grid = $("#libraryGrid");

  function listsContaining(file) { return state.lists.filter((l) => l.sounds.includes(file)); }

  function renderLibrary() {
    grid.replaceChildren(...state.sounds.map((s) => {
      const count = listsContaining(s.file).length;
      return el("article", { class: "card", dataset: { file: s.file, search: (s.name + " " + s.file).toLowerCase() } },
        el("button", {
          class: "pad", title: `Play ${s.file}`, "aria-label": `Play ${s.name}`,
          onclick: () => play(s.file),
        },
          el("span", { class: "pad-icon", html: ICONS.play + ICONS.stop }),
          el("span", { class: "pad-name" }, s.name)),
        el("div", { class: "card-meta" },
          el("span", { class: "fname", title: s.file }, s.file),
          el("span", { class: "badge", title: `In ${count} list(s)` }, `${count} list${count === 1 ? "" : "s"}`)),
        el("div", { class: "card-actions" },
          el("button", { class: "hw-btn hw-sm", title: "Add to list", onclick: () => openAddToList(s.file), html: ICONS.plus + "<span>Add</span>" }),
          el("button", { class: "hw-btn hw-sm hw-danger", title: "Remove from list", onclick: () => openRemoveFromList(s.file), html: ICONS.minus + "<span>Remove</span>" })));
    }));
    applySearch();
    updateNowPlaying();
  }

  function applySearch() {
    const q = state.query.trim().toLowerCase();
    let shown = 0;
    grid.querySelectorAll(".card").forEach((c) => {
      const match = !q || q.split(/\s+/).every((term) => c.dataset.search.includes(term));
      c.hidden = !match;
      if (match) shown++;
    });
    const total = state.sounds.length;
    $("#libCount").textContent = q ? `${shown} of ${total} sounds match “${state.query.trim()}”` : `${total} sound${total === 1 ? "" : "s"} loaded`;
    const empty = $("#libraryEmpty");
    empty.hidden = shown > 0;
    empty.textContent = total ? "No sounds match your search." : "No MP4 files found yet.";
  }

  $("#search").addEventListener("input", (e) => { state.query = e.target.value; applySearch(); });

  /* ---------------- Lists ---------------- */
  function createList(name) {
    const list = { id: uid(), name, sounds: [] };
    state.lists.push(list);
    saveLists();
    return list;
  }
  function addToList(listId, file) {
    const list = state.lists.find((l) => l.id === listId);
    if (!list || list.sounds.includes(file)) return;
    list.sounds.push(file);
    saveLists();
    refreshAll();
    toast(`Added “${displayName(file)}” to ${list.name}`);
  }
  function removeFromList(listId, file) {
    const list = state.lists.find((l) => l.id === listId);
    if (!list) return;
    list.sounds = list.sounds.filter((f) => f !== file);
    saveLists();
    refreshAll();
    toast(`Removed “${displayName(file)}” from ${list.name}`);
  }
  function refreshAll() { renderLibrary(); renderLists(); }

  function validateListName(name, exceptId) {
    const n = name.trim();
    if (!n) return "Please enter a list name.";
    if (n.length > 60) return "List name is too long (max 60 characters).";
    if (state.lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === n.toLowerCase())) return "A list with that name already exists.";
    return "";
  }

  function renderLists() {
    const container = $("#listsContainer");
    $("#listsEmpty").hidden = state.lists.length > 0;
    $("#listsCount").textContent = state.lists.length ? `${state.lists.length} custom list${state.lists.length === 1 ? "" : "s"}` : "Build your own event collections";
    container.replaceChildren(...state.lists.map((list) => {
      const chips = list.sounds.map((file) => {
        const missing = !soundByFile(file);
        return el("div", { class: "chip-wrap" },
          el("button", {
            class: "chip" + (missing ? " missing" : ""), dataset: { file },
            title: missing ? `${file} is no longer available` : `Play ${file}`,
            disabled: missing,
            onclick: () => play(file),
          },
            el("span", { class: "dot", html: ICONS.play + ICONS.stop }),
            el("span", {}, displayName(file))),
          el("button", {
            class: "chip-remove", title: `Remove from ${list.name}`, "aria-label": `Remove ${displayName(file)} from ${list.name}`,
            onclick: () => removeFromList(list.id, file),
          }, "×"));
      });
      return el("section", { class: "list-card" },
        el("div", { class: "list-head" },
          el("h3", { class: "list-title" }, list.name,
            el("span", { class: "badge" }, `${list.sounds.length} sound${list.sounds.length === 1 ? "" : "s"}`)),
          el("div", { class: "list-tools" },
            el("button", { class: "hw-btn hw-sm", onclick: () => openRenameList(list), html: ICONS.edit + "<span>Rename</span>" }),
            el("button", { class: "hw-btn hw-sm hw-danger", onclick: () => openDeleteList(list), html: ICONS.trash + "<span>Delete</span>" }))),
        chips.length ? el("div", { class: "chips" }, chips)
          : el("p", { class: "list-empty" }, "This list is empty. Use “Add” on any sound in the library to add it here."));
    }));
    updateNowPlaying();
  }

  /* ---------------- Modal ---------------- */
  const modal = $("#modal");
  let lastFocus = null;

  function openModal({ title, sub = "", body = null, actions = [] }) {
    lastFocus = document.activeElement;
    $("#modalTitle").textContent = title;
    $("#modalSub").textContent = sub;
    $("#modalSub").hidden = !sub;
    $("#modalBody").replaceChildren(...(body ? [body] : []));
    $("#modalActions").replaceChildren(...actions.map((a) =>
      el("button", { class: "hw-btn " + (a.class || ""), onclick: a.onClick || closeModal, type: "button" }, a.label)));
    modal.hidden = false;
    const focusTarget = modal.querySelector("input, .pick:not(:disabled), .modal-actions .hw-btn:last-child");
    focusTarget && focusTarget.focus();
  }
  function closeModal() {
    modal.hidden = true;
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  function promptName({ title, sub, value = "", confirm = "Save", exceptId, onSubmit }) {
    const input = el("input", { class: "modal-input", type: "text", maxlength: 60, placeholder: "Enter List Name", value });
    const error = el("p", { class: "modal-error" });
    const submit = () => {
      const msg = validateListName(input.value, exceptId);
      if (msg) { error.textContent = msg; input.focus(); return; }
      closeModal();
      onSubmit(input.value.trim());
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    openModal({
      title, sub,
      body: el("div", {}, input, error),
      actions: [{ label: "Cancel" }, { label: confirm, class: "hw-accent", onClick: submit }],
    });
    input.select();
  }

  function openCreateList(thenAddFile) {
    promptName({
      title: "Create New List",
      sub: thenAddFile ? `“${displayName(thenAddFile)}” will be added to the new list.` : "e.g. Birthday, Townhall, Fun Friday, Awards Night",
      confirm: "Create List",
      onSubmit: (name) => {
        const list = createList(name);
        if (thenAddFile) addToList(list.id, thenAddFile);
        else { refreshAll(); toast(`List “${name}” created`); }
      },
    });
  }

  function openRenameList(list) {
    promptName({
      title: "Rename List", value: list.name, exceptId: list.id, confirm: "Rename",
      onSubmit: (name) => { list.name = name; saveLists(); refreshAll(); toast("List renamed"); },
    });
  }

  function openDeleteList(list) {
    openModal({
      title: `Delete “${list.name}”?`,
      sub: "The list will be removed. Your audio files are not affected.",
      actions: [
        { label: "Cancel" },
        { label: "Delete List", class: "hw-stop", onClick: () => {
          state.lists = state.lists.filter((l) => l.id !== list.id);
          saveLists(); closeModal(); refreshAll(); toast(`List “${list.name}” deleted`);
        } },
      ],
    });
  }

  function openAddToList(file) {
    if (!state.lists.length) { openCreateList(file); return; }
    const picks = state.lists.map((l) => {
      const has = l.sounds.includes(file);
      return el("button", {
        class: "pick", disabled: has, type: "button",
        onclick: () => { closeModal(); addToList(l.id, file); },
      },
        el("span", {}, l.name, " ", el("small", {}, `· ${l.sounds.length} sound${l.sounds.length === 1 ? "" : "s"}`)),
        el("span", { class: "tag" }, has ? "Added ✓" : "Add"));
    });
    openModal({
      title: "Add To List",
      sub: `Choose a list for “${displayName(file)}”`,
      body: el("div", { class: "pick-list" }, picks),
      actions: [
        { label: "+ New List", onClick: () => openCreateList(file) },
        { label: "Close" },
      ],
    });
  }

  function openRemoveFromList(file) {
    const lists = listsContaining(file);
    if (!lists.length) { toast(`“${displayName(file)}” is not in any list`); return; }
    const picks = lists.map((l) => el("button", {
      class: "pick danger", type: "button",
      onclick: () => { closeModal(); removeFromList(l.id, file); },
    }, el("span", {}, l.name), el("span", { class: "tag" }, "Remove")));
    openModal({
      title: "Remove From List",
      sub: `Choose a list to remove “${displayName(file)}” from`,
      body: el("div", { class: "pick-list" }, picks),
      actions: [{ label: "Close" }],
    });
  }

  $("#createListBtn").addEventListener("click", () => openCreateList());

  /* ---------------- Toasts ---------------- */
  function toast(msg) {
    const t = el("div", { class: "toast" }, msg);
    $("#toasts").append(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 2200);
  }

  /* ---------------- Keyboard shortcuts ---------------- */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && document.activeElement.type !== "range";
    if (e.key === "Escape") {
      if (!modal.hidden) { closeModal(); return; }
      if (typing) { document.activeElement.blur(); return; }
      stop();
      return;
    }
    if (typing || !modal.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    else if (e.key.toLowerCase() === "m") $("#muteBtn").click();
  });

  /* ---------------- Boot ---------------- */
  renderLists();
  loadSounds();
  // Auto-detect newly added MP4 files (live with server.py; on each deploy with Vercel).
  setInterval(() => { if (!document.hidden && modal.hidden) loadSounds({ silent: true }); }, POLL_MS);
})();
