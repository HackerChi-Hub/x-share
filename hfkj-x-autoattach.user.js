// ==UserScript==
// @name         黑粉科技 · X 一键带图直发（自动挂载配图）
// @namespace    https://hackerchi-hub.github.io/x-share/
// @version      1.0.0
// @description  从 x-share 直发台跳转到 X 发帖框后，自动把本期高清配图挂载进编辑框（无需 ⌘V），只需人工点「发帖」。
// @author       HackerChi
// @match        https://hackerchi-hub.github.io/x-share/*
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      hackerchi-hub.github.io
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @downloadURL  https://hackerchi-hub.github.io/x-share/hfkj-x-autoattach.user.js
// @updateURL    https://hackerchi-hub.github.io/x-share/hfkj-x-autoattach.user.js
// ==/UserScript==

(function () {
  "use strict";

  const PENDING_KEY = "hfkj_x_pending_media";
  const PENDING_TTL_MS = 5 * 60 * 1000;
  const VERSION = "1.0.0";

  // ---------- 1) x-share 直发台：声明已安装 + 接收待挂载配图 ----------
  if (location.hostname === "hackerchi-hub.github.io") {
    const markInstalled = () => {
      // document-start 时 documentElement 可能尚未创建，稍后重试
      if (!document.documentElement) return setTimeout(markInstalled, 5);
      document.documentElement.setAttribute("data-hfkj-autoattach", VERSION);
    };
    markInstalled();
    document.addEventListener("DOMContentLoaded", markInstalled);

    document.addEventListener("hfkj-xshare-queue", (ev) => {
      try {
        const raw = typeof ev.detail === "string" ? ev.detail : JSON.stringify(ev.detail || {});
        const payload = JSON.parse(raw);
        const urls = (payload.imageUrls || []).filter((u) => /^https:\/\//i.test(String(u)));
        if (!urls.length) return;
        GM_setValue(PENDING_KEY, {
          imageUrls: urls,
          fileName: String(payload.fileName || "hyphentech-x-card.png"),
          text: String(payload.text || ""),
          ts: Date.now(),
        });
        document.documentElement.setAttribute("data-hfkj-queued", String(Date.now()));
      } catch (e) {
        console.warn("[hfkj-x] queue failed", e);
      }
    });
    return;
  }

  // ---------- 2) x.com 发帖框：自动挂载配图 ----------
  const isComposePath = () => /^\/(intent\/(post|tweet)|compose\/(post|tweet))/i.test(location.pathname);

  function toast(msg, ok) {
    const show = () => {
      const el = document.createElement("div");
      el.textContent = msg;
      el.style.cssText =
        "position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);" +
        "padding:10px 18px;border-radius:999px;font:600 14px/1.4 -apple-system,PingFang SC,sans-serif;" +
        "box-shadow:0 8px 28px rgba(0,0,0,.35);color:#fff;background:" + (ok ? "#0f9d58" : "#d97706");
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    };
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show);
  }

  function fetchBlob(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(),
        responseType: "blob",
        timeout: 20000,
        onload: (r) => {
          if (r.status >= 200 && r.status < 300 && r.response && r.response.size > 1024) resolve(r.response);
          else reject(new Error("HTTP " + r.status));
        },
        onerror: () => reject(new Error("network")),
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  async function loadFirstImage(urls, fileName) {
    for (const u of urls) {
      try {
        const blob = await fetchBlob(u);
        const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
        return new File([blob], fileName || "hyphentech-x-card.png", { type, lastModified: Date.now() });
      } catch (e) {
        console.warn("[hfkj-x] image fetch failed", u, e);
      }
    }
    return null;
  }

  function waitFor(selector, timeoutMs) {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }

  const hasAttachedMedia = () =>
    !!document.querySelector('[data-testid="attachments"] img, [data-testid="attachments"] [role="img"]');

  function attachViaInput(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function attachViaPaste(editor, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    editor.focus();
    const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
    editor.dispatchEvent(ev);
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runAttach() {
    if (!isComposePath()) return;
    const pending = GM_getValue(PENDING_KEY, null);
    if (!pending || !pending.ts || Date.now() - pending.ts > PENDING_TTL_MS) return;
    // 立即消费，防止重复挂载到之后的其他发帖
    GM_deleteValue(PENDING_KEY);

    const file = await loadFirstImage(pending.imageUrls || [], pending.fileName);
    if (!file) {
      toast("⚠️ 黑粉直发：配图下载失败，请回直发台点「下载配图」后拖入", false);
      return;
    }

    const input = await waitFor('input[data-testid="fileInput"]', 25000);
    if (input) {
      attachViaInput(input, file);
      for (let i = 0; i < 16 && !hasAttachedMedia(); i++) await sleep(250);
      if (hasAttachedMedia()) {
        toast("✅ 黑粉直发：高清配图已自动挂载，确认后点「发帖」即可", true);
        return;
      }
    }

    const editor = await waitFor('[data-testid="tweetTextarea_0"]', 8000);
    if (editor) {
      attachViaPaste(editor, file);
      for (let i = 0; i < 16 && !hasAttachedMedia(); i++) await sleep(250);
      if (hasAttachedMedia()) {
        toast("✅ 黑粉直发：高清配图已自动挂载，确认后点「发帖」即可", true);
        return;
      }
    }
    toast("⚠️ 黑粉直发：未能自动挂图，请回直发台点「下载配图」后拖入", false);
  }

  let lastPath = "";
  const tick = () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      runAttach().catch((e) => console.warn("[hfkj-x] attach failed", e));
    }
  };
  tick();
  // X 是单页应用，intent 可能在内部路由切换后才渲染编辑框
  setInterval(tick, 800);
})();
