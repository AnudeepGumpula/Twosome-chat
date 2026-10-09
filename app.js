// Twosome: a messenger for exactly two people.
// Messages travel browser to browser (WebRTC via PeerJS). The PeerJS cloud
// server only helps the two browsers find each other; it never sees messages.
// Everything is stored in this browser and deleted after 48 hours.

const TTL_MS = 48 * 60 * 60 * 1000;
const KEY = "twosome.v1";
const WORDS = ["amber","birch","cedar","dune","ember","fjord","glade","harbor","iris","juniper","kelp","lumen","moss","nectar","opal","pine","quartz","reef","sage","tundra","umber","vale","willow","yarrow","zephyr","maple","cobalt","dawn","echo","flint","grove","haze"];

const $ = (id) => document.getElementById(id);
let peer = null;
let conn = null;
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { code: s.code || "", role: s.role || "", messages: s.messages || [], pad: s.pad || "" };
  } catch (e) {
    return { code: "", role: "", messages: [], pad: "" };
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked */ }
}

function makeCode() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return [pick(), pick(), pick(), pick()].join("-");
}
const peerId = (code) => "twosome-" + code;

function purge() {
  const now = Date.now();
  const before = state.messages.length;
  state.messages = state.messages.filter((m) => m.ts + TTL_MS > now);
  if (state.messages.length !== before) save();
}

function fmtLeft(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h + "h " + String(m).padStart(2, "0") + "m left";
}

