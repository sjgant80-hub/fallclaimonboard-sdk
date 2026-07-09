// fallclaimonboard SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallclaimonboard/index.html · 94949 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallclaimonboard" }); }
    else go();
  })();
'use strict';
// ═══ CONSTANTS ═══
const TOOLNAME='fallclaimonboard';
const VERSION='1.0.0';
const PRIME=821;
const SCHEMA_V=1;
const STORE='fallclaimonboard.v1';
const AUDIT_CAP=50000;
const COOLING_OFF_DAYS=14;
const TABS=[
  {id:'clients',label:'Clients'},
  {id:'dashboard',label:'Dashboard'},
  {id:'cooling',label:'Cooling-off'},
  {id:'complaints',label:'Complaints'},
  {id:'conflict',label:'Conflict'},
  {id:'firm',label:'Firm'},
  {id:'advisers',label:'Caseworkers'},
  {id:'qa',label:'CMR Help'},
];
const REVIEW_CADENCE={low:365,medium:180,high:90};
const DOC_EXPIRY={'passport':365*10,'driving-licence':365*10,'utility-bill':90,'bank-statement':90,'photo-evidence':null,'medical-record':null,'police-report':null,'incident-report':null,'litigation-friend-cert':null,'capacity-assessment':null,'other':null};
const DOC_TYPES=[
  {v:'passport',l:'Passport'},
  {v:'driving-licence',l:'Driving licence'},
  {v:'utility-bill',l:'Utility bill (last 3 months)'},
  {v:'bank-statement',l:'Bank statement (last 3 months)'},
  {v:'photo-evidence',l:'Photo evidence (incident / injury)'},
  {v:'medical-record',l:'Medical record'},
  {v:'police-report',l:'Police / incident report'},
  {v:'incident-report',l:'Employer / 3rd party incident report'},
  {v:'litigation-friend-cert',l:'Litigation friend certificate (CPR 21)'},
  {v:'capacity-assessment',l:'Mental capacity assessment'},
  {v:'other',l:'Other (specify)'}
];
const HIGH_RISK_JURIS=['AF','BY','MM','KP','SY','IR','CU','VE','RU','HT','YE','SS','LY'];
const CLAIM_TYPES=[
  {v:'rta',l:'RTA · Road Traffic Accident'},
  {v:'el',l:'EL · Employer Liability'},
  {v:'pl',l:'PL · Public Liability'},
  {v:'clinical-neg',l:'Clinical Negligence'},
  {v:'housing-disrepair',l:'Housing Disrepair'},
  {v:'financial-misselling',l:'Financial Mis-selling'},
  {v:'data-breach',l:'Data Breach'},
  {v:'trip',l:'Trip & Slip'},
  {v:'other',l:'Other'}
];
const CMR_ROLES=[
  {v:'caseworker',l:'Caseworker'},
  {v:'paralegal',l:'Paralegal'},
  {v:'solicitor',l:'Solicitor (SRA-regulated)'},
  {v:'partner',l:'Partner'},
  {v:'COLP-equiv',l:'COLP / CMR principal'}
];
const FEE_BASES=[
  {v:'cfa',l:'CFA · Conditional Fee Agreement (no win, no fee)'},
  {v:'dba',l:'DBA · Damages-Based Agreement (% of damages)'},
  {v:'hourly',l:'Hourly rate'},
  {v:'fixed',l:'Fixed fee'},
  {v:'legal-aid',l:'Legal aid'}
];
const REFERRAL_SOURCES=[
  {v:'direct',l:'Direct enquiry'},
  {v:'lead-generator',l:'Lead generator'},
  {v:'solicitor-referral',l:'Solicitor referral'},
  {v:'introducer',l:'Introducer (regulated)'},
  {v:'advertising',l:'Advertising response'},
  {v:'recommendation',l:'Personal recommendation'},
  {v:'other',l:'Other'}
];
const CLIENT_TYPES=[
  {v:'individual',l:'Individual (adult, capacity)'},
  {v:'minor',l:'Minor — via litigation friend (CPR 21.2)'},
  {v:'protected',l:'Protected party — lacks capacity (MCA 2005)'},
  {v:'deceased',l:'Deceased — via personal representative'}
];
// ═══ STATE ═══
let state={
  schemaVersion:SCHEMA_V,
  active:'clients',
  firm:null,
  advisers:[],
  clients:[],
  coolingOffRegister:[],
  complaintsRegister:[],
  conflictRegister:[],
  audit:[],
  chat:[],
  settings:{
    engineName:'FallClaimOnboard',
    anthropicKey:'',openaiKey:'',geminiKey:'',openrouterKey:'',
    auditChain:true,
    isDemoSeeded:false,
    setupDismissed:false,
  },
  ui:{
    filter:{kyc:'',risk:'',adviser:'',cooling:'',due:false},
    wizard:null,
    activeClient:null,
  }
};
// ═══ UTIL ═══
const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>Array.from(p.querySelectorAll(s));
const uid=(p='id')=>p+'_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,16):Math.random().toString(36).slice(2,18));
const now=()=>Date.now();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=t=>{if(!t)return'—';const d=new Date(t);return isNaN(d)?'—':d.toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'2-digit'})};
const fmtDateTime=t=>{if(!t)return'—';const d=new Date(t);return isNaN(d)?'—':d.toLocaleString('en-GB',{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
const fmtDateISO=t=>{if(!t)return'';const d=new Date(t);return d.toISOString().slice(0,10)};
const ageYears=dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))a--;return a};
const addDays=(t,d)=>t+d*86400000;
const daysBetween=(a,b)=>Math.round((b-a)/86400000);
const gbp=n=>'£'+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:2});
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),2200)}
async function sha256(s){const buf=s instanceof ArrayBuffer?s:new TextEncoder().encode(typeof s==='string'?s:JSON.stringify(s));const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function sha256Blob(blob){const buf=await blob.arrayBuffer();return sha256(buf)}
function bytes(n){if(n<1024)return n+'B';if(n<1024*1024)return(n/1024).toFixed(1)+'KB';return(n/1048576).toFixed(2)+'MB'}
// ═══ INDEXEDDB ═══
let db;
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(STORE,1);
    r.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('state'))d.createObjectStore('state');
      if(!d.objectStoreNames.contains('audit'))d.createObjectStore('audit',{keyPath:'i'});
      if(!d.objectStoreNames.contains('documents'))d.createObjectStore('documents',{keyPath:'id'});
      if(!d.objectStoreNames.contains('coolingOff'))d.createObjectStore('coolingOff',{keyPath:'id'});
      if(!d.objectStoreNames.contains('complaints'))d.createObjectStore('complaints',{keyPath:'id'});
      if(!d.objectStoreNames.contains('conflicts'))d.createObjectStore('conflicts',{keyPath:'id'});
      if(!d.objectStoreNames.contains('signingKeys'))d.createObjectStore('signingKeys');
    };
    r.onsuccess=e=>{db=e.target.result;res(db)};
    r.onerror=e=>rej(e);
  });
}
function idbPut(store,val,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const r=key?tx.objectStore(store).put(val,key):tx.objectStore(store).put(val);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbGet(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbDel(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const r=tx.objectStore(store).delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbAll(store){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function idbClear(store){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');const r=tx.objectStore(store).clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function persistState(){
  if(!db)await openDB();
  const snap={
    schemaVersion:state.schemaVersion,active:state.active,
    firm:state.firm,advisers:state.advisers,clients:state.clients,
    chat:state.chat,settings:state.settings,
  };
  try{localStorage.setItem(STORE+'.state',JSON.stringify(snap))}catch(e){}
  return idbPut('state',snap,'main');
}
async function loadState(){
  if(!db)await openDB();
  let s=await idbGet('state','main');
  if(!s){try{const raw=localStorage.getItem(STORE+'.state');if(raw)s=JSON.parse(raw)}catch(e){}}
  if(s){
    state.schemaVersion=s.schemaVersion||SCHEMA_V;
    state.active=s.active||'clients';
    state.firm=s.firm||null;
    state.advisers=Array.isArray(s.advisers)?s.advisers:[];
    state.clients=Array.isArray(s.clients)?s.clients:[];
    state.chat=Array.isArray(s.chat)?s.chat:[];
    state.settings=Object.assign({},state.settings,s.settings||{});
  }
  state.audit=await idbAll('audit');
  state.audit.sort((a,b)=>a.i-b.i);
  state.coolingOffRegister=await idbAll('coolingOff');
  state.complaintsRegister=await idbAll('complaints');
  state.conflictRegister=await idbAll('conflicts');
}
// ═══ AUDIT CHAIN · FCA CMR 6yr retention ═══
async function appendAudit(action,info){
  if(!state.settings.auditChain)return;
  if(!db)await openDB();
  const i=state.audit.length?state.audit[state.audit.length-1].i+1:1;
  const prevHash=state.audit.length?state.audit[state.audit.length-1].docHash:'';
  const payload=info.payload||{};
  const entry={i,ts:Date.now(),tool:TOOLNAME,adviserId:info.adviserId||'',clientId:info.clientId||'',action,reasoning:info.reasoning||'',configVersion:`${TOOLNAME}@${VERSION}`,prevHash,docHash:'',payload};
  entry.docHash=await sha256(JSON.stringify({prevHash,ts:entry.ts,action,clientId:entry.clientId,payload}));
  state.audit.push(entry);
  if(state.audit.length>AUDIT_CAP){
    const drop=state.audit.length-AUDIT_CAP;
    for(let k=0;k<drop;k++){await idbDel('audit',state.audit[k].i)}
    state.audit=state.audit.slice(drop);
  }
  await idbPut('audit',entry);
}
// ═══ BROADCAST MESH · fall-claim + fall-signal ═══
let bcClaim=null, bcSignal=null;
let _bcDebounce={};
function bcInit(){
  try{
    bcClaim=new BroadcastChannel('fall-claim');
    bcClaim.addEventListener('message',handleClaimMsg);
    bcSignal=new BroadcastChannel('fall-signal');
    bcSignal.addEventListener('message',handleSignalMsg);
    bcSignal.postMessage({source:TOOLNAME,type:'hello',prime:PRIME,version:VERSION,ts:now()});
    bcClaim.postMessage({v:1,type:'sync.request',ts:now(),source:TOOLNAME,payload:{}});
  }catch(e){console.warn('BroadcastChannel unavailable',e)}
}
function bcSend(type,payload){
  if(!bcClaim)return;
  const key=type+'|'+(payload?.id||'');
  clearTimeout(_bcDebounce[key]);
  _bcDebounce[key]=setTimeout(()=>{try{bcClaim.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload})}catch(e){}},300);
}
function bcSendNow(type,payload){if(!bcClaim)return;try{bcClaim.postMessage({v:1,type,ts:now(),source:TOOLNAME,payload})}catch(e){}}
async function handleClaimMsg(e){
  const m=e.data;if(!m||m.source===TOOLNAME)return;
  switch(m.type){
    case 'sync.request':
      bcSendNow('sync.snapshot',{clients:state.clients,advisers:state.advisers,firm:state.firm});
      break;
    case 'sync.snapshot':
      mergeSnapshot(m.payload||{});render();break;
    case 'client.created':
    case 'client.updated':
    case 'client.archived':
      mergeRecord('clients',m.payload);render();break;
    case 'adviser.created':
    case 'adviser.updated':
    case 'adviser.archived':
      mergeRecord('advisers',m.payload);render();break;
    case 'firm.updated':
      if(!state.firm||(m.payload?.updatedAt||0)>(state.firm?.updatedAt||0)){state.firm=m.payload;persistState();render()}
      break;
    case 'conflict.check.request':{
      const hits=runConflictMatch(m.payload||{});
      bcSendNow('conflict.check.response',{requestId:m.payload?.requestId,hits,source:TOOLNAME});
      break;
    }
    case 'conflict.check.response':
      if(window._conflictAwait&&m.payload?.requestId===window._conflictAwait.id){window._conflictAwait.hits.push({tool:m.source,hits:m.payload.hits||[]})}
      break;
    case 'complaint.recorded':
      if(m.payload&&m.payload.id&&!state.complaintsRegister.find(x=>x.id===m.payload.id)){state.complaintsRegister.push(m.payload);idbPut('complaints',m.payload).catch(()=>{});render()}
      break;
  }
}
function handleSignalMsg(e){
  const m=e.data;if(!m||m.source===TOOLNAME)return;
  if(m.type==='ping'&&bcSignal)bcSignal.postMessage({source:TOOLNAME,type:'pong',prime:PRIME,version:VERSION,ts:now()});
}
function mergeRecord(coll,rec){
  if(!rec||!rec.id)return;
  const arr=state[coll];const i=arr.findIndex(x=>x.id===rec.id);
  if(i<0){arr.push(rec);persistState();return}
  if((rec.updatedAt||0)>(arr[i].updatedAt||0)){arr[i]=rec;persistState()}
}
function mergeSnapshot(p){
  if(Array.isArray(p.clients))p.clients.forEach(c=>mergeRecord('clients',c));
  if(Array.isArray(p.advisers))p.advisers.forEach(a=>mergeRecord('advisers',a));
  if(p.firm)mergeRecord_firm(p.firm);
}
function mergeRecord_firm(f){if(!f)return;if(!state.firm||(f.updatedAt||0)>(state.firm.updatedAt||0)){state.firm=f;persistState()}}
function runConflictMatch(q){
  // Match by name+dob+nino+email
  const hits=[];
  const nameKey=(q.firstName||'').toLowerCase().trim()+'|'+(q.lastName||'').toLowerCase().trim();
  for(const c of state.clients){
    const ck=(c.firstName||'').toLowerCase().trim()+'|'+(c.lastName||'').toLowerCase().trim();
    let why=[];
    if(ck&&ck===nameKey)why.push('name');
    if(q.dob&&c.dob&&q.dob===c.dob)why.push('dob');
    if(q.nino&&c.nino&&q.nino.replace(/\s/g,'').toUpperCase()===c.nino.replace(/\s/g,'').toUpperCase())why.push('nino');
    if(q.email&&c.email&&q.email.toLowerCase()===c.email.toLowerCase())why.push('email');
    if(why.length){hits.push({id:c.id,name:`${c.firstName} ${c.lastName}`.trim(),matched:why,clientType:c.clientType,archived:!!c.archivedAt})}
  }
  return hits;
}
// ═══ FACTORIES ═══
function newClientRec(){
  const t=now();
  return {
    id:uid('cl'),firmId:state.firm?.id||'',
    createdAt:t,updatedAt:t,archivedAt:null,
    clientType:'individual',
    litigationFriend:{name:'',relationship:'',address:'',phone:'',email:'',certIssuedAt:null,certDocId:''},
    deputy:{name:'',orderRef:'',courtOfProtectionAt:null},
    title:'Mr',firstName:'',middleName:'',lastName:'',preferredName:'',
    dob:'',gender:'',nationality:'GB',countryOfResidence:'GB',nino:'',utr:'',taxResidency:['GB'],
    email:'',phone:'',
    address:{line1:'',line2:'',city:'',region:'England',postcode:'',country:'GB',since:''},
    addressHistory:[],
    relationships:[],
    capacity:{concerns:false,assessmentRequired:false,assessmentDate:null,assessor:'',outcome:'',notes:'',docId:''},
    referral:{source:'direct',sourceName:'',sourceContact:'',introducerRegRef:'',feePaid:false,feeAmount:0,feeBasis:'',laspoCompliant:true,notes:''},
    kyc:{
      status:'pending',riskGrade:'low',
      pepFlag:false,pepDetails:'',
      sanctionsStatus:'not-checked',sanctionsCheckedAt:null,sanctionsCheckedBy:'',
      sourceOfFunds:'',sourceOfFundsNotes:'',
      sourceOfWealth:'',sourceOfWealthNotes:'',
      vulnerableCustomerFlag:false,vulnerabilityCategory:'',vulnerabilityNotes:'',
      documentsHeld:[],
      lastReviewAt:null,nextReviewDue:null
    },
    cooling:{
      offDate:null,                  // when 14-day period started
      expiresAt:null,                // start + 14d
      waived:false,
      waiverReason:'',
      waiverAcknowledgedAt:null,
      cancelledAt:null,
      cancellationReason:'',
      noticeIssuedAt:null,
      processedBy:''
    },
    complaintsNoticeIssuedAt:null,
    fees:{
      arrangement:'cfa',hourlyRate:0,fixedFee:0,
      cfaSuccessFeePct:100,cfaCappedDamagesPct:25,
      dbaPct:25,
      atePursued:false,ateInsurer:'',atePremium:0,ateCovers:'',
      estimatedTotal:0,disclosureIssuedAt:null,signedAt:null,
      ddNotes:''
    },
    suitability:{
      attitudeToRisk:4,capacityForLoss:'medium',knowledgeExperience:'medium',
      investmentHorizon:0,objectives:[],incomeNeeds:0,ethicalPreferences:'',lastReviewAt:null
    },
    conflict:{checked:false,checkedAt:null,checkedBy:'',hitsLocal:[],hitsMesh:[],resolution:'',clear:false},
    adviserId:state.advisers[0]?.id||'',
    handlerId:state.advisers[0]?.id||'',
    engagement:{startedAt:t,type:'one-off',feeBasis:'cfa',feeAgreementHash:'',feeAgreementSignedAt:null,initialFee:0,ongoingFee:0,nextReviewDue:null},
    claimContext:{type:'rta',incidentDate:'',incidentLocation:'',brief:'',estimatedValue:0},
    notes:[],
    links:{cases:[],fallclaimpaperDocs:[],fallclaimpracticeFees:[]},
    app:{isDemo:false,onboardCompleted:false}
  };
}
function newAdviserRec(){
  const t=now();
  return {id:uid('ad'),firmId:state.firm?.id||'',createdAt:t,updatedAt:t,archivedAt:null,
    name:'',email:'',phone:'',cmrAuthRef:'',sraRoll:'',role:'caseworker',status:'active',startedAt:t,leftAt:null};
}
function newFirmRec(){
  const t=now();
  return {id:uid('fm'),createdAt:t,updatedAt:t,
    name:'',tradingName:'',regimeType:'cmr',fcaCmrRef:'',sraRef:'',companiesHouseNo:'',vatNumber:'',
    registeredAddress:{line1:'',line2:'',city:'',postcode:'',country:'GB'},
    piInsurer:'',piPolicyNo:'',piExpiresAt:null,
    complaintsContact:{name:'',email:'',phone:''},
    professionalBody:'',brandColor:'#8b1a1a',brandLogoDataUri:'',setupCompletedAt:null};
}
// ═══ AML RISK SCORING ═══
function suggestRiskGrade(c){
  const k=c.kyc||{};let score=0;const reasons=[];
  if(k.pepFlag){score+=3;reasons.push('PEP flagged (+3)')}
  if(k.sanctionsStatus==='match'){score+=4;reasons.push('Sanctions match (+4)')}
  if(k.sanctionsStatus==='review'){score+=2;reasons.push('Sanctions review (+2)')}
  if(k.sanctionsStatus==='not-checked'){score+=1;reasons.push('Sanctions not checked (+1)')}
  if(k.vulnerableCustomerFlag){score+=1;reasons.push('Vulnerable customer (+1)')}
  if(HIGH_RISK_JURIS.includes(c.nationality)){score+=3;reasons.push('Nationality high-risk juris (+3)')}
  if(HIGH_RISK_JURIS.includes(c.countryOfResidence)){score+=3;reasons.push('Residence high-risk juris (+3)')}
  if(c.clientType==='protected'){score+=2;reasons.push('Protected party (+2)')}
  if(c.capacity?.concerns){score+=1;reasons.push('Capacity concerns (+1)')}
  if(c.referral?.source==='lead-generator'){score+=1;reasons.push('Lead-generator referral (+1)')}
  if(c.referral?.feePaid&&c.claimContext?.type&&['rta','el','pl','clinical-neg','trip'].includes(c.claimContext.type)){score+=4;reasons.push('Referral fee paid on PI claim — LASPO ban (+4)')}
  const grade=score>=4?'high':(score>=2?'medium':'low');
  return {grade,score,reasons};
}
function computeReviewDates(c){
  const grade=c.kyc?.riskGrade||'low';
  const days=REVIEW_CADENCE[grade]||365;
  const last=c.kyc?.lastReviewAt||c.createdAt||now();
  return {lastReviewAt:last,nextReviewDue:addDays(last,days)};
}
// ═══ CLIENT CRUD ═══
async function saveClient(c,action,reasoning){
  c.updatedAt=now();
  const i=state.clients.findIndex(x=>x.id===c.id);
  const isNew=i<0;
  if(isNew)state.clients.push(c);else state.clients[i]=c;
  await persistState();
  await appendAudit(action||(isNew?'client.created':'client.updated'),{
    clientId:c.id,adviserId:c.adviserId,
    reasoning:reasoning||(isNew?'Claimant onboarding committed':'Claimant record updated'),
    payload:{id:c.id,name:`${c.firstName} ${c.lastName}`.trim(),clientType:c.clientType,kyc:c.kyc?.status,risk:c.kyc?.riskGrade,coolingExpires:c.cooling?.expiresAt}
  });
  bcSend(isNew?'client.created':'client.updated',c);
  return c;
}
async function archiveClient(c,reasoning){
  c.archivedAt=now();c.updatedAt=now();
  await persistState();
  await appendAudit('client.archived',{clientId:c.id,adviserId:c.adviserId,reasoning:reasoning||'Soft-archived (FCA CMR 6yr retention)',payload:{id:c.id}});
  bcSend('client.archived',c);
}
async function saveAdviser(a,reasoning){
  a.updatedAt=now();
  const i=state.advisers.findIndex(x=>x.id===a.id);
  const isNew=i<0;
  if(isNew)state.advisers.push(a);else state.advisers[i]=a;
  await persistState();
  await appendAudit(isNew?'adviser.created':'adviser.updated',{adviserId:a.id,reasoning:reasoning||'Caseworker saved',payload:{id:a.id,name:a.name,role:a.role}});
  bcSend(isNew?'adviser.created':'adviser.updated',a);
}
async function saveFirm(f,reasoning){
  f.updatedAt=now();state.firm=f;
  await persistState();
  await appendAudit('firm.updated',{reasoning:reasoning||'Firm record saved',payload:{id:f.id,name:f.name,regime:f.regimeType,cmr:f.fcaCmrRef,sra:f.sraRef}});
  bcSend('firm.updated',f);
}
// ═══ DOCUMENTS ═══
async function storeDocument(file,clientId,type,note){
  const id=uid('dc');
  const hash=await sha256Blob(file);
  const rec={id,clientId,filename:file.name,type,mime:file.type||'',size:file.size,sha256:hash,capturedAt:now(),note:note||'',blob:file};
  await idbPut('documents',rec);
  const expDays=DOC_EXPIRY[type];
  return {id,type,filename:file.name,blobRef:id,sha256:hash,size:file.size,mime:rec.mime,capturedAt:rec.capturedAt,expiresAt:expDays?addDays(rec.capturedAt,expDays):null,verifiedBy:'',note:note||''};
}
async function fetchDocument(id){return idbGet('documents',id)}
async function downloadDocument(id){
  const r=await fetchDocument(id);if(!r){toast('Document not found');return}
  const u=URL.createObjectURL(r.blob);const a=document.createElement('a');a.href=u;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
async function deleteDocument(id){await idbDel('documents',id)}
// ═══ COOLING-OFF REGISTER ═══
async function recordCoolingOffEvent(clientId,kind,info){
  const id=uid('co');
  const rec={id,clientId,kind,ts:now(),processedBy:info.processedBy||state.advisers[0]?.id||'',notes:info.notes||'',expiresAt:info.expiresAt||null,waived:!!info.waived,waiverReason:info.waiverReason||'',cancellationReason:info.cancellationReason||''};
  state.coolingOffRegister.push(rec);
  await idbPut('coolingOff',rec);
  await appendAudit('cooling.'+kind,{clientId,reasoning:`Cooling-off ${kind}: ${info.notes||''}`,payload:rec});
  return rec;
}
async function recordComplaint(payload){
  const id=uid('cp');
  const rec=Object.assign({id,ts:now(),firmId:state.firm?.id||'',resolution:'',resolutionAt:null,fosEscalated:false,fosEscalatedAt:null,learning:''},payload);
  state.complaintsRegister.push(rec);
  await idbPut('complaints',rec);
  await appendAudit('complaint.recorded',{clientId:rec.clientId||'',reasoning:`Complaint recorded: ${rec.nature||''}`,payload:rec});
  bcSend('complaint.recorded',rec);
  return rec;
}
async function updateComplaint(id,patch){
  const i=state.complaintsRegister.findIndex(c=>c.id===id);if(i<0)return;
  const rec=Object.assign({},state.complaintsRegister[i],patch);
  state.complaintsRegister[i]=rec;
  await idbPut('complaints',rec);
  await appendAudit('complaint.updated',{clientId:rec.clientId||'',reasoning:'Complaint updated',payload:{id,patch}});
  bcSend('complaint.recorded',rec);
}
async function recordConflictCheck(clientId,info){
  const id=uid('cf');
  const rec={id,clientId,ts:now(),checkedBy:info.checkedBy||state.advisers[0]?.id||'',hitsLocal:info.hitsLocal||[],hitsMesh:info.hitsMesh||[],resolution:info.resolution||'',clear:!!info.clear,notes:info.notes||''};
  state.conflictRegister.push(rec);
  await idbPut('conflicts',rec);
  await appendAudit('conflict.check',{clientId,reasoning:`Conflict check ${rec.clear?'CLEAR':'HITS '+(rec.hitsLocal.length+rec.hitsMesh.length)}`,payload:rec});
  return rec;
}
// ═══ DEMO SEED ═══
async function seedDemoIfEmpty(){
  if(state.settings.isDemoSeeded)return;
  if(state.clients.length>0)return;
  if(!state.firm){
    const f=newFirmRec();
    f.name='DEMO · Acme Claims Ltd · overwrite me';
    f.regimeType='cmr';f.fcaCmrRef='830000';f.companiesHouseNo='12345678';
    f.registeredAddress={line1:'1 Demo St',line2:'',city:'London',postcode:'SW1A 1AA',country:'GB'};
    f.piInsurer='Demo PI';f.piPolicyNo='DEMO-001';f.piExpiresAt=addDays(now(),365);
    f.complaintsContact={name:'Demo Compliance',email:'complaints@acme.demo',phone:'020 0000 0000'};
    f.professionalBody='ACSO';f.setupCompletedAt=now();
    state.firm=f;
  }
  if(state.advisers.length===0){
    const a=newAdviserRec();a.firmId=state.firm.id;
    a.name='DEMO · Priya Singh · overwrite me';a.email='priya@acme.demo';
    a.cmrAuthRef='PS001';a.role='caseworker';
    state.advisers.push(a);
  }
  const c=newClientRec();
  c.firmId=state.firm.id;c.adviserId=state.advisers[0].id;c.handlerId=state.advisers[0].id;
  c.clientType='individual';
  c.title='Ms';c.firstName='DEMO · Alice';c.lastName='Patel · overwrite me';
  c.dob='1985-03-14';c.nationality='GB';c.countryOfResidence='GB';
  c.nino='AB123456C';c.email='alice.demo@example.com';c.phone='+44 7700 900000';
  c.address={line1:'12 High St',line2:'',city:'London',region:'England',postcode:'SW1A 1AA',country:'GB',since:'2020-04-01'};
  c.capacity={concerns:false,assessmentRequired:false,assessmentDate:null,assessor:'',outcome:'capacity confirmed',notes:'No concerns at intake',docId:''};
  c.referral={source:'direct',sourceName:'',sourceContact:'',introducerRegRef:'',feePaid:false,feeAmount:0,feeBasis:'',laspoCompliant:true,notes:'Direct enquiry via firm website'};
  c.kyc.status='verified';c.kyc.riskGrade='low';
  c.kyc.sanctionsStatus='clear';c.kyc.sanctionsCheckedAt=now()-86400000*20;c.kyc.sanctionsCheckedBy=state.advisers[0].id;
  c.kyc.sourceOfFunds='earnings';c.kyc.sourceOfFundsNotes='No funds needed — CFA arrangement';
  c.kyc.lastReviewAt=now()-86400000*20;
  c.kyc.nextReviewDue=addDays(c.kyc.lastReviewAt,365);
  const coolStart=now()-86400000*20;
  c.cooling={offDate:coolStart,expiresAt:addDays(coolStart,COOLING_OFF_DAYS),waived:false,waiverReason:'',waiverAcknowledgedAt:null,cancelledAt:null,cancellationReason:'',noticeIssuedAt:coolStart,processedBy:state.advisers[0].id};
  c.complaintsNoticeIssuedAt=coolStart;
  c.fees={arrangement:'cfa',hourlyRate:0,fixedFee:0,cfaSuccessFeePct:100,cfaCappedDamagesPct:25,dbaPct:25,atePursued:true,ateInsurer:'Temple Legal Protection',atePremium:295,ateCovers:'Adverse costs + own disbursements up to £25k',estimatedTotal:5000,disclosureIssuedAt:coolStart,signedAt:coolStart+86400000,ddNotes:'CFA signed · cooling-off complete'};
  c.conflict={checked:true,checkedAt:coolStart,checkedBy:state.advisers[0].id,hitsLocal:[],hitsMesh:[],resolution:'No conflicts identified',clear:true};
  c.claimContext={type:'rta',incidentDate:'2025-12-04',incidentLocation:'A406 North Circular, Brent Cross',brief:'Rear-ended at red light by uninsured driver — liability accepted by MIB. Whiplash + soft-tissue injury, 6 weeks physio.',estimatedValue:4500};
  c.engagement.type='one-off';c.engagement.feeBasis='cfa';c.engagement.feeAgreementSignedAt=coolStart+86400000;
  c.app.isDemo=true;c.app.onboardCompleted=true;
  state.clients.push(c);
  // seed register echoes
  state.coolingOffRegister.push({id:uid('co'),clientId:c.id,kind:'started',ts:coolStart,processedBy:state.advisers[0].id,notes:'14-day FCA CMR cooling-off issued at intake',expiresAt:c.cooling.expiresAt,waived:false});
  state.coolingOffRegister.push({id:uid('co'),clientId:c.id,kind:'expired',ts:c.cooling.expiresAt,processedBy:'system',notes:'Period elapsed without cancellation',expiresAt:c.cooling.expiresAt,waived:false});
  for(const r of state.coolingOffRegister)await idbPut('coolingOff',r);
  state.settings.isDemoSeeded=true;
  await persistState();
  await appendAudit('demo.seeded',{reasoning:'Empty-state demo claimant seeded; auto-purges on first real client'});
}
async function purgeDemoIfPresent(){
  const demos=state.clients.filter(c=>c.app?.isDemo);
  if(demos.length===0)return false;
  const real=state.clients.filter(c=>!c.app?.isDemo&&!c.archivedAt);
  if(real.length===0)return false;
  state.clients=state.clients.filter(c=>!c.app?.isDemo);
  if(state.firm?.name?.startsWith('DEMO · '))state.firm=null;
  state.advisers=state.advisers.filter(a=>!a.name?.startsWith('DEMO · '));
  state.coolingOffRegister=state.coolingOffRegister.filter(r=>state.clients.find(c=>c.id===r.clientId));
  for(const r of await idbAll('coolingOff'))if(!state.coolingOffRegister.find(x=>x.id===r.id))await idbDel('coolingOff',r.id);
  await persistState();
  await appendAudit('demo.purged',{reasoning:'First real claimant added — demo records cleared'});
  return true;
}
// ═══ T0/T3 CASCADE · CMR knowledge ═══
const Cascade={
  detectTier(){const s=state.settings;if(s.anthropicKey||s.openaiKey||s.geminiKey||s.openrouterKey)return'T3';return'T0'},
  async generate(sys,user,maxTok){
    const s=state.settings,max=maxTok||1400;
    if(s.anthropicKey)try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':s.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:max,system:sys,messages:[{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·Claude',text:d?.content?.[0]?.text||''}}catch(e){}
    if(s.geminiKey)try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${s.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{parts:[{text:user}]}]})});const d=await r.json();return{tier:'T3·Gemini',text:d?.candidates?.[0]?.content?.parts?.[0]?.text||''}}catch(e){}
    if(s.openaiKey)try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·GPT',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    if(s.openrouterKey)try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openrouterKey,'HTTP-Referer':location.origin},body:JSON.stringify({model:'anthropic/claude-haiku-4-5',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·OpenRouter',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    return{tier:'T0',text:null}
  }
};
const T0_RULES=[
  {match:/cool.?off|14.?day|cancel.*period|withdraw|right to cancel/i,title:'FCA CMR cooling-off period',answer:()=>`**FCA CMR cooling-off** — 14 calendar days from the day the agreement is concluded (FCA CMCOB 4.2 / Consumer Contracts Regulations 2013).
**What must be issued at intake:**
- Cancellation notice in **durable medium** (paper or PDF, not just web)
- Clear statement of the **14-day** period
- Plain-English **method** for cancelling (post / email / phone)
- Confirmation that **no termination fee** applies during the period
**Waiver (must all be true):**
1. Client expressly requested service to start **immediately**
2. Client acknowledged in **writing** loss of right to cancel for completed work
3. Firm captured the acknowledgement **before** any chargeable work began
**If cancelled in-period:**
- No fee for work not yet done
- Reasonable fee permitted for work the client expressly authorised (and acknowledged would be charged)
- Refund any sums paid within 14 days
**FallClaimOnboard captures:** offDate, expiresAt, waived flag + reason, cancellation events, processedBy adviser. Cooling-off register is the audit trail.`},
  {match:/laspo|referral fee|pi referral|personal injury.*referral/i,title:'LASPO 2012 · PI referral fee ban',answer:()=>`**LASPO 2012 s.56-60** bans the payment / receipt of referral fees for **personal injury** claims.
**Scope:**
- Applies to: regulated persons (solicitors, CMCs, insurers, claims management companies)
- Claim type: personal injury (RTA, EL, PL, clinical neg, trip-and-slip, etc.)
- A "referral" includes information about the prospective claimant being provided in exchange for a payment
**What's banned:**
- CMC paying a lead generator £X per PI lead
- Solicitor paying CMC £X per referred claimant
- Insurer selling claimant data for fee
**What's NOT banned:**
- **Reasonable** payments for **specific services actually provided** (marketing, vetting, admin)
- Joint marketing where no per-case fee
- Non-PI referrals (housing disrepair, financial mis-selling, data breach — not PI under LASPO)
**FCA CMCOB 5.1.3R** echoes the prohibition in FCA-regulated CMC space.
**FallClaimOnboard flags:** referral.feePaid + claim type. If a fee was paid on a PI claim, the risk grade scores +4 and you'll need to evidence the payment was for services, not the referral itself.`},
  {match:/mca|mental capacity|capacity.*2005|protected party|deputy/i,title:'Mental Capacity Act 2005 · protected party',answer:()=>`**Mental Capacity Act 2005** — applies to anyone aged 16+.
**Test (s.2-3):** a person lacks capacity if, at the material time, they cannot:
1. **Understand** information relevant to the decision
2. **Retain** that information
3. **Use or weigh** the information as part of the decision
4. **Communicate** their decision (any means)
…because of an impairment of, or disturbance in the functioning of, the mind or brain (s.2).
**Principles (s.1):**
- Presumed to have capacity unless established otherwise
- Not lacking capacity merely because they make an unwise decision
- Decisions taken on behalf must be in their **best interests** (s.4)
- Take the least restrictive option
**For a claims firm:**
- If client lacks capacity → they are a **protected party** under CPR 21
- Cannot conduct proceedings without a **litigation friend** (deputy under Court of Protection, or Court-appointed litigation friend)
- Settlement requires court approval (CPR 21.10)
- Any contract (CFA/DBA) signed by litigation friend on behalf, with court oversight
- Get formal capacity assessment if any doubt — GP, psychiatrist, or specialist capacity assessor
**FallClaimOnboard captures:** capacity.concerns, assessmentRequired, assessmentDate, assessor, outcome, deputy/litigation-friend details + cert document.`},
  {match:/litigation friend|cpr 21|next friend|child.*claim|minor/i,title:'Litigation friend · CPR 21',answer:()=>`**CPR 21** — children (under 18) and protected parties must conduct proceedings through a **litigation friend**.
**Eligibility (CPR 21.4):**
- Can fairly and competently conduct proceedings
- No adverse interest to the child/protected party
- Will pay any costs ordered against the child/protected party (subject to indemnity)
**Common litigation friends:**
- **Child:** parent / guardian / Official Solicitor (last resort)
- **Protected party:** Court of Protection deputy, donee of LPA (property & affairs), or Official Solicitor
**Process:**
- File **certificate of suitability** (Form N235) before court, or
- Court-appointed by order (Form N210 application)
**Settlement:** any compromise of a child / protected party claim **requires court approval** (CPR 21.10) — Part 8 claim form + advice from counsel on quantum. Damages held in court funds for minors until 18 (or under Deputy for protected party).
**Costs:** unusual scrutiny — Solicitors Act detailed assessment by default unless court orders summary assessment.
**FallClaimOnboard captures:** litigationFriend.name / relationship / address / phone / email / certIssuedAt + cert document.`},
  {match:/cmr fee|fca.*fee.*disclos|fee disclosure|cmcob 6/i,title:'FCA CMR fee disclosure (CMCOB 6)',answer:()=>`**FCA CMCOB 6** — regulated CMCs must disclose fees clearly and prominently **before** the agreement is concluded.
**Required disclosure (CMCOB 6.1):**
1. **Total fees** the client will be liable to pay (in pounds, not just %)
2. **Method** of charging (CFA / DBA / hourly / fixed)
3. **Estimate** of total cost if it cannot be precise — with assumptions stated
4. **VAT** treatment
5. **What happens** if the claim is unsuccessful (any fee? disbursements?)
6. **Cancellation** consequences
7. **Source of fees** — paid from damages, paid by adversary, paid by client direct
8. **Comparison** to free alternatives (e.g. FOS for financial mis-selling, ICO for data breach)
**Form:** durable medium, plain English, **before** instruction (CMCOB 6.2).
**Fair value (Consumer Duty PRIN 2A):** the fee must represent fair value relative to the service. Document the assessment.
**SRA-regulated solicitors:** SRA Transparency Rules + Code of Conduct para 8.7 — similar fee disclosure plus client care letter.
**FallClaimOnboard captures:** fees.arrangement, fees.estimatedTotal, disclosureIssuedAt, signedAt — generated in onboarding step 9, surfaced in the commit step.`},
  {match:/complaint|fos|financial ombudsman|complaints handling|cmcob 9|dispute/i,title:'Complaints handling · FOS escalation',answer:()=>`**FCA CMR firms** — DISP rules apply, in particular DISP 1 + 2 + CMCOB 9.
**At intake (mandatory):**
- Written / durable-medium notice of the firm's complaints procedure
- Identity + contact of the complaints handler
- Notification of the **right to escalate to FOS** if dissatisfied
- 6-month time limit from final response (or 6 months from event if no final response)
**On receipt of a complaint:**
- Acknowledge within **48 hours** (good practice; DISP says "promptly")
- Substantive **final response** within **8 weeks** (DISP 1.6.2R)
- Final response must include FOS leaflet + 6-month time-bar warning
- Cooperate with FOS investigation
**FOS jurisdiction:**
- Eligible complainant: consumer, micro-enterprise, small charity, trustee of small trust
- Award limit: £430,000 (from April 2025) for acts/omissions on/after 1 April 2019
- Binding on firm if complainant accepts
- Firm pays case fee (£750 from £950 above the 3rd case/year free threshold)
**Records (DISP 1.9):** keep for **5 years** (FCA SYSC requires 6 for CMR — use 6).
**FallClaimOnboard captures:** complaintsNoticeIssuedAt (per-client) + dedicated **Complaints Register** tab (every complaint, nature, resolution, FOS escalation, learning).`},
  {match:/cfa|conditional fee|no win no fee|success fee/i,title:'CFA · Conditional Fee Agreement',answer:()=>`**CFA** — Courts and Legal Services Act 1990 s.58 (as amended by LASPO 2012).
**Structure:**
- Solicitor / CMC fees **conditional on success** (no win, no fee)
- If success: base costs + uplift ("success fee") + disbursements
- If loss: no base costs payable by client; client still liable for disbursements (mitigated by ATE)
**Post-LASPO (1 April 2013):**
- Success fee **no longer recoverable from the losing party** (except mesothelioma, insolvency until April 2016, publication & privacy)
- Paid by **client out of damages**
- **Capped at 25% of damages** for personal injury (general + past loss only; future loss excluded)
- Max success fee uplift: **100% of base costs**
**Formalities (s.58(3)):**
- In writing
- Signed by client
- Comply with CFA Regulations 2013 (info to be given before signing)
**For CMCs:** CFAs OK but FCA CMR fee disclosure rules add layers. Many CMCs prefer DBA for simplicity (single % of damages, no base costs accounting).
**FallClaimOnboard:** captures fees.arrangement='cfa', cfaSuccessFeePct (max 100), cfaCappedDamagesPct (25 default for PI), disclosureIssuedAt, signedAt.`},
  {match:/dba|damages.?based|damages based agreement/i,title:'DBA · Damages-Based Agreement',answer:()=>`**DBA** — Damages-Based Agreements Regulations 2013 (under LASPO 2012 s.45).
**Structure:**
- Lawyer's fee = **% of damages recovered** (contingency fee)
- If no recovery, no fee
- Client may still owe disbursements (mitigated by ATE)
**Caps (DBA Regs 2013 reg.4):**
- **Personal injury:** 25% of damages (general damages + past loss; future loss excluded)
- **Employment tribunal:** 35%
- **All other civil:** 50%
- All caps **inclusive of VAT**
**Counsel's fees:** added to the cap (DBA fee includes counsel) — historically debated, 2023 reforms clarified counsel can be ring-fenced if expressly stated.
**Required terms (reg.3):**
- Reasons for fee level
- Claim subject matter
- Circumstances in which payment is due
- Amount payable
**Hybrid DBAs:** post the 2023 DBA reform, sequential hybrid permitted (DBA for part of work, hourly for another). Concurrent hybrid still uncertain — get specialist advice.
**FallClaimOnboard:** captures fees.dbaPct (default 25 for PI), enforces cap warning if exceeded for PI claim.`},
  {match:/ate|after.?event|atE insurance|adverse cost/i,title:'ATE · After-the-Event insurance',answer:()=>`**ATE insurance** — policy taken out **after** a dispute arises to protect the claimant against:
1. **Adverse costs** if the claim loses
2. **Own disbursements** (court fees, medical reports, counsel)
3. Sometimes own solicitor fees if the case loses and a CFA isn't in place
**Post-LASPO (April 2013):** ATE **premiums no longer recoverable from defendant** (except clinical negligence — limited expert-report cover under LASPO s.46).
**Effect:**
- Claimant funds premium from damages (or QOCS protects them — see below)
- Many PI claimants don't bother — QOCS covers the main risk
- ATE still useful for: clinical negligence expert costs, commercial disputes, defamation, IP
**QOCS (Qualified One-way Costs Shifting) — CPR 44.13-17:**
- For PI claims (incl. clinical neg, FAA claims) issued after 1 April 2013
- Defendant cannot enforce a costs order against claimant unless:
  - Claim struck out / fundamentally dishonest
  - Claimant beats own Part 36 offer
  - Claim made for the benefit of someone other than the claimant
- Effectively makes ATE optional for QOCS-covered PI
**FallClaimOnboard:** captures fees.atePursued, ateInsurer, atePremium, ateCovers. Discloses position to client per CMCOB 6 / SRA transparency.`},
  {match:/damages.*cap|25%|pi cap|personal injury cap/i,title:'Damages-based caps · PI 25%',answer:()=>`**The 25% cap** for PI claims comes from:
**LASPO s.46 + Conditional Fee Agreements Order 2013 art.5 + DBA Regs 2013 reg.4(2):**
- **CFA success fee:** capped at 25% of *general damages + past pecuniary loss net of CRU* — future loss excluded
- **DBA payment:** capped at 25% of *general damages + past pecuniary loss net of CRU* — future loss excluded
**Why the carve-out for future loss?** Lord Justice Jackson's reform protected future-loss (loss of earnings, care, etc.) from being eroded by fees — to keep the claimant whole long-term.
**CRU (Compensation Recovery Unit):** DWP recovers state benefits paid to claimant during recovery; recoverable benefits are deducted from past loss before the 25% is taken.
**Other PI fee caps to know:**
- **In-court litigation DBAs** for PI: 25% (vs 50% in other civil and 35% employment)
- **Costs vs damages — Proportionality test** (CPR 44.3(5)): no cap but court can disallow disproportionate costs
**FallClaimOnboard:** enforces an inline warning if cfaCappedDamagesPct > 25 OR dbaPct > 25 on a PI claim type (rta, el, pl, clinical-neg, trip).`},
  {match:/cancellation timef|when.*cancel|cancel.*window|how.*cancel/i,title:'Cancellation timeframes',answer:()=>`**Cancellation timeframes — claims firm intake:**
| Scenario | Window | Source |
|---|---|---|
| Off-premises / distance contract | **14 days** | Consumer Contracts Regs 2013 reg.29 + FCA CMCOB 4 |
| On-premises but FCA CMR-regulated | **14 days** | CMCOB 4 |
| Waiver (work to begin in-period) | None — but reasonable fee chargeable for authorised work | CCR 2013 reg.36 |
| Cancellation method | **Any clear statement** — model form NOT mandatory but should be available | CCR 2013 reg.32 + Sch 3 |
| Refund of payments | **14 days** from cancellation | CCR 2013 reg.34 |
**Form:** durable medium (post, email, signed letter). Web-form acceptable only if user-friendly + confirmation given.
**Effect of cancellation:**
- All payments refunded within 14 days
- Service stops immediately
- Fee chargeable only for work expressly authorised and acknowledged-as-chargeable in writing
**Tipping point — waiver:**
- Client signs acknowledgement: *"I require service to begin immediately and accept that if I cancel within 14 days I will be charged a reasonable amount for the work done up to cancellation."*
- Without that acknowledgement: client owes **nothing** for in-period work
**FallClaimOnboard:** capture in step 7 — offDate, waived (bool), waiverReason, waiverAcknowledgedAt. Cooling-off register logs every event.`},
  {match:/vulnerab|fg21|fg ?21\/?1|claims vulnerab/i,title:'Vulnerability assessment in claims context',answer:()=>`**FCA FG21/1** + **CMCOB 1.2.4G** apply to CMR firms. Claims clients are often **more** vulnerable than financial-advisory clients — they are often:
- Recently injured / in pain
- Bereaved (fatal accident claims)
- Under financial stress (lost earnings, mounting medical bills)
- Distressed by the incident (PTSD common in RTA, assault)
- New to legal process (low capability)
**Four drivers (FG21/1):**
1. **Health** — injury itself, mental health impact, pre-existing conditions
2. **Life events** — incident, bereavement, job loss from injury
3. **Resilience** — claim may be the only source of replacing lost income
4. **Capability** — first time dealing with insurers / courts / medical experts
**SRA Code of Conduct para 1.4 + Principle 7:** act in clients' best interests, identify vulnerable clients, adapt.
**Practical adjustments:**
- Phone over email for distressed clients
- In-person / video meetings for capacity-sensitive clients
- Trusted third party present (with explicit written consent)
- Avoid quick Part 36 settlement decisions — give 7-day reflection
- Refer to Citizens Advice / counselling where appropriate
**FallClaimOnboard:** captures vulnerableCustomerFlag + category (health/life-event/resilience/capability) + notes + adjustments made.`},
  {match:/sra|solicitor.*regulat|colp|sra accounts/i,title:'SRA-regulated solicitor practice (vs CMR CMC)',answer:()=>`**SRA-regulated solicitors** handling claims work follow:
- **SRA Standards & Regulations 2019** (Code of Conduct + Accounts Rules)
- **SRA Principles** (7 principles — independence, integrity, etc.)
- **SRA Transparency Rules** — fee + complaints publication
- Required roles: **COLP** (Compliance Officer for Legal Practice), **COFA** (Accounts)
**Differences vs FCA CMR CMC:**
| Topic | SRA solicitor | FCA CMR CMC |
|---|---|---|
| Regulator | SRA | FCA |
| Code | SRA Standards | CMCOB |
| Cooling-off | Code para 8.7 + consumer regs | CMCOB 4 (14 days) |
| Fee disclosure | Code para 8.7 | CMCOB 6 |
| Complaints | DISP via Legal Ombudsman (LeO) | DISP via FOS |
| AML | Same MLR 2017 + LSAG guidance | Same MLR 2017 + JMLSG |
| Compensation | SRA Compensation Fund | FSCS (limited for CMC) |
| PII | SRA min terms (£2m / £3m partnerships) | FCA-specified levels |
**Dual-regulated:** ABS structures with both SRA and FCA permissions exist — they must follow both regimes.
**FallClaimOnboard:** firm.regimeType = 'cmr' | 'sra' | 'both'. Captures fcaCmrRef AND sraRef separately. Complaints register routes to FOS or LeO accordingly.`},
];
async function answer(q){
  for(const r of T0_RULES){if(r.match.test(q))return{src:'T0 · '+r.title,text:r.answer()}}
  const tier=Cascade.detectTier();
  if(tier==='T3'){
    const sys=`You are FallClaimOnboard, a sovereign UK FCA CMR + SRA-shaped claimant onboarding tool. You help a 1–10 person UK claims firm (CMC or solicitor practice) with: FCA CMR cooling-off (CMCOB 4 / Consumer Contracts Regulations 2013, 14 days), LASPO 2012 PI referral fee ban (s.56-60), Mental Capacity Act 2005 + CPR 21 litigation friend / protected party, CFA / DBA / damages-based caps (PI 25%), ATE insurance + QOCS, FCA CMR fee disclosure (CMCOB 6), complaints handling (DISP / FOS / LeO), AML (MLR 2017), and audit-trail discipline. You are informational — not regulated advice. Cite source (CMCOB ref, CPR rule, statute s.N). End with: "Verify with your COLP / MLRO / compliance officer before relying."`;
    const ctx=`Firm: ${state.firm?.name||'(not set up)'} · regime: ${state.firm?.regimeType||'(unset)'} · active clients: ${state.clients.filter(c=>!c.archivedAt).length} · cooling-off events ${state.coolingOffRegister.length} · complaints ${state.complaintsRegister.length}.`;
    const r=await Cascade.generate(sys,ctx+'\n\nQuestion: '+q,1400);
    if(r.text)return{src:r.tier,text:r.text}
  }
  return{src:'T0 · fallback',text:`I don't have a canned rule for that question. Add an API key in **Settings** (Gemini is free) to enable T3 grounded answers.
Supported T0 topics:
${T0_RULES.map(r=>'• '+r.title).join('\n')}`};
}
// ═══ VIEW ROUTER ═══
function render(){
  $('#brandName').textContent=state.settings.engineName||'FallClaimOnboard';
  const nav=$('#nav');
  const clientCount=state.clients.filter(c=>!c.archivedAt).length;
  nav.innerHTML=TABS.map(t=>{
    let count='';
    if(t.id==='clients')count=clientCount;
    else if(t.id==='advisers')count=state.advisers.filter(a=>!a.archivedAt).length;
    else if(t.id==='cooling')count=state.coolingOffRegister.length;
    else if(t.id==='complaints')count=state.complaintsRegister.length;
    else if(t.id==='conflict')count=state.conflictRegister.length;
    const cnt=count!==''?`<span class="tcount">${count}</span>`:'';
    return `<button class="${state.active===t.id?'active':''}" onclick="go('${t.id}')">${t.label}${cnt}</button>`
  }).join('');
  updateTierBadge();
  const v=$('#view');
  if(state.ui.wizard){v.innerHTML=renderWizardShell();bindWizard();return}
  if(state.ui.activeClient){v.innerHTML=renderClientDetail();bindClientDetail();return}
  switch(state.active){
    case 'clients':v.innerHTML=renderClients();bindClients();break;
    case 'dashboard':v.innerHTML=renderDashboard();break;
    case 'cooling':v.innerHTML=renderCoolingRegister();break;
    case 'complaints':v.innerHTML=renderComplaintsRegister();break;
    case 'conflict':v.innerHTML=renderConflictRegister();break;
    case 'firm':v.innerHTML=renderFirm();bindFirm();break;
    case 'advisers':v.innerHTML=renderAdvisers();bindAdvisers();break;
    case 'qa':v.innerHTML=renderQA();bindQA();break;
    default:v.innerHTML=renderClients();bindClients();
  }
}
function go(id){state.active=id;state.ui.activeClient=null;state.ui.wizard=null;persistState();render()}
function updateTierBadge(){const t=Cascade.detectTier();const el=$('#tierBadge');if(!el)return;el.textContent=t==='T0'?'T0 · offline':t;el.classList.toggle('t3',t==='T3')}
function disclaimerBanner(){
  return `<div class="disclaimer"><strong>FallClaim</strong> is a tool for UK claims firms (CMC and solicitor practices). It assists with case management, fee tracking, regulated document generation, and FCA CMR / SRA compliance. It is not court filing software; pleadings and submissions remain the firm's responsibility. <strong>Sovereign</strong> — client data never leaves the device unless exported.</div>`
}
// ═══ CLIENTS LIST ═══
function chip(label,active,onclick,cls){return `<button class="chip ${active?'active':''} ${cls||''}" onclick="${onclick()}">${esc(label)}</button>`}
function kycColor(s){return ({pending:'amber',verified:'green',review:'blue',failed:'red'})[s]||'muted'}
function riskColor(s){return ({low:'green',medium:'amber',high:'red'})[s]||'muted'}
function coolStatus(c){
  if(!c.cooling)return{label:'—',cls:'muted'};
  if(c.cooling.waived)return{label:'WAIVED',cls:'blue'};
  if(c.cooling.cancelledAt)return{label:'CANCELLED',cls:'red'};
  if(!c.cooling.offDate)return{label:'not issued',cls:'amber'};
  if(c.cooling.expiresAt&&c.cooling.expiresAt>now())return{label:'IN-PERIOD ('+daysBetween(now(),c.cooling.expiresAt)+'d)',cls:'amber'};
  return{label:'expired',cls:'green'};
}
function setFilter(k,v){state.ui.filter[k]=v;render()}
function clearFilter(){state.ui.filter={kyc:'',risk:'',adviser:'',cooling:'',due:false};render()}
function dismissSetup(){state.settings.setupDismissed=true;persistState();render()}
function needsSetupBanner(){
  if(state.settings.setupDismissed)return'';
  if(state.firm&&state.advisers.length>0)return'';
  return `<div class="banner warn">
    First-run setup is incomplete. <a href="#" onclick="go('firm');return false">Set up your firm record</a> ${state.advisers.length===0?'and <a href="#" onclick="go(\'advisers\');return false">add at least one caseworker</a>':''} for a complete audit trail. <button class="btn sm ghost" style="margin-left:8px" onclick="dismissSetup()">Dismiss</button>
  </div>`
}
function renderClients(){
  const active=state.clients.filter(c=>!c.archivedAt);
  if(state.clients.length===0){
    return `${disclaimerBanner()}${needsSetupBanner()}<div class="empty">
      <div class="big">No claimants yet</div>
      <div class="small">Start onboarding your first claimant to build the FCA CMR record.</div>
      <button class="btn primary" onclick="newClient()">+ Onboard a claimant</button>
    </div>`
  }
  const f=state.ui.filter;
  let list=active.slice();
  if(f.kyc)list=list.filter(c=>c.kyc?.status===f.kyc);
  if(f.risk)list=list.filter(c=>c.kyc?.riskGrade===f.risk);
  if(f.adviser)list=list.filter(c=>c.adviserId===f.adviser);
  if(f.cooling){
    if(f.cooling==='in-period')list=list.filter(c=>c.cooling?.offDate&&c.cooling?.expiresAt&&c.cooling.expiresAt>now()&&!c.cooling.waived&&!c.cooling.cancelledAt);
    if(f.cooling==='waived')list=list.filter(c=>c.cooling?.waived);
    if(f.cooling==='expired')list=list.filter(c=>c.cooling?.expiresAt&&c.cooling.expiresAt<=now()&&!c.cooling.cancelledAt);
    if(f.cooling==='cancelled')list=list.filter(c=>c.cooling?.cancelledAt);
  }
  if(f.due){const n=now();list=list.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue-n<30*86400000)}
  list.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const advisersById=Object.fromEntries(state.advisers.map(a=>[a.id,a]));
  const overdueCount=active.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue-now()<30*86400000).length;
  const inPeriodCount=active.filter(c=>c.cooling?.expiresAt&&c.cooling.expiresAt>now()&&!c.cooling.waived&&!c.cooling.cancelledAt).length;
  return `${disclaimerBanner()}${needsSetupBanner()}
  <div class="section-h"><div><h2>Claimants</h2><div class="sub">${active.length} active · ${inPeriodCount} in cooling-off · ${overdueCount} due for review</div></div>
    <div class="actions"><button class="btn primary" onclick="newClient()">+ new claimant</button></div>
  </div>
  <div class="chip-row">
    ${chip('all',!f.kyc&&!f.risk&&!f.adviser&&!f.due&&!f.cooling,()=>'clearFilter()')}
    ${['pending','verified','review','failed'].map(s=>chip('cdd · '+s,f.kyc===s,()=>`setFilter('kyc','${s}')`,kycColor(s))).join('')}
    ${['low','medium','high'].map(s=>chip('risk · '+s,f.risk===s,()=>`setFilter('risk','${s}')`,riskColor(s))).join('')}
    ${['in-period','waived','expired','cancelled'].map(s=>chip('cool · '+s,f.cooling===s,()=>`setFilter('cooling','${s}')`)).join('')}
    ${state.advisers.filter(a=>!a.archivedAt).map(a=>chip(a.name.split(' ')[0]||'adv',f.adviser===a.id,()=>`setFilter('adviser','${a.id}')`)).join('')}
    ${chip('review due ≤30d',f.due,()=>`setFilter('due',true)`,f.due?'due':'')}
  </div>
  ${list.length===0?'<div class="banner info">No claimants match the current filters.</div>':`
  <div class="card" style="padding:0;overflow:hidden">
  <div style="overflow-x:auto"><table>
    <thead><tr><th>Name</th><th>Claim</th><th>CDD</th><th>Cooling-off</th><th>Risk</th><th>Last review</th><th>Referral</th><th>Handler</th></tr></thead>
    <tbody>
    ${list.map(c=>{
      const cs=coolStatus(c);
      return `<tr class="row-link" onclick="openClient('${c.id}')">
        <td><strong>${esc(c.firstName)} ${esc(c.lastName)}</strong>${c.clientType!=='individual'?` <span class="tag muted">${esc(c.clientType)}</span>`:''}${c.app?.isDemo?' <span class="tag muted">demo</span>':''}</td>
        <td><span class="tag">${esc(c.claimContext?.type||'—')}</span></td>
        <td><span class="tag ${kycColor(c.kyc?.status)}">${esc(c.kyc?.status||'pending')}</span></td>
        <td><span class="tag ${cs.cls}">${esc(cs.label)}</span></td>
        <td><span class="tag ${riskColor(c.kyc?.riskGrade)}">${esc(c.kyc?.riskGrade||'low')}</span></td>
        <td>${c.kyc?.lastReviewAt?esc(fmtDate(c.kyc.lastReviewAt)):'—'}</td>
        <td>${esc(c.referral?.source||'—')}</td>
        <td>${advisersById[c.handlerId||c.adviserId]?esc(advisersById[c.handlerId||c.adviserId].name):'—'}</td>
      </tr>`
    }).join('')}
    </tbody>
  </table></div>
  </div>`}
  ${renderArchivedSection()}`
}
function renderArchivedSection(){
  const arch=state.clients.filter(c=>c.archivedAt);
  if(arch.length===0)return'';
  return `<div class="divider"></div><details class="card" style="padding:14px"><summary style="cursor:pointer;color:var(--cream-dim);font-family:var(--mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Archived (${arch.length}) · FCA CMR 6-yr retention</summary>
    <table style="margin-top:10px"><thead><tr><th>Name</th><th>Archived</th><th></th></tr></thead><tbody>
    ${arch.map(c=>`<tr><td>${esc(c.firstName)} ${esc(c.lastName)}</td><td>${esc(fmtDate(c.archivedAt))}</td><td class="r"><button class="btn sm" onclick="openClient('${c.id}')">view</button></td></tr>`).join('')}
    </tbody></table></details>`
}
function bindClients(){}
// ═══ DASHBOARD ═══
function renderDashboard(){
  const active=state.clients.filter(c=>!c.archivedAt);
  const inPeriod=active.filter(c=>c.cooling?.expiresAt&&c.cooling.expiresAt>now()&&!c.cooling.waived&&!c.cooling.cancelledAt).length;
  const waived=active.filter(c=>c.cooling?.waived).length;
  const cancelled=state.coolingOffRegister.filter(r=>r.kind==='cancelled').length;
  const cddVerified=active.filter(c=>c.kyc?.status==='verified').length;
  const cddPending=active.filter(c=>c.kyc?.status==='pending').length;
  const overdue=active.filter(c=>c.kyc?.nextReviewDue&&c.kyc.nextReviewDue<now()).length;
  const highRisk=active.filter(c=>c.kyc?.riskGrade==='high').length;
  const complaints=state.complaintsRegister.length;
  const fosEsc=state.complaintsRegister.filter(c=>c.fosEscalated).length;
  const conflicts=state.conflictRegister.length;
  const piWithFee=active.filter(c=>c.referral?.feePaid&&['rta','el','pl','clinical-neg','trip'].includes(c.claimContext?.type)).length;
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Dashboard</h2><div class="sub">live FCA CMR + AML position</div></div></div>
  <div class="dash-kpis">
    <div class="dash-kpi"><div class="n">${active.length}</div><div class="l">active claimants</div></div>
    <div class="dash-kpi ${inPeriod>0?'warn':''}"><div class="n">${inPeriod}</div><div class="l">in cooling-off</div></div>
    <div class="dash-kpi"><div class="n">${waived}</div><div class="l">cooling waived</div></div>
    <div class="dash-kpi"><div class="n">${cancelled}</div><div class="l">cancelled in-period</div></div>
    <div class="dash-kpi ok"><div class="n">${cddVerified}</div><div class="l">CDD verified</div></div>
    <div class="dash-kpi warn"><div class="n">${cddPending}</div><div class="l">CDD pending</div></div>
    <div class="dash-kpi due"><div class="n">${overdue}</div><div class="l">review overdue</div></div>
    <div class="dash-kpi ${highRisk>0?'due':''}"><div class="n">${highRisk}</div><div class="l">high-risk</div></div>
    <div class="dash-kpi"><div class="n">${complaints}</div><div class="l">complaints (all-time)</div></div>
    <div class="dash-kpi ${fosEsc>0?'warn':''}"><div class="n">${fosEsc}</div><div class="l">escalated to FOS</div></div>
    <div class="dash-kpi"><div class="n">${conflicts}</div><div class="l">conflict checks run</div></div>
    <div class="dash-kpi ${piWithFee>0?'due':''}"><div class="n">${piWithFee}</div><div class="l">PI + referral fee (LASPO flag)</div></div>
  </div>
  <div class="grid-2">
    <div class="card">
      <h3>Cooling-off pipeline <span class="meta">live</span></h3>
      ${(()=>{const items=active.filter(c=>c.cooling?.expiresAt&&c.cooling.expiresAt>now()&&!c.cooling.waived&&!c.cooling.cancelledAt).sort((a,b)=>a.cooling.expiresAt-b.cooling.expiresAt);return items.length===0?'<div class="hint">No claimants currently in the 14-day cooling-off period.</div>':items.slice(0,8).map(c=>`<div class="cool-row"><div class="cl"><strong>${esc(c.firstName)} ${esc(c.lastName)}</strong> · ${esc(c.claimContext?.type||'')}</div><div class="ct">${daysBetween(now(),c.cooling.expiresAt)}d left · exp ${esc(fmtDate(c.cooling.expiresAt))}</div><button class="btn sm" onclick="openClient('${c.id}')">view</button></div>`).join('')})()}
    </div>
    <div class="card">
      <h3>Recent complaints <span class="meta">${complaints} total</span></h3>
      ${state.complaintsRegister.length===0?'<div class="hint">No complaints recorded.</div>':state.complaintsRegister.slice().sort((a,b)=>b.ts-a.ts).slice(0,6).map(c=>`<div class="cool-row"><div class="cl"><strong>${esc(c.nature||'(no nature)')}</strong> · ${esc(c.complainantName||'—')}</div><div class="ct">${esc(fmtDate(c.ts))} ${c.fosEscalated?'· <span class="tag ox">FOS</span>':''}</div></div>`).join('')}
      <div style="text-align:right;margin-top:8px"><button class="btn sm" onclick="go('complaints')">manage complaints →</button></div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="grid-2">
    <div class="card">
      <h3>Claim mix <span class="meta">active</span></h3>
      ${(()=>{const mix={};active.forEach(c=>{const t=c.claimContext?.type||'other';mix[t]=(mix[t]||0)+1});return Object.entries(mix).length===0?'<div class="hint">—</div>':Object.entries(mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="kpi"><span class="l">${esc(k)}</span><span class="v">${v}</span></div>`).join('')})()}
    </div>
    <div class="card">
      <h3>Fee arrangement mix</h3>
      ${(()=>{const mix={};active.forEach(c=>{const t=c.fees?.arrangement||'cfa';mix[t]=(mix[t]||0)+1});return Object.entries(mix).length===0?'<div class="hint">—</div>':Object.entries(mix).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="kpi"><span class="l">${esc(k.toUpperCase())}</span><span class="v">${v}</span></div>`).join('')})()}
    </div>
  </div>`
}
// ═══ COOLING-OFF REGISTER ═══
function renderCoolingRegister(){
  const reg=state.coolingOffRegister.slice().sort((a,b)=>b.ts-a.ts);
  const clientsById=Object.fromEntries(state.clients.map(c=>[c.id,c]));
  const advisersById=Object.fromEntries(state.advisers.map(a=>[a.id,a]));
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Cooling-off register</h2><div class="sub">FCA CMCOB 4 · ${reg.length} event${reg.length===1?'':'s'} · 6yr retention</div></div>
    <div class="actions"><button class="btn ghost" onclick="exportRegister('cooling')">↓ export</button></div>
  </div>
  <div class="card">
    <p style="color:var(--cream-dim);font-size:12px;margin-bottom:10px">Every cooling-off event under FCA CMR — when issued, when waived, when cancelled, when expired. CMR firms must keep this register for 6 years.</p>
    ${reg.length===0?'<div class="hint" style="text-align:center;padding:30px 0">No cooling-off events yet.</div>':`<div style="overflow-x:auto"><table>
      <thead><tr><th>Date</th><th>Client</th><th>Event</th><th>Expires</th><th>Processed by</th><th>Notes</th></tr></thead>
      <tbody>${reg.map(r=>{const c=clientsById[r.clientId];const a=advisersById[r.processedBy];return `<tr><td>${esc(fmtDateTime(r.ts))}</td><td>${c?`<a href="#" onclick="openClient('${c.id}');return false">${esc(c.firstName)} ${esc(c.lastName)}</a>`:'<em>removed</em>'}</td><td><span class="tag ${r.kind==='cancelled'?'red':(r.kind==='waived'?'blue':(r.kind==='expired'?'green':'amber'))}">${esc(r.kind)}</span></td><td>${r.expiresAt?esc(fmtDate(r.expiresAt)):'—'}</td><td>${a?esc(a.name):esc(r.processedBy||'system')}</td><td style="font-size:11px;color:var(--cream-dim)">${esc(r.notes||r.waiverReason||r.cancellationReason||'')}</td></tr>`}).join('')}</tbody></table></div>`}
  </div>`
}
// ═══ COMPLAINTS REGISTER ═══
function renderComplaintsRegister(){
  const reg=state.complaintsRegister.slice().sort((a,b)=>b.ts-a.ts);
  const clientsById=Object.fromEntries(state.clients.map(c=>[c.id,c]));
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Complaints register</h2><div class="sub">FCA DISP / SRA · ${reg.length} complaint${reg.length===1?'':'s'} · ${reg.filter(c=>c.fosEscalated).length} FOS-escalated</div></div>
    <div class="actions"><button class="btn primary" onclick="newComplaint()">+ record complaint</button><button class="btn ghost" onclick="exportRegister('complaints')">↓ export</button></div>
  </div>
  <div class="card">
    <p style="color:var(--cream-dim);font-size:12px;margin-bottom:10px">Every complaint received — nature, resolution, FOS/LeO escalation, learning. DISP 1 requires acknowledgement within 48h (good practice) and substantive final response within 8 weeks.</p>
    ${reg.length===0?'<div class="hint" style="text-align:center;padding:30px 0">No complaints recorded.<br><br><button class="btn primary" onclick="newComplaint()">+ record first complaint</button></div>':`<div style="overflow-x:auto"><table>
      <thead><tr><th>Date</th><th>Client</th><th>Complainant</th><th>Nature</th><th>Status</th><th>FOS</th><th></th></tr></thead>
      <tbody>${reg.map(r=>{const c=clientsById[r.clientId];return `<tr><td>${esc(fmtDate(r.ts))}</td><td>${c?`<a href="#" onclick="openClient('${c.id}');return false">${esc(c.firstName)} ${esc(c.lastName)}</a>`:'<em>—</em>'}</td><td>${esc(r.complainantName||'—')}</td><td style="max-width:240px;font-size:12px">${esc(r.nature||'')}</td><td><span class="tag ${r.resolvedAt?'green':'amber'}">${r.resolvedAt?'resolved':'open'}</span></td><td>${r.fosEscalated?'<span class="tag ox">YES</span>':'no'}</td><td class="r"><button class="btn sm" onclick="editComplaint('${r.id}')">edit</button></td></tr>`}).join('')}</tbody></table></div>`}
  </div>`
}
// ═══ CONFLICT REGISTER ═══
function renderConflictRegister(){
  const reg=state.conflictRegister.slice().sort((a,b)=>b.ts-a.ts);
  const clientsById=Object.fromEntries(state.clients.map(c=>[c.id,c]));
  return `${disclaimerBanner()}
  <div class="section-h"><div><h2>Conflict-check register</h2><div class="sub">SRA Code 6 / CMCOB · ${reg.length} check${reg.length===1?'':'s'}</div></div>
    <div class="actions"><button class="btn ghost" onclick="exportRegister('conflict')">↓ export</button></div>
  </div>
  <div class="card">
    <p style="color:var(--cream-dim);font-size:12px;margin-bottom:10px">Every conflict check performed at intake — local IDB scan + cross-tool broadcast on <code>fall-claim</code> mesh. Hits, resolution, clear/blocked.</p>
    ${reg.length===0?'<div class="hint" style="text-align:center;padding:30px 0">No conflict checks yet.</div>':`<div style="overflow-x:auto"><table>
      <thead><tr><th>Date</th><th>Subject</th><th>Local hits</th><th>Mesh hits</th><th>Clear?</th><th>Resolution</th></tr></thead>
      <tbody>${reg.map(r=>{const c=clientsById[r.clientId];return `<tr><td>${esc(fmtDateTime(r.ts))}</td><td>${c?esc(c.firstName+' '+c.lastName):'<em>(awaiting commit)</em>'}</td><td>${r.hitsLocal.length}</td><td>${r.hitsMesh.length}</td><td><span class="tag ${r.clear?'green':'red'}">${r.clear?'CLEAR':'HITS'}</span></td><td style="font-size:11px;color:var(--cream-dim)">${esc(r.resolution||'—')}</td></tr>`}).join('')}</tbody></table></div>`}
  </div>`
}
async function exportRegister(kind){
  const data=kind==='cooling'?state.coolingOffRegister:(kind==='complaints'?state.complaintsRegister:state.conflictRegister);
  const blob=new Blob([JSON.stringify({meta:{tool:TOOLNAME,version:VERSION,register:kind,exportedAt:now(),count:data.length},entries:data},null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`fallclaimonboard-${kind}-${fmtDateISO(now())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
  toast(kind+' register exported');
}

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { VERSION };
