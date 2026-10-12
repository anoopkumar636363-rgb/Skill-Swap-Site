(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const storage = window.localStorage;
  const state = { id: storage.getItem("skillswap_id") || makeId(), name: storage.getItem("skillswap_name") || "", teach: [], learn: [], matches: [], swaps: [], activeSwap: null, activeRecipient: null, filter: "", selectedSkill: "" };
  storage.setItem("skillswap_id", state.id);
  let noticeTimer;
  let pollTimer;

  function initSkillCube() {
    const scene = $("#skill-cube-scene");
    const cube = $("#skill-cube");
    if (!scene || !cube) return;
    let frame = 0;
    scene.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        cube.style.setProperty("--cube-y", (-34 + x * 48) + "deg");
        cube.style.setProperty("--cube-x", (-23 - y * 34) + "deg");
      });
    });
    scene.addEventListener("pointerleave", () => {
      cancelAnimationFrame(frame);
      cube.style.setProperty("--cube-x", "-23deg");
      cube.style.setProperty("--cube-y", "-34deg");
    });
    scene.addEventListener("focus", () => {
      cube.style.setProperty("--cube-x", "-18deg");
      cube.style.setProperty("--cube-y", "24deg");
    }, true);
  }
  function makeId() { return (crypto.randomUUID ? crypto.randomUUID() : "person-" + Math.random().toString(36).slice(2) + Date.now().toString(36)); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char])); }
  function initials(name) { return (name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?"; }
  function listSkills(value) {
    const result = []; const seen = new Set();
    value.split(",").forEach(raw => { const skill = raw.trim().replace(/\s+/g, " ").slice(0, 64); const key = skill.toLocaleLowerCase(); if (skill && !seen.has(key) && result.length < 30) { seen.add(key); result.push(skill); } });
    return result;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
    return data;
  }
  function notify(message, error = false) {
    const el = $("#notice"); el.textContent = message; el.classList.toggle("error", error); el.classList.remove("hidden");
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.classList.add("hidden"), 4200);
  }
  function showView(name) {
    if (name === "chat" && !state.activeSwap) name = "messages";
    $$(".view").forEach(view => view.classList.toggle("active", view.id === "view-" + name));
    $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name || (name === "chat" && link.dataset.view === "messages")));
    const labels = { discover:"DISCOVER", profile:"YOUR SKILLS", requests:"SWAP REQUESTS", messages:"CONVERSATIONS", chat:"CONVERSATIONS" };
    $("#breadcrumb-current").textContent = labels[name] || "DISCOVER";
    $("#sidebar").classList.remove("open");
    if (name === "discover") loadMatches();
    if (name === "requests" || name === "messages") loadSwaps();
    if (name === "profile") fillProfile();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function fillProfile() { $("#display-name").value = state.name; $("#teach-skills").value = state.teach.join(", "); $("#learn-skills").value = state.learn.join(", "); }
  function updateIdentity() { $("#top-name").textContent = state.name || "Your profile"; $("#top-avatar").textContent = initials(state.name); }
  function openWelcome() {
    if (state.name) return;
    $("#welcome-name").value = "";
    if (!$("#welcome-dialog").open) $("#welcome-dialog").showModal();
    setTimeout(() => $("#welcome-name").focus(), 60);
  }
  async function saveWelcomeName(event) {
    event.preventDefault();
    const name = $("#welcome-name").value.trim();
    if (!name) return;
    const button = $("#welcome-form button[type=submit]");
    button.disabled = true;
    button.textContent = "Just a moment…";
    try {
      const profile = await api("/api/users", { method:"POST", body:JSON.stringify({ id:state.id, name }) });
      state.name = profile.name;
      state.teach = profile.teach || [];
      state.learn = profile.learn || [];
      storage.setItem("skillswap_name", state.name);
      updateIdentity();
      $("#welcome-dialog").close();
      fillProfile();
      await loadMatches();
      await loadSwaps();
      notify("Welcome, " + state.name + ". Add your skills whenever you're ready.");
    } catch (error) {
      $("#welcome-error").textContent = error.message;
      $("#welcome-error").classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.innerHTML = 'Let\'s get started <span>↗</span>';
    }
  }
  function skillTags(skills, matching = []) {
    if (!skills.length) return '<span class="skill-tag">Not listed yet</span>';
    return skills.map(skill => '<span class="skill-tag ' + (matching.some(s => s.toLocaleLowerCase() === skill.toLocaleLowerCase()) ? "match" : "") + '">' + escapeHTML(skill) + '</span>').join("");
  }
  function personCard(person, index) {
    const matching = person.matching_skills || [];
    return '<article class="person-card"><div class="person-top"><span class="avatar">' + escapeHTML(initials(person.name)) + '</span><div><h3 class="person-name">' + escapeHTML(person.name) + '</h3><div class="person-meta">COMMUNITY MEMBER</div></div><span class="person-index">NO. ' + String(index + 1).padStart(2, "0") + '</span></div><p class="person-bio">' + escapeHTML(person.name) + ' can help you get started with ' + escapeHTML(matching.join(", ")) + '.</p><div class="skill-pair"><div class="skill-column"><div class="skill-label"><span class="tiny-arrow">↗</span> CAN SHARE</div><div class="skill-tags">' + skillTags(person.teach || [], matching) + '</div></div><div class="skill-column"><div class="skill-label"><span class="tiny-arrow">↘</span> CURIOUS ABOUT</div><div class="skill-tags">' + skillTags(person.learn || []) + '</div></div></div><div class="person-bottom"><span class="match-note">MATCHES: ' + matching.length + '</span><button class="request-button" data-request="' + escapeHTML(person.id) + '">Ask to learn <span>↗</span></button></div></article>';
  }
  function renderFilters() {
    $("#skill-filters").innerHTML = state.learn.map(skill => '<button class="filter-pill ' + (state.selectedSkill.toLocaleLowerCase() === skill.toLocaleLowerCase() ? "active" : "") + '" data-skill-filter="' + escapeHTML(skill) + '">' + escapeHTML(skill) + '</button>').join("");
  }
  async function loadMatches() {
    if (!state.name) {
      $("#matches").innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><h3>First, put your name on the list.</h3><p>Set up a name and a few skills you want to learn. We’ll do the introductions from there.</p><button class="button button-dark" data-view="profile">Set up your skills <span>↗</span></button></div>';
      $("#match-count").textContent = "Your profile comes first"; renderFilters(); return;
    }
    try { state.matches = await api("/api/users/" + encodeURIComponent(state.id) + "/matches"); renderFilters(); renderMatches(); }
    catch (error) { notify(error.message, true); }
  }
  function renderMatches() {
    const term = state.filter.trim().toLocaleLowerCase(); const chosen = state.selectedSkill.toLocaleLowerCase();
    const filtered = state.matches.filter(person => {
      const matching = person.matching_skills || [];
      const skillOK = !chosen || matching.some(skill => skill.toLocaleLowerCase() === chosen);
      const text = [person.name, ...(person.teach || []), ...(person.learn || [])].join(" ").toLocaleLowerCase();
      return skillOK && (!term || text.includes(term));
    });
    $("#match-count").textContent = filtered.length + (filtered.length === 1 ? " person in your orbit" : " people in your orbit");
    if (!state.learn.length) $("#matches").innerHTML = '<div class="empty-state"><span class="empty-symbol">↗</span><h3>Start with your curiosity.</h3><p>Add a few skills you want to learn in Your skills, then we’ll find people who can teach them.</p><button class="button button-dark" data-view="profile">Set up your skills <span>↗</span></button></div>';
    else if (!filtered.length) $("#matches").innerHTML = '<div class="empty-state"><span class="empty-symbol">⌕</span><h3>No match on this page. Yet.</h3><p>Try another search, or come back as more people add what they know.</p><button class="button button-dark" data-view="profile">Edit your skills <span>↗</span></button></div>';
    else $("#matches").innerHTML = filtered.map(personCard).join("");
  }
  async function loadSwaps() {
    if (!state.name) { renderSwaps(); return; }
    try { state.swaps = await api("/api/users/" + encodeURIComponent(state.id) + "/swaps"); renderSwaps(); updateRequestCount(); }
    catch (error) { notify(error.message, true); }
  }
  function updateRequestCount() {
    const count = state.swaps.filter(s => s.recipient_id === state.id && s.status === "pending").length;
    $("#request-count").textContent = count; $("#request-count").classList.toggle("hidden", count === 0);
  }
  function otherName(swap) { return swap.requester_id === state.id ? swap.recipient_name : swap.requester_name; }
  function renderSwaps() {
    const requests = $("#requests-list"); const conversations = $("#conversations-list");
    if (!state.name) {
      const html = '<div class="empty-state"><span class="empty-symbol">↗</span><h3>Make yourself at home first.</h3><p>Save your name to start making connections.</p><button class="button button-dark" data-view="profile">Set up your skills <span>↗</span></button></div>';
      requests.innerHTML = html; conversations.innerHTML = html; return;
    }
    const relevant = state.swaps.filter(s => s.requester_id === state.id || s.recipient_id === state.id);
    const visibleRequests = relevant.slice().sort((a, b) => Number(b.id) - Number(a.id));
    requests.innerHTML = visibleRequests.length ? visibleRequests.map(s => {
      const incoming = s.recipient_id === state.id;
      const pending = s.status === "pending";
      const person = incoming ? s.requester_name : s.recipient_name;
      const heading = incoming ? (pending ? person + " wants to learn" : person + " sent a request") : (pending ? "You asked " + person : "You requested " + person);
      const status = s.status === "accepted" ? "Accepted" : s.status === "declined" ? "Declined" : (incoming ? "Awaiting your reply" : "Awaiting reply");
      const actions = incoming && pending
        ? '<button class="mini-button accept" data-respond="' + s.id + '" data-response="accepted">Accept ↗</button><button class="mini-button" data-respond="' + s.id + '" data-response="declined">Decline</button>'
        : '<span class="status-label ' + (s.status === "declined" ? "declined" : (pending ? "pending" : "")) + '">' + status + '</span>';
      const chatAction = s.status === "accepted" ? '<button class="mini-button" data-open-chat="' + s.id + '">Open chat ↗</button>' : '';
      return '<article class="request-item"><div class="request-person"><span class="avatar">' + escapeHTML(initials(person)) + '</span><div><h3>' + escapeHTML(heading) + '</h3><p><span class="request-skill">' + escapeHTML(s.skill) + '</span> · ' + (incoming ? 'INCOMING' : 'SENT BY YOU') + ' · ' + escapeHTML(new Date(s.created_at).toLocaleDateString()) + '</p></div></div><div class="request-actions">' + actions + chatAction + '</div></article>';
    }).join("") : '<div class="empty-state"><span class="empty-symbol">⇄</span><h3>Nothing on the table yet.</h3><p>Your incoming and sent requests will show up here.</p><button class="button button-dark" data-view="discover">Find your people <span>↗</span></button></div>';
    const accepted = relevant.filter(s => s.status === "accepted");
    conversations.innerHTML = accepted.length ? accepted.map(s => '<button class="conversation-item" data-open-chat="' + s.id + '"><span class="avatar">' + escapeHTML(initials(otherName(s))) + '</span><span class="conversation-copy"><h3>' + escapeHTML(otherName(s)) + '</h3><p>Swap accepted · ' + escapeHTML(s.skill) + '</p></span><span class="conversation-skill">OPEN CHAT ↗</span></button>').join("") : '<div class="empty-state"><span class="empty-symbol">↗</span><h3>Your next conversation starts with a swap.</h3><p>Once a request is accepted, you’ll have a place to talk, share resources, and learn together.</p><button class="button button-dark" data-view="discover">Find your people <span>↗</span></button></div>';
  }
  function openRequest(recipientId) {
    const person = state.matches.find(p => p.id === recipientId);
    if (!person) return;
    if (!state.name) { notify("Save your name before sending a request."); showView("profile"); return; }
    if (!state.learn.length) { notify("Add a skill you want to learn first."); showView("profile"); return; }
    state.activeRecipient = person;
    const skills = (person.matching_skills || []).filter(s => state.learn.some(w => w.toLocaleLowerCase() === s.toLocaleLowerCase()));
    $("#request-copy").textContent = "Ask " + person.name + " to help you get started. Keep it simple; the conversation comes after they accept.";
    $("#request-skill").innerHTML = skills.map(s => '<option value="' + escapeHTML(s) + '">' + escapeHTML(s) + '</option>').join("");
    $("#request-dialog").showModal();
  }
  async function sendRequest() {
    if (!state.activeRecipient) return;
    try {
      await api("/api/swaps", { method:"POST", body:JSON.stringify({ requester_id:state.id, recipient_id:state.activeRecipient.id, skill:$("#request-skill").value }) });
      $("#request-dialog").close(); notify("Request sent. Now we give them a chance to reply."); await loadSwaps();
    } catch (error) { notify(error.message, true); }
  }
  async function respondToSwap(id, response) {
    try {
      await api("/api/swaps/" + id + "/respond", { method:"POST", body:JSON.stringify({ user_id:state.id, response }) });
      notify(response === "accepted" ? "Swap accepted. Your chat is open." : "Request declined."); await loadSwaps();
      if (response === "accepted") openChat(id);
    } catch (error) { notify(error.message, true); }
  }
  async function openChat(id) {
    const swap = state.swaps.find(s => Number(s.id) === Number(id));
    if (!swap || swap.status !== "accepted") { notify("This chat opens once the swap is accepted.", true); return; }
    state.activeSwap = swap; const name = otherName(swap);
    $("#chat-title").textContent = name; $("#chat-avatar").textContent = initials(name);
    $("#chat-subtitle").textContent = swap.requester_id === state.id ? "You asked to learn from them" : "They're learning from you";
    $("#chat-skill").textContent = swap.skill; showView("chat"); await loadMessages();
    clearInterval(pollTimer); pollTimer = setInterval(() => { if (state.activeSwap && $("#view-chat").classList.contains("active")) loadMessages(true); }, 2500);
  }
  async function loadMessages(quiet = false) {
    if (!state.activeSwap) return;
    try {
      const messages = await api("/api/swaps/" + state.activeSwap.id + "/messages?user_id=" + encodeURIComponent(state.id));
      const wrap = $("#chat-messages"); const nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 70;
      const signature = messages.map(m => m.id).join(",");
      if (wrap.dataset.signature === signature) return;
      wrap.dataset.signature = signature;
      wrap.innerHTML = messages.length ? messages.map(m => {
        const mine = m.sender_id === state.id; const time = new Date(m.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
        return '<div class="message ' + (mine ? "mine" : "") + '"><div class="message-meta"><span>' + (mine ? "YOU" : escapeHTML(m.sender_name).toUpperCase()) + '</span><span>' + escapeHTML(time) + '</span></div><div class="message-bubble">' + escapeHTML(m.body) + '</div></div>';
      }).join("") : '<div class="chat-start-note">A new exchange. Say hello.</div>';
      if (nearBottom || !quiet) wrap.scrollTop = wrap.scrollHeight;
    } catch (error) { if (!quiet) notify(error.message, true); }
  }
  async function sendMessage(event) {
    event.preventDefault(); const input = $("#message-input"); const body = input.value.trim();
    if (!body || !state.activeSwap) return;
    input.disabled = true;
    try {
      await api("/api/swaps/" + state.activeSwap.id + "/messages", { method:"POST", body:JSON.stringify({ user_id:state.id, body }) });
      input.value = ""; input.style.height = "auto"; await loadMessages();
    } catch (error) { notify(error.message, true); }
    finally { input.disabled = false; input.focus(); }
  }
  async function saveProfile(event) {
    event.preventDefault(); const name = $("#display-name").value.trim();
    if (!name) { notify("Add a name so people know who they're talking to.", true); return; }
    const teach = listSkills($("#teach-skills").value); const learn = listSkills($("#learn-skills").value);
    try {
      await api("/api/users", { method:"POST", body:JSON.stringify({ id:state.id, name }) });
      const profile = await api("/api/users/" + encodeURIComponent(state.id) + "/skills", { method:"PUT", body:JSON.stringify({ teach, learn }) });
      state.name = profile.name; state.teach = profile.teach; state.learn = profile.learn;
      storage.setItem("skillswap_name", state.name); updateIdentity(); $("#profile-status").textContent = "Saved just now.";
      notify("Your corner is saved. Let’s find your people."); await loadMatches(); await loadSwaps(); showView("discover");
    } catch (error) { notify(error.message, true); }
  }
  async function boot() {
    updateIdentity();
    if (state.name) {
      try { const profile = await api("/api/users/" + encodeURIComponent(state.id)); state.name = profile.name; state.teach = profile.teach; state.learn = profile.learn; storage.setItem("skillswap_name", state.name); updateIdentity(); }
      catch { state.name = ""; storage.removeItem("skillswap_name"); }
    }
    fillProfile(); await loadMatches(); await loadSwaps();
  }
  document.addEventListener("click", async event => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { event.preventDefault(); showView(viewButton.dataset.view); return; }
    const requestButton = event.target.closest("[data-request]");
    if (requestButton) { openRequest(requestButton.dataset.request); return; }
    const filterButton = event.target.closest("[data-skill-filter]");
    if (filterButton) { state.selectedSkill = state.selectedSkill.toLocaleLowerCase() === filterButton.dataset.skillFilter.toLocaleLowerCase() ? "" : filterButton.dataset.skillFilter; renderFilters(); renderMatches(); return; }
    const responseButton = event.target.closest("[data-respond]");
    if (responseButton) { await respondToSwap(Number(responseButton.dataset.respond), responseButton.dataset.response); return; }
    const chatButton = event.target.closest("[data-open-chat]");
    if (chatButton) { await openChat(Number(chatButton.dataset.openChat)); return; }
  });
  $$(".nav-link").forEach(link => link.addEventListener("click", () => showView(link.dataset.view)));
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#welcome-form").addEventListener("submit", saveWelcomeName);
  $("#message-form").addEventListener("submit", sendMessage);
  $("#search-input").addEventListener("input", event => { state.filter = event.target.value; renderMatches(); });
  $("#clear-search").addEventListener("click", () => { state.filter = ""; state.selectedSkill = ""; $("#search-input").value = ""; renderFilters(); renderMatches(); });
  $("#send-request").addEventListener("click", sendRequest);
  $("#cancel-request").addEventListener("click", () => $("#request-dialog").close());
  $("#back-to-messages").addEventListener("click", () => { clearInterval(pollTimer); state.activeSwap = null; showView("messages"); });
  $("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#profile-chip").addEventListener("click", () => showView("profile"));
  $("#message-input").addEventListener("input", event => { event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight, 130) + "px"; });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $("#search-input").focus(); }
    if (event.key === "Escape") $("#sidebar").classList.remove("open");
  });
  window.addEventListener("beforeunload", () => clearInterval(pollTimer));
  initSkillCube();
  boot();
})();