function render() {
  purge();
  const log = $("log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.textContent = "";
  for (const m of state.messages) {
    const d = document.createElement("div");
    d.className = "msg" + (m.from === "me" ? " me" : "");
    d.textContent = m.text;
    const s = document.createElement("small");
    s.textContent = fmtLeft(m.ts + TTL_MS - Date.now());
    d.appendChild(s);
    log.appendChild(d);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function setConn(on) {
  const el = $("conn");
  const waiting = state.role === "host" ? "waiting for your person" : "offline";
  el.textContent = on ? "connected" : waiting;
  el.className = "pill " + (on ? "on" : "off");
}

function showRoom() {
  $("pair").classList.add("hidden");
  $("room").classList.remove("hidden");
  $("code-show").textContent = state.code;
  $("pad").value = state.pad;
  setConn(!!(conn && conn.open));
  render();
}

function showPair(msg) {
  $("room").classList.add("hidden");
  $("pair").classList.remove("hidden");
  $("pair-status").textContent = msg || "";
}

// A visible banner under the header that says when your person leaves or returns.
const noticeEl = document.createElement("p");
noticeEl.style.cssText = "margin:0;padding:8px 12px;border-radius:8px;background:#4d1f1f;color:#f3c4c4;font-size:14px;";
noticeEl.hidden = true;
$("room").querySelector("header").after(noticeEl);

function notice(text) {
  noticeEl.textContent = text || "";
  noticeEl.hidden = !text;
}

let lastSeen = Date.now();

// The other person is gone (they left, closed the tab, or lost connection).
function peerGone() {
  const c = conn;
  conn = null;
  if (c) { try { c.close(); } catch (e) { /* ignore */ } }
  setConn(false);
  notice(state.role === "host" ? "Your person left. This room stays open if they come back." : "Your person left the room.");
}

function wire(c) {
  conn = c;
  c.on("open", () => {
    lastSeen = Date.now();
    setConn(true);
    notice("");
    c.send({ type: "pad", text: state.pad });
  });
  c.on("data", onData);
  c.on("close", () => { if (conn === c) peerGone(); });
  c.on("error", () => { if (conn === c) peerGone(); });
}

function onData(d) {
  if (!d || typeof d !== "object") return;
  lastSeen = Date.now();
  if (d.type === "ping") return;
  if (d.type === "bye") { peerGone(); return; }
  if (d.type === "msg" && typeof d.text === "string") {
    state.messages.push({ id: String(d.id || Date.now()), from: "them", text: d.text.slice(0, 2000), ts: Date.now() });
    save();
    render();
  } else if (d.type === "pad" && typeof d.text === "string") {
    state.pad = d.text.slice(0, 10000);
    if ($("pad").value !== state.pad) $("pad").value = state.pad;
    save();
  } else if (d.type === "poke") {
    pulse();
  }
}

function pulse() {
  const el = $("pulse");
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  setTimeout(() => el.classList.add("hidden"), 950);
}

function startPeer(id, onReady, onFail) {
  if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
  peer = new Peer(id || undefined);
  peer.on("open", onReady);
  peer.on("error", onFail);
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
}

function host(code, retries) {
  const left = retries === undefined ? 3 : retries;
  $("pair-status").textContent = "Starting room...";
  startPeer(peerId(code), () => {
    state.code = code;
    state.role = "host";
    save();
    peer.on("connection", (c) => {
      if (conn && conn.open) { c.close(); return; } // exactly two people
      wire(c);
    });
    showRoom();
  }, (err) => {
    if (err && err.type === "unavailable-id" && left > 0) {
      setTimeout(() => host(code, left - 1), 1500); // stale id from a previous tab, wait it out
    } else {
      showPair("Could not start the room: " + (err && err.type ? err.type : "unknown error"));
    }
  });
}

function join(code) {
  $("pair-status").textContent = "Connecting...";
  startPeer(null, () => {
    const c = peer.connect(peerId(code), { reliable: true });
    let opened = false;
    c.on("open", () => {
      opened = true;
      state.code = code;
      state.role = "guest";
      save();
      showRoom();
    });
    wire(c);
    setTimeout(() => { if (!opened) showPair("No one is in that room yet. Check the code."); }, 10000);
  }, (err) => {
    showPair("Could not connect: " + (err && err.type ? err.type : "unknown error"));
  });
}

$("host").onclick = () => host(makeCode());
$("join").onclick = () => {
  const code = $("code-in").value.trim().toLowerCase();
  if (!code) return;
  join(code);
};
$("form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("msg").value.trim();
  if (!text) return;
  const m = { id: String(Date.now()) + Math.random().toString(36).slice(2, 6), from: "me", text, ts: Date.now() };
  state.messages.push(m);
  save();
  if (conn && conn.open) conn.send({ type: "msg", id: m.id, text });
  $("msg").value = "";
  render();
  $("log").scrollTop = $("log").scrollHeight;
};
$("poke").onclick = () => { if (conn && conn.open) conn.send({ type: "poke" }); };

let padTimer = null;
$("pad").oninput = () => {
  state.pad = $("pad").value;
  save();
  clearTimeout(padTimer);
  padTimer = setTimeout(() => { if (conn && conn.open) conn.send({ type: "pad", text: state.pad }); }, 250);
};
$("leave").onclick = () => {
  if (!confirm("Leave and delete everything on this device?")) return;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  state = { code: "", role: "", messages: [], pad: "" };
  // Tell your person you are leaving first, so they see it right away.
  if (conn && conn.open) { try { conn.send({ type: "bye" }); } catch (e) { /* ignore */ } }
  const oldPeer = peer;
  peer = null;
  conn = null;
  setTimeout(() => { if (oldPeer) { try { oldPeer.destroy(); } catch (e) { /* ignore */ } } }, 300);
  setConn(false);
  notice("");
  showPair("");
};

setInterval(render, 30000);

// Heartbeat: catches a closed tab or a lost connection when no "bye" arrives.
setInterval(() => {
  if (conn && conn.open) {
    try { conn.send({ type: "ping" }); } catch (e) { /* ignore */ }
    if (Date.now() - lastSeen > 20000) peerGone();
  }
}, 5000);

// Resume a previous room on reload.
if (state.code && state.role === "host") host(state.code);
else if (state.code && state.role === "guest") join(state.code);
