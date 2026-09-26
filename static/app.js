(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Constantes
  // -----------------------------------------------------------------------

  const ICONS = {
    target: "🎯", spider: "🕸️", unlock: "🔓", boom: "💥", ladder: "🪜",
    castle: "🏰", globe: "🌐", shield: "🛡️", dna: "🧬", spy: "🕵️",
    cloud: "☁️", satellite: "📡", flag: "🚩", wrench: "🔧",
    terminal: "💻", bug: "🐛", zap: "⚡", lock: "🔒", fire: "🔥", package: "📦",
  };
  const getIcon = (name) => ICONS[name] || ICONS.package;

  const PACK_COLORS = [
    "#ff7a45", "#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#f87171",
    "#818cf8", "#34d399", "#22d3ee", "#facc15", "#c084fc", "#2dd4bf",
    "#fb7185", "#f59e0b", "#94a3b8",
  ];

  const MASTER_TAGS = [
    "Pentest", "Red Team", "Blue Team", "OSINT", "Forensics", "Malware",
    "Cloud", "Network", "Windows/AD", "Wireless", "CTF", "SysAdmin", "Dev", "Crypto",
  ];

  const PACK_LABELS = {
    "ad-windows": "Active Directory & Windows",
    "blueteam-detection": "Blue Team Detection",
    "bruteforce-creds": "Password Auditing & Credentials",
    "cloud-containers": "Cloud & Containers",
    "ctf-stego": "CTF & Steganography",
    "exploitation-shells": "Exploitation & Shells",
    "malware-analysis": "Malware Analysis",
    "network-pivoting": "Network & Pivoting",
    osint: "OSINT",
    "post-exploit-privesc": "Post-Exploitation & Privilege Escalation",
    "recon-scan": "Network Recon & Scanning",
    "sysadmin-dev": "Sysadmin & Development",
    "web-enum": "Web Enumeration & Vulnerability Testing",
    wireless: "Wireless Security",
  };
  const displayPackName = (pack) => PACK_LABELS[pack.pack_id] || pack.pack_name;
  const displayTag = (tag) => tag === "Réseau" ? "Network" : tag;
  const displayToolName = (tool) => tool.startsWith("git+") ? tool.split("/").pop().replace(/\.git$/, "") : tool;

  const TUTORIAL_STEPS = [
    {
      icon: "🔥", title: "Welcome to MIDINS Forge",
      body: "Build a personal command workspace: organize scripts into packs, fill in generated fields, and run commands in a visible system terminal. This guide walks through the main workflow.",
    },
    {
      icon: "📦", title: "Find the right pack",
      body: "Packs group related scripts. Expand a pack in the sidebar to see its scripts and package list. Filter with tags, or press Ctrl+K to search titles, categories, descriptions, and tags.",
    },
    {
      icon: "📥", title: "Install only what you need",
      body: "Each pack has its own package list and Install tools button. For example, expand OSINT and install its tools without installing the CTF pack. New packs can define their own package names; installation uses apt, dnf, pacman, or zypper and may ask for your system password.",
    },
    {
      icon: "🧩", title: "Configure a command",
      body: "Select a script to reveal its inputs. A template such as nmap {{TARGET_IP}} creates a TARGET_IP field; {{PORTS:1-1000}} also provides a default. Reusable values are saved once and prefill fields with the same exact name.",
    },
    {
      icon: "▶", title: "Run and inspect",
      body: "Run in terminal opens a system terminal where one is available; on macOS, commands use the integrated output panel. Output and the exit code are shown here. Use STOP to interrupt a running command. Review the command and target before running it.",
    },
    {
      icon: "🛠️", title: "Create your own pack",
      body: "Choose + New pack, add a name and optional package list, then expand it and select + Add script. Use one package name per line or separate names with commas. You can edit packs and scripts later; everything is stored locally as JSON.",
    },
  ];

  const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)(?::([^}]*))?\s*\}\}/g;

  // -----------------------------------------------------------------------
  // État
  // -----------------------------------------------------------------------

  const state = {
    packs: [],
    globalVars: {},
    currentPack: null,
    currentScript: null,
    formValues: {},
    executionId: null,
    eventSource: null,
    activeTags: new Set(),
    editingPack: null,
    editingScript: null,
    scriptFormPack: null,
    packFormColor: PACK_COLORS[0],
    packFormIcon: "package",
    tutorialStep: 0,
    legalAccepted: false,
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function toast(msg, isError) {
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " toast-error" : "");
    el.textContent = msg;
    $("toast-container").appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  function closeModal(id) { $(id).classList.add("hidden"); }
  function openModalEl(id) { $(id).classList.remove("hidden"); }

  function openLegalNotice() {
    $("legal-ack-check").checked = state.legalAccepted;
    $("legal-acknowledge").disabled = !state.legalAccepted;
    openModalEl("legal-modal");
  }

  function requireLegalAcknowledgement() {
    if (state.legalAccepted) return true;
    openLegalNotice();
    return false;
  }

  $("open-legal").addEventListener("click", openLegalNotice);
  $("legal-ack-check").addEventListener("change", (event) => {
    $("legal-acknowledge").disabled = !event.target.checked;
  });
  $("legal-acknowledge").addEventListener("click", () => {
    if (!$("legal-ack-check").checked) return;
    state.legalAccepted = true;
    try { localStorage.setItem("midinsForgeLegalAccepted", "1"); } catch (e) { /* session-only acceptance */ }
    closeModal("legal-modal");
    toast("Acknowledgment saved for this browser");
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.classList.add("hidden"); });
  });

  // -----------------------------------------------------------------------
  // Chip / tag input réutilisable
  // -----------------------------------------------------------------------

  function createTagInput(boxId, inputId, initialTags) {
    const box = $(boxId);
    const input = $(inputId);
    let tags = (initialTags || []).slice();

    function render() {
      box.querySelectorAll(".chip").forEach((c) => c.remove());
      tags.forEach((t, i) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `${escapeHtml(t)} <button type="button" data-i="${i}">✕</button>`;
        box.insertBefore(chip, input);
      });
      box.querySelectorAll(".chip button").forEach((btn) => {
        btn.addEventListener("click", () => {
          tags.splice(Number(btn.dataset.i), 1);
          render();
        });
      });
    }

    function addTag(raw) {
      const t = (raw || "").trim();
      if (t && !tags.includes(t)) { tags.push(t); render(); }
      input.value = "";
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(input.value);
      } else if (e.key === "Backspace" && !input.value && tags.length) {
        tags.pop();
        render();
      }
    });

    render();
    return { getTags: () => tags.slice(), addTag, setTags: (t) => { tags = (t || []).slice(); render(); } };
  }

  let packTagInput = null;
  let scriptTagInput = null;

  // -----------------------------------------------------------------------
  // Chargement initial
  // -----------------------------------------------------------------------

  async function loadConfig() {
    const res = await fetch("/api/config");
    const data = await res.json();
    state.globalVars = data.global_variables || {};
    renderGlobalVars();
  }

  async function loadPacks() {
    const res = await fetch("/api/packs");
    const data = await res.json();
    state.packs = data.packs || [];
    renderTagFilters();
    renderSidebar();
  }

  // -----------------------------------------------------------------------
  // Filtres par tag de pack
  // -----------------------------------------------------------------------

  function computeMasterTagList() {
    const present = new Set();
    state.packs.forEach((p) => (p.pack_tags || []).forEach((t) => present.add(t)));
    const ordered = MASTER_TAGS.filter((t) => present.has(t));
    const extra = [...present].filter((t) => !MASTER_TAGS.includes(t)).sort();
    return [...ordered, ...extra];
  }

  function renderTagFilters() {
    const tags = computeMasterTagList();
    const row = $("tag-filter-row");
    if (!tags.length) { row.innerHTML = ""; return; }
    row.innerHTML = tags.map((t) => `
      <span class="tag-chip ${state.activeTags.has(t) ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(displayTag(t))}</span>
    `).join("");
    row.querySelectorAll(".tag-chip").forEach((el) => {
      el.addEventListener("click", () => {
        const t = el.dataset.tag;
        if (state.activeTags.has(t)) state.activeTags.delete(t); else state.activeTags.add(t);
        renderTagFilters();
        renderSidebar();
      });
    });
  }

  function visiblePacks() {
    if (!state.activeTags.size) return state.packs;
    return state.packs.filter((p) => (p.pack_tags || []).some((t) => state.activeTags.has(t)));
  }

  // -----------------------------------------------------------------------
  // Sidebar / Packs
  // -----------------------------------------------------------------------

  function renderSidebar() {
    const container = $("packs-list");
    const packs = visiblePacks();
    $("pack-count").textContent = state.packs.length;
    $("script-count").textContent = state.packs.reduce((count, pack) => count + (pack.scripts || []).length, 0);
    if (!packs.length) {
      container.innerHTML = state.packs.length
        ? '<div class="empty-hint">No packs match the selected tags.</div>'
        : '<div class="empty-hint">No packs loaded. Create one or drop a .json file below.</div>';
      return;
    }
    container.innerHTML = packs.map((pack) => `
      <div class="pack-card" style="border-left-color:${escapeHtml(pack.color || "#3B82F6")}" data-pack-id="${escapeHtml(pack.pack_id)}">
        <div class="pack-header" data-pack-id="${escapeHtml(pack.pack_id)}">
          <span class="pack-icon">${getIcon(pack.icon)}</span>
          <div class="pack-info">
            <div class="pack-name">${escapeHtml(displayPackName(pack))}</div>
            <div class="pack-meta">${(pack.scripts || []).length} scripts · ${(pack.dependencies || []).length + (pack.pipx_dependencies || []).length + (pack.go_dependencies || []).length} tools</div>
          </div>
          <div class="pack-actions">
            <button class="mini-btn" data-edit-pack="${escapeHtml(pack.pack_id)}" title="Edit pack">✏️</button>
            <button class="mini-btn danger" data-delete-pack="${escapeHtml(pack._file)}" title="Delete pack">🗑</button>
          </div>
        </div>
        <div class="pack-scripts">
          <div class="pack-tools">
            <div class="pack-dependency-list">${(pack.dependencies || []).length ? `System: ${escapeHtml(pack.dependencies.join(" · "))}` : "No system packages"}${(pack.pipx_dependencies || []).length ? `<br>Python tools: ${escapeHtml(pack.pipx_dependencies.map(displayToolName).join(" · "))}` : ""}${(pack.go_dependencies || []).length ? `<br>Go tools: ${escapeHtml(pack.go_dependencies.map((item) => item.split("/").pop().split("@")[0]).join(" · "))}` : ""}</div>
            <button class="btn btn-sm" data-export-pack="${escapeHtml(pack.pack_id)}" aria-label="Export ${escapeHtml(displayPackName(pack))} as JSON">↓ JSON</button>
            <button class="btn btn-sm btn-install" data-install-pack="${escapeHtml(pack.pack_id)}" ${(pack.dependencies || []).length ? "" : "disabled"}>↓ Install tools</button>
          </div>
          ${(pack.scripts || []).map((s) => `
            <div class="script-item" data-pack-id="${escapeHtml(pack.pack_id)}" data-script-id="${escapeHtml(s.id)}">
              <div class="script-item-main">
                <span class="script-title">${escapeHtml(s.title)}</span>
              </div>
              <span class="script-cat">${escapeHtml(s.category || "")}</span>
            </div>
          `).join("")}
          <div class="add-script-row" data-add-script="${escapeHtml(pack.pack_id)}">+ Add script</div>
        </div>
      </div>
    `).join("");

    container.querySelectorAll(".pack-header").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".pack-actions")) return;
        el.closest(".pack-card").classList.toggle("expanded");
      });
    });
    container.querySelectorAll(".script-item").forEach((el) => {
      el.addEventListener("click", () => {
        const pack = state.packs.find((p) => p.pack_id === el.dataset.packId);
        const script = pack.scripts.find((s) => s.id === el.dataset.scriptId);
        openScript(pack, script);
        container.querySelectorAll(".script-item").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
      });
    });
    container.querySelectorAll("[data-add-script]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const pack = state.packs.find((p) => p.pack_id === el.dataset.addScript);
        openScriptModal(pack, null);
      });
    });
    container.querySelectorAll("[data-edit-pack]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const pack = state.packs.find((p) => p.pack_id === el.dataset.editPack);
        openPackModal(pack);
      });
    });
    container.querySelectorAll("[data-install-pack]").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!requireLegalAcknowledgement()) return;
        const pack = state.packs.find((item) => item.pack_id === el.dataset.installPack);
        el.disabled = true;
        try {
          const response = await fetch(`/api/packs/${encodeURIComponent(pack.pack_id)}/install`, { method: "POST" });
          const result = await response.json();
          if (!response.ok) throw new Error(result.detail || "Could not prepare package installation");
          launchCommand(result.command, `Installing ${result.packages.length} packages for ${displayPackName(pack)} with ${result.package_manager}`);
        } catch (error) {
          toast(error.message, true);
        } finally {
          el.disabled = false;
        }
      });
    });
    container.querySelectorAll("[data-export-pack]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const pack = state.packs.find((item) => item.pack_id === el.dataset.exportPack);
        if (!pack) return;
        const exportablePack = { ...pack };
        delete exportablePack._file;
        const file = new Blob([JSON.stringify(exportablePack, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${pack.pack_id}.json`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast("Pack JSON exported");
      });
    });
    container.querySelectorAll("[data-delete-pack]").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this pack and all its scripts?")) return;
        await fetch("/api/packs/" + encodeURIComponent(el.dataset.deletePack), { method: "DELETE" });
        toast("Pack deleted");
        await loadPacks();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Playground / Formulaire dynamique
  // -----------------------------------------------------------------------

  function extractVariables(template) {
    const vars = [];
    const seen = new Set();
    let m;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(template)) !== null) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      vars.push({ name: m[1], default: m[2] !== undefined ? m[2] : "" });
    }
    return vars;
  }

  function normalizeDomain(value) {
    const input = String(value || "").trim();
    if (!input) return "";
    try {
      const parsed = new URL(input.includes("://") ? input : `http://${input}`);
      return parsed.hostname || input;
    } catch (error) {
      return input.split(/[/?#]/, 1)[0];
    }
  }

  function openScript(pack, script) {
    state.currentPack = pack;
    state.currentScript = script;
    $("playground-empty").classList.add("hidden");
    $("playground-content").classList.remove("hidden");
    $("script-title").textContent = script.title;
    $("script-category").textContent = script.category || "—";
    $("script-desc").textContent = script.description || "";
    $("script-tags").innerHTML = (script.tags || []).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("");
    buildForm(script.template);
    updateCommandPreview();
  }

  function buildForm(template) {
    const vars = extractVariables(template);
    const container = $("dynamic-form");
    state.formValues = {};
    if (!vars.length) {
      container.innerHTML = '<div class="no-vars">This script has no variables; its command is ready to run.</div>';
      return;
    }
    container.innerHTML = "";
    vars.forEach((v) => {
      const hasGlobal = Object.prototype.hasOwnProperty.call(state.globalVars, v.name) && state.globalVars[v.name] !== "";
      const value = hasGlobal ? state.globalVars[v.name] : v.default;
      state.formValues[v.name] = value;

      const wrapper = document.createElement("div");
      wrapper.className = "field";
      wrapper.innerHTML = `<label>${escapeHtml(v.name)}${hasGlobal ? '<span class="global-badge">saved</span>' : ""}</label>`;
      if (v.name === "DOMAIN") {
        const hint = document.createElement("span");
        hint.className = "field-hint";
        hint.textContent = "A domain or URL is accepted; URL scheme and path are removed automatically.";
        wrapper.appendChild(hint);
      }
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.spellcheck = false;
      input.addEventListener("input", (e) => {
        state.formValues[v.name] = e.target.value;
        updateCommandPreview();
      });
      if (v.name === "DOMAIN") {
        input.addEventListener("blur", (e) => {
          e.target.value = normalizeDomain(e.target.value);
          state.formValues[v.name] = e.target.value;
          updateCommandPreview();
        });
      }
      wrapper.appendChild(input);
      container.appendChild(wrapper);
    });
  }

  function updateCommandPreview() {
    if (!state.currentScript) return "";
    const cmd = state.currentScript.template.replace(VAR_RE, (match, name) => {
      const value = state.formValues[name] !== undefined ? state.formValues[name] : "";
      return name === "DOMAIN" ? normalizeDomain(value) : value;
    });
    $("command-preview").textContent = cmd;
    return cmd;
  }

  $("btn-edit-script").addEventListener("click", () => {
    if (!state.currentScript || !state.currentPack) return;
    openScriptModal(state.currentPack, state.currentScript);
  });

  $("btn-delete-script").addEventListener("click", async () => {
    if (!state.currentScript || !state.currentPack) return;
    if (!confirm("Delete this script?")) return;
    await fetch(`/api/packs/${encodeURIComponent(state.currentPack.pack_id)}/scripts/${encodeURIComponent(state.currentScript.id)}`, { method: "DELETE" });
    toast("Script deleted");
    state.currentScript = null;
    state.currentPack = null;
    $("playground-content").classList.add("hidden");
    $("playground-empty").classList.remove("hidden");
    await loadPacks();
  });

  // -----------------------------------------------------------------------
  // Actions rapides / conversion 1-click
  // -----------------------------------------------------------------------

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(
      () => toast("Copied to clipboard ✓"),
      () => toast("Could not copy to clipboard", true)
    );
  }

  $("btn-copy-raw").addEventListener("click", () => copyToClipboard(updateCommandPreview()));
  $("btn-copy-b64").addEventListener("click", () => {
    const cmd = updateCommandPreview();
    const b64 = btoa(unescape(encodeURIComponent(cmd)));
    copyToClipboard(`echo ${b64} | base64 -d | bash`);
  });
  $("btn-copy-url").addEventListener("click", () => copyToClipboard(encodeURIComponent(updateCommandPreview())));
  $("btn-copy-esc").addEventListener("click", () => {
    const cmd = updateCommandPreview();
    copyToClipboard(cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'"));
  });

  // -----------------------------------------------------------------------
  // Console — exécution dans un terminal externe
  // -----------------------------------------------------------------------

  function openConsole() { $("console-panel").classList.remove("collapsed"); }

  function appendConsoleLine(type, text) {
    const out = $("console-output");
    const line = document.createElement("div");
    line.className = "console-line console-" + type;
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function setStatus(status) {
    const badge = $("exec-status");
    badge.className = "exec-status exec-" + status;
    badge.textContent = { idle: "Idle", running: "Running…", success: "Success", error: "Error" }[status] || status;
  }

  $("console-toggle").addEventListener("click", () => $("console-panel").classList.toggle("collapsed"));
  $("btn-clear-console").addEventListener("click", () => { $("console-output").innerHTML = ""; });

  async function launchCommand(cmd, description) {
    if (!cmd || !cmd.trim()) return;
    openConsole();
    appendConsoleLine("system", "$ " + cmd);
    if (description) appendConsoleLine("system", description);
    appendConsoleLine("system", "Opening a system terminal…");
    setStatus("running");
    $("btn-stop").disabled = false;

    let data;
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not start command");
    } catch (e) {
      appendConsoleLine("stderr", "[MIDINS Forge] " + e.message);
      setStatus("error");
      $("btn-stop").disabled = true;
      return;
    }

    state.executionId = data.execution_id;
    if (state.eventSource) state.eventSource.close();
    const es = new EventSource("/api/execute/" + data.execution_id + "/stream");
    state.eventSource = es;

    es.onmessage = (event) => {
      const item = JSON.parse(event.data);
      if (item.type === "stdout") appendConsoleLine("stdout", item.data);
      else if (item.type === "stderr") appendConsoleLine("stderr", item.data);
      else if (item.type === "done") {
        if (item.exit_code === 127) {
          appendConsoleLine("system", "Command not found. Expand this pack and select Install tools, or add the missing package in Edit pack.");
        }
        appendConsoleLine("system", `[Finished] exit code: ${item.exit_code} — duration: ${item.duration}s`);
        setStatus(item.exit_code === 0 ? "success" : "error");
        $("btn-stop").disabled = true;
        es.close();
      }
    };
    es.onerror = () => {
      es.close();
      $("btn-stop").disabled = true;
    };
  }

  $("btn-run").addEventListener("click", () => {
    if (requireLegalAcknowledgement()) launchCommand(updateCommandPreview());
  });

  $("btn-stop").addEventListener("click", async () => {
    if (!state.executionId) return;
    await fetch("/api/execute/" + state.executionId + "/kill", { method: "POST" });
    appendConsoleLine("system", "[Stop requested — closing terminal window]");
    $("btn-stop").disabled = true;
  });

  // -----------------------------------------------------------------------
  // Variables globales
  // -----------------------------------------------------------------------

  function renderGlobalVars() {
    const container = $("global-vars-list");
    const entries = Object.entries(state.globalVars);
    container.innerHTML = entries.map(([k, v]) => `
      <div class="gvar-row">
        <input class="gvar-key" value="${escapeHtml(k)}" placeholder="NAME" />
        <input class="gvar-val" value="${escapeHtml(v)}" placeholder="value" />
        <button class="gvar-del" title="Delete variable">✕</button>
      </div>
    `).join("");
    container.querySelectorAll(".gvar-del").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        const key = entries[i][0];
        delete state.globalVars[key];
        renderGlobalVars();
      });
    });
  }

  $("add-global").addEventListener("click", () => {
    let key = "NEW_VAR", n = 1;
    while (Object.prototype.hasOwnProperty.call(state.globalVars, key)) key = "NEW_VAR_" + (++n);
    state.globalVars[key] = "";
    renderGlobalVars();
  });

  $("save-globals").addEventListener("click", async () => {
    const vars = {};
    $("global-vars-list").querySelectorAll(".gvar-row").forEach((row) => {
      const k = row.querySelector(".gvar-key").value.trim();
      const v = row.querySelector(".gvar-val").value;
      if (k) vars[k] = v;
    });
    state.globalVars = vars;
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ global_variables: vars }),
    });
    toast("Reusable values saved ✓");
    renderGlobalVars();
    if (state.currentScript) { buildForm(state.currentScript.template); updateCommandPreview(); }
  });

  // -----------------------------------------------------------------------
  // Création / édition de pack
  // -----------------------------------------------------------------------

  function renderColorSwatches(selected) {
    const row = $("pack-form-colors");
    row.innerHTML = PACK_COLORS.map((c) => `
      <span class="swatch ${c === selected ? "selected" : ""}" data-color="${c}" style="background:${c}; color:${c}"></span>
    `).join("");
    row.querySelectorAll(".swatch").forEach((el) => {
      el.addEventListener("click", () => {
        row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
        el.classList.add("selected");
        state.packFormColor = el.dataset.color;
      });
    });
  }

  function renderIconOptions(selected) {
    const grid = $("pack-form-icons");
    grid.innerHTML = Object.entries(ICONS).map(([key, emoji]) => `
      <span class="emoji-opt ${key === selected ? "selected" : ""}" data-icon="${key}">${emoji}</span>
    `).join("");
    grid.querySelectorAll(".emoji-opt").forEach((el) => {
      el.addEventListener("click", () => {
        grid.querySelectorAll(".emoji-opt").forEach((s) => s.classList.remove("selected"));
        el.classList.add("selected");
        state.packFormIcon = el.dataset.icon;
      });
    });
  }

  function openPackModal(editing) {
    state.editingPack = editing || null;
    $("pack-modal-title").textContent = editing ? "Edit pack" : "New pack";
    $("pack-form-submit").textContent = editing ? "Save changes" : "Create pack";
    $("pack-form-name").value = editing ? displayPackName(editing) : "";
    $("pack-form-desc").value = editing ? (editing.description || "") : "";
    $("pack-form-dependencies").value = editing ? (editing.dependencies || []).join(", ") : "";
    state.packFormColor = editing ? (editing.color || PACK_COLORS[0]) : PACK_COLORS[Math.floor(Math.random() * PACK_COLORS.length)];
    state.packFormIcon = editing ? (editing.icon || "package") : "package";
    renderColorSwatches(state.packFormColor);
    renderIconOptions(state.packFormIcon);
    packTagInput = createTagInput("pack-form-tags-box", "pack-form-tags-input", editing ? (editing.pack_tags || []) : []);
    $("pack-form-tags-suggestions").innerHTML = MASTER_TAGS.map((t) => `<span class="suggested-tag" data-tag="${escapeHtml(t)}">+ ${escapeHtml(t)}</span>`).join("");
    $("pack-form-tags-suggestions").querySelectorAll(".suggested-tag").forEach((el) => {
      el.addEventListener("click", () => packTagInput.addTag(el.dataset.tag));
    });
    openModalEl("pack-modal");
    $("pack-form-name").focus();
  }

  $("open-new-pack").addEventListener("click", () => openPackModal(null));
  $("empty-new-pack").addEventListener("click", () => openPackModal(null));

  $("pack-form-submit").addEventListener("click", async () => {
    const name = $("pack-form-name").value.trim();
    if (!name) { toast("Pack name is required", true); return; }
    const body = {
      pack_name: name,
      description: $("pack-form-desc").value.trim(),
      color: state.packFormColor,
      icon: state.packFormIcon,
      pack_tags: packTagInput ? packTagInput.getTags() : [],
      dependencies: $("pack-form-dependencies").value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
    };
    try {
      let res;
      if (state.editingPack) {
        res = await fetch("/api/packs/" + encodeURIComponent(state.editingPack.pack_id), {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/packs", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      closeModal("pack-modal");
      toast(state.editingPack ? "Pack updated ✓" : "Pack created ✓");
      await loadPacks();
    } catch (e) {
      toast("Error: " + e.message, true);
    }
  });

  // -----------------------------------------------------------------------
  // Création / édition de script
  // -----------------------------------------------------------------------

  function updateVarHint() {
    const tpl = $("script-form-template").value;
    const vars = extractVariables(tpl);
    const hint = $("script-form-var-hint");
    hint.innerHTML = vars.length
      ? "Detected variables: " + vars.map((v) => `<b>${escapeHtml(v.name)}</b>`).join(", ")
      : "";
  }
  $("script-form-template").addEventListener("input", updateVarHint);

  function openScriptModal(pack, editing) {
    state.scriptFormPack = pack;
    state.editingScript = editing || null;
    $("script-modal-title").textContent = editing ? "Edit script" : `New script — ${displayPackName(pack)}`;
    $("script-form-submit").textContent = editing ? "Save changes" : "Add script";
    $("script-form-title").value = editing ? editing.title : "";
    $("script-form-category").value = editing ? (editing.category || "") : "";
    $("script-form-desc").value = editing ? (editing.description || "") : "";
    $("script-form-template").value = editing ? editing.template : "";
    scriptTagInput = createTagInput("script-form-tags-box", "script-form-tags-input", editing ? (editing.tags || []) : []);
    updateVarHint();
    openModalEl("script-modal");
    $("script-form-title").focus();
  }

  $("script-form-submit").addEventListener("click", async () => {
    const title = $("script-form-title").value.trim();
    const template = $("script-form-template").value.trim();
    if (!title || !template) { toast("Title and command are required", true); return; }
    const body = {
      title,
      category: $("script-form-category").value.trim(),
      description: $("script-form-desc").value.trim(),
      template,
      tags: scriptTagInput ? scriptTagInput.getTags() : [],
    };
    const pack = state.scriptFormPack;
    try {
      let res;
      if (state.editingScript) {
        res = await fetch(`/api/packs/${encodeURIComponent(pack.pack_id)}/scripts/${encodeURIComponent(state.editingScript.id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/packs/${encodeURIComponent(pack.pack_id)}/scripts`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.detail && data.detail.errors) ? data.detail.errors.join(" · ") : (data.detail || "Request failed");
        throw new Error(msg);
      }
      closeModal("script-modal");
      toast(state.editingScript ? "Script updated ✓" : "Script added ✓");
      await loadPacks();
      const freshPack = state.packs.find((p) => p.pack_id === pack.pack_id);
      const targetId = data.script ? data.script.id : (state.editingScript ? state.editingScript.id : null);
      if (freshPack && targetId) {
        const freshScript = freshPack.scripts.find((s) => s.id === targetId);
        if (freshScript) openScript(freshPack, freshScript);
      }
    } catch (e) {
      toast("Error: " + e.message, true);
    }
  });

  // -----------------------------------------------------------------------
  // Import par glisser-déposer
  // -----------------------------------------------------------------------

  const dropZone = $("drop-zone");
  ["dragover", "dragenter"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); })
  );
  ["dragleave", "dragend"].forEach((evt) =>
    dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-over"))
  );
  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      toast("Only .json files are supported", true);
      return;
    }
    const text = await file.text();
    try {
      const res = await fetch("/api/packs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = (data.detail && data.detail.errors) ? data.detail.errors.join(" · ") : (data.detail || "Unknown error");
        toast("Import rejected: " + msg, true);
        return;
      }
      toast(`Pack "${data.pack_id}" imported ✓`);
      await loadPacks();
    } catch (err) {
      toast("Invalid or unreadable JSON file", true);
    }
  });

  // -----------------------------------------------------------------------
  // Recherche globale (Ctrl+K)
  // -----------------------------------------------------------------------

  function openSearch() {
    openModalEl("search-modal");
    $("search-input").value = "";
    renderSearchResults("");
    $("search-input").focus();
  }
  function closeSearch() { closeModal("search-modal"); }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    const results = [];
    state.packs.forEach((pack) => {
      (pack.scripts || []).forEach((script) => {
        const hay = [script.title, script.category, script.description, ...(script.tags || []), pack.pack_name, displayPackName(pack), ...(pack.pack_tags || [])].join(" ").toLowerCase();
        if (!q || hay.includes(q)) results.push({ pack, script });
      });
    });
    const list = $("search-results");
    if (!results.length) {
      list.innerHTML = '<div class="sr-empty">No results</div>';
      return;
    }
    list.innerHTML = results.slice(0, 40).map((r) => `
      <div class="search-result" data-pack-id="${escapeHtml(r.pack.pack_id)}" data-script-id="${escapeHtml(r.script.id)}">
        <span class="dot" style="background:${escapeHtml(r.pack.color || "#3B82F6")}"></span>
        <div>
          <div class="sr-title">${escapeHtml(r.script.title)}</div>
          <div class="sr-sub">${escapeHtml(displayPackName(r.pack))} · ${escapeHtml(r.script.category || "")}</div>
        </div>
      </div>
    `).join("");
    list.querySelectorAll(".search-result").forEach((el) => {
      el.addEventListener("click", () => {
        const pack = state.packs.find((p) => p.pack_id === el.dataset.packId);
        const script = pack.scripts.find((s) => s.id === el.dataset.scriptId);
        openScript(pack, script);
        closeSearch();
      });
    });
  }

  $("open-search").addEventListener("click", openSearch);
  $("search-input").addEventListener("input", (e) => renderSearchResults(e.target.value));
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "Escape") {
      closeSearch();
    }
  });

  function updateAIPrompt() {
    const name = $("prompt-pack-name").value.trim() || "[Pack name]";
    const topic = $("prompt-topic").value.trim() || "[Pack theme and goals]";
    const useCase = $("prompt-use").value;
    const platform = $("prompt-platform").value.trim() || "[Operating system]";
    const packages = $("prompt-packages").value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
    const scriptCount = Math.max(1, Math.min(20, Number($("prompt-script-count").value) || 5));
    $("prompt-output").value = `Create one MIDINS Forge pack as valid JSON for ${useCase}.

Pack name: ${name}
Theme and goals: ${topic}
Target platform: ${platform}
Requested scripts: ${scriptCount}
Preferred system packages: ${packages.length ? packages.join(", ") : "suggest only necessary packages"}

Use this schema and output exactly one JSON object, with no Markdown fences or extra commentary:
{
  "pack_id": "lowercase-kebab-case-id",
  "pack_name": "${name}",
  "description": "Short purpose",
  "pack_tags": [],
  "dependencies": ${JSON.stringify(packages)},
  "scripts": [
    {
      "id": "unique-kebab-case-id",
      "title": "Script title",
      "category": "Category",
      "description": "What it does and important limitations",
      "template": "tool {{TARGET}}",
      "tags": []
    }
  ]
}

Create exactly ${scriptCount} useful scripts for the stated platform. Use explicit placeholders such as {{TARGET_HOST}} instead of real targets, credentials, or secrets. Keep commands non-destructive and limited to systems the user owns or is explicitly authorized to assess. Use verified command syntax and package names; note required API keys or permissions in descriptions. Do not invent flags. Make every script id unique and ensure all JSON is valid.`;
  }

  const promptFields = ["prompt-pack-name", "prompt-topic", "prompt-use", "prompt-platform", "prompt-packages", "prompt-script-count"];
  promptFields.forEach((id) => {
    $(id).addEventListener("input", updateAIPrompt);
    $(id).addEventListener("change", updateAIPrompt);
  });
  $("open-ai-prompt").addEventListener("click", () => {
    updateAIPrompt();
    openModalEl("prompt-modal");
  });
  $("copy-ai-prompt").addEventListener("click", () => copyToClipboard($("prompt-output").value));

  // -----------------------------------------------------------------------
  // Tutoriel
  // -----------------------------------------------------------------------

  function renderTutorialStep(i) {
    const step = TUTORIAL_STEPS[i];
    $("tutorial-content").innerHTML = `
      <div class="tutorial-illustration">${step.icon}</div>
      <div class="tutorial-step-label">Step ${i + 1} of ${TUTORIAL_STEPS.length}</div>
      <h3>${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.body)}</p>
    `;
    $("tutorial-dots").innerHTML = `<div class="tutorial-progress"><span style="width:${((i + 1) / TUTORIAL_STEPS.length) * 100}%"></span></div>`;
    $("tutorial-next").textContent = i === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next";
  }

  function openTutorial() {
    state.tutorialStep = 0;
    renderTutorialStep(0);
    openModalEl("tutorial-modal");
  }

  function markTutorialSeen() {
    try { localStorage.setItem("midinsForgeTutorialSeen", "1"); } catch (e) { /* stockage indisponible, tant pis */ }
  }

  $("tutorial-next").addEventListener("click", () => {
    if (state.tutorialStep < TUTORIAL_STEPS.length - 1) {
      state.tutorialStep++;
      renderTutorialStep(state.tutorialStep);
    } else {
      closeModal("tutorial-modal");
      markTutorialSeen();
    }
  });
  $("tutorial-skip").addEventListener("click", () => {
    closeModal("tutorial-modal");
    markTutorialSeen();
  });
  $("open-tutorial").addEventListener("click", openTutorial);
  $("empty-open-tutorial").addEventListener("click", openTutorial);

  // -----------------------------------------------------------------------
  // Démarrage
  // -----------------------------------------------------------------------

  (async function init() {
    try { state.legalAccepted = localStorage.getItem("midinsForgeLegalAccepted") === "1"; } catch (e) { state.legalAccepted = false; }
    await loadConfig();
    await loadPacks();
    let seen = false;
    try { seen = !!localStorage.getItem("midinsForgeTutorialSeen"); } catch (e) { seen = true; }
    if (!seen) setTimeout(openTutorial, 500);
  })();
})();
