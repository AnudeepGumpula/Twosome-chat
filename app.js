// Twosome: a messenger for exactly two people.
// Messages travel browser to browser (WebRTC via PeerJS). The PeerJS cloud
// server only helps the two browsers find each other; it never sees messages.
// Everything is stored in this browser and deleted after 48 hours.

const TTL_MS = 48 * 60 * 60 * 1000;
const KEY = "twosome.v1";
// Codes are two words. With ~120 words that is about 15,000 combinations.
const WORDS = ["amber","birch","cedar","dune","ember","fjord","glade","harbor","iris","juniper","kelp","lumen","moss","nectar","opal","pine","quartz","reef","sage","tundra","umber","vale","willow","yarrow","zephyr","maple","cobalt","dawn","echo","flint","grove","haze","anchor","basil","cliff","delta","elm","fern","gale","hazel","ivory","jade","koala","lark","mango","noble","olive","pearl","quill","raven","slate","tulip","velvet","wren","zinc","acorn","bloom","cloud","drift","eagle","frost","geyser","heron","indigo","jasper","kiwi","lotus","marble","nimbus","orchid","pebble","quince","river","spruce","thistle","walnut","yucca","zenith","apple","brook","comet","daisy","aspen","coral","dove","fable","garnet","honey","ivy","jewel","kestrel","lemon","mint","nutmeg","otter","plum","quail","robin","sand","thyme","vine","wheat","aloe","brass","cider","dusk","elder","finch","ginger","hollow","island","lilac","meadow","oak","petal","ripple","sunny","tide","violin","willet","pixel","rocket","saffron","tango"];

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
  const a = pick();
  let b = pick();
  while (b === a) b = pick();
  return a + "-" + b;
}
const peerId = (code) => "twosome-" + code;
const cleanCode = (raw) => String(raw || "").trim().toLowerCase().replace(/[\s_]+/g, "-");

// ---------- Animations and small UI pieces (injected here so only this file changes) ----------
const styleEl = document.createElement("style");
styleEl.textContent = [
  "@keyframes msgIn{from{opacity:0;transform:translateY(12px) scale(.95)}to{opacity:1;transform:none}}",
  ".msg.fresh{animation:msgIn .3s ease-out}",
  "@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}",
  "#room.shake{animation:shake .45s ease-out}",
  "@keyframes ring{from{transform:scale(.2);opacity:.9}to{transform:scale(3.2);opacity:0}}",
  ".ring{position:fixed;left:50%;top:50%;width:140px;height:140px;margin:-70px 0 0 -70px;border:4px solid #ffd23f;border-radius:50%;animation:ring .9s ease-out forwards;pointer-events:none;z-index:5}",
  "@keyframes popPill{0%{transform:scale(1)}40%{transform:scale(1.3)}100%{transform:scale(1)}}",
  ".pill.pop{animation:popPill .5s ease-out}",
  ".typing{height:20px;color:#8a8a8a;font-size:13px;display:flex;align-items:center;gap:6px}",
  ".dots{display:inline-flex;gap:3px}",
  ".dots span{width:5px;height:5px;border-radius:50%;background:#8a8a8a;animation:blink 1s infinite}",
  ".dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}",
  "@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}",
  ".orb{display:inline-block;vertical-align:middle;margin-left:8px}",
  ".orb circle{fill:#4d4d4d;transition:fill .4s}",
  ".orb line{stroke:#4d4d4d;stroke-width:2;stroke-dasharray:3 3;transition:stroke .4s}",
  "@keyframes draw{from{stroke-dashoffset:22}to{stroke-dashoffset:0}}",
  ".orb.on circle{fill:#ffd23f;filter:drop-shadow(0 0 4px #ffd23f)}",
  ".orb.on line{stroke:#ffd23f;stroke-dasharray:22;animation:draw .6s ease-out}",
  ".toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#ffd23f;color:#111;padding:8px 14px;border-radius:99px;font-weight:600;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:6}",
  ".toast.show{opacity:1}"
].join("");
document.head.appendChild(styleEl);

const orbEl = document.createElement("span");
orbEl.className = "orb";
orbEl.innerHTML = '<svg width="46" height="14" viewBox="0 0 46 14"><circle cx="7" cy="7" r="5"></circle><line x1="12" y1="7" x2="34" y2="7"></line><circle cx="39" cy="7" r="5"></circle></svg>';
$("conn").before(orbEl);

const typingEl = document.createElement("div");
typingEl.className = "typing";
typingEl.innerHTML = '<span class="dots"><span></span><span></span><span></span></span><span>your person is typing</span>';
typingEl.style.visibility = "hidden";
$("form").before(typingEl);

const toastEl = document.createElement("div");
toastEl.className = "toast";
document.body.appendChild(toastEl);
let toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function ring() {
  const r = document.createElement("div");
  r.className = "ring";
  document.body.appendChild(r);
  setTimeout(() => { try { r.remove(); } catch (e) { /* ignore */ } }, 1000);
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

// ---------- Messages ----------
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

let seen = null; // ids already drawn, so only brand new messages animate in
function render() {
  purge();
  const log = $("log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const firstDraw = seen === null;
  if (firstDraw) seen = new Set();
  log.textContent = "";
  for (const m of state.messages) {
    const left = m.ts + TTL_MS - Date.now();
    const d = document.createElement("div");
    d.className = "msg" + (m.from === "me" ? " me" : "") + (!firstDraw && !seen.has(m.id) ? " fresh" : "");
    seen.add(m.id);
    d.style.opacity = String(0.45 + 0.55 * Math.max(0, Math.min(1, left / TTL_MS))); // fades as it nears deletion
    d.textContent = m.text;
    const s = document.createElement("small");
    s.textContent = fmtLeft(left);
    d.appendChild(s);
    log.appendChild(d);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}

let lastOn = null;
function setConn(on) {
  const el = $("conn");
  const waiting = state.role === "host" ? "waiting for your person" : "offline";
  el.textContent = on ? "connected" : waiting;
  el.className = "pill " + (on ? "on" : "off");
  orbEl.className = "orb" + (on ? " on" : "");
  if (lastOn !== on) {
    lastOn = on;
    void el.offsetWidth;
    el.classList.add("pop");
  }
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

let lastSeen = Date.now();

// The other person is gone (they left, closed the tab, or lost connection).
function peerGone() {
  const c = conn;
  conn = null;
  if (c) { try { c.close(); } catch (e) { /* ignore */ } }
  typingEl.style.visibility = "hidden";
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

let typingHide = null;
function onData(d) {
  if (!d || typeof d !== "object") return;
  lastSeen = Date.now();
  if (d.type === "ping") return;
  if (d.type === "bye") { peerGone(); return; }
  if (d.type === "typing") {
    typingEl.style.visibility = "visible";
    clearTimeout(typingHide);
    typingHide = setTimeout(() => { typingEl.style.visibility = "hidden"; }, 2500);
    return;
  }
  if (d.type === "msg" && typeof d.text === "string") {
    typingEl.style.visibility = "hidden";
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
  ring();
  const room = $("room");
  room.classList.remove("shake");
  void room.offsetWidth;
  room.classList.add("shake");
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  setTimeout(() => el.classList.add("hidden"), 950);
}

// ---------- Connecting ----------
function startPeer(id, onReady, onFail) {
  if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
  peer = new Peer(id || undefined);
  peer.on("open", onReady);
  peer.on("error", onFail);
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
}

function host(code, retries, fresh) {
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
    if (err && err.type === "unavailable-id" && fresh && left > 0) {
      host(makeCode(), left - 1, true); // someone else already has this code, pick another
    } else if (err && err.type === "unavailable-id" && left > 0) {
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

// ---------- Invite link ----------
const inviteBtn = document.createElement("button");
inviteBtn.id = "invite";
inviteBtn.textContent = "invite";
inviteBtn.title = "Copy a link your person can tap to join";
$("poke").before(inviteBtn);

function inviteLink() {
  return location.origin + location.pathname + "#join=" + encodeURIComponent(state.code);
}
function shareFallback(link) {
  if (navigator.share) {
    navigator.share({ title: "Twosome", text: "Join my Twosome room", url: link }).catch(() => { /* cancelled */ });
  } else {
    prompt("Copy this invite link:", link);
  }
}
inviteBtn.onclick = () => {
  if (!state.code) return;
  const link = inviteLink();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(
      () => toast("Invite link copied. Send it to your person."),
      () => shareFallback(link)
    );
  } else {
    shareFallback(link);
  }
};

// ---------- Buttons and inputs ----------
$("code-in").placeholder = "word-word";
$("host").onclick = () => host(makeCode(), 3, true);
$("join").onclick = () => {
  const code = cleanCode($("code-in").value);
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
$("poke").onclick = () => {
  if (conn && conn.open) {
    conn.send({ type: "poke" });
    ring(); // small echo on your own screen so you know it went out
  }
};

let lastTypingSent = 0;
$("msg").addEventListener("input", () => {
  const now = Date.now();
  if (conn && conn.open && now - lastTypingSent > 1500) {
    lastTypingSent = now;
    try { conn.send({ type: "typing" }); } catch (e) { /* ignore */ }
  }
});

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
  seen = null;
  // Tell your person you are leaving first, so they see it right away.
  if (conn && conn.open) { try { conn.send({ type: "bye" }); } catch (e) { /* ignore */ } }
  const oldPeer = peer;
  peer = null;
  conn = null;
  setTimeout(() => { if (oldPeer) { try { oldPeer.destroy(); } catch (e) { /* ignore */ } } }, 300);
  typingEl.style.visibility = "hidden";
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

// ---------- Start: invite link first, otherwise resume a previous room ----------
let inviteCode = "";
try {
  const hit = (location.hash || "").match(/join=([^&]+)/);
  if (hit) inviteCode = cleanCode(decodeURIComponent(hit[1]));
} catch (e) { /* malformed link, ignore */ }

if (inviteCode) {
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  if (state.code !== inviteCode) { state = { code: "", role: "", messages: [], pad: "" }; save(); }
  if (state.role === "host") host(state.code);
  else join(inviteCode);
} else if (state.code && state.role === "host") {
  host(state.code);
} else if (state.code && state.role === "guest") {
  join(state.code);
}
