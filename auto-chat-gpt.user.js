// ==UserScript==
// @name         Auto Chat GPT
// @namespace    https://github.com/unisocsu/auto-chat-gpt
// @version      0.1.0
// @description  Automatically sends "תמשיך" after completed ChatGPT responses, and stops when "דרושה הנחייה" is the final line.
// @author       unisocsu
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  if (window.__AUTO_CHAT_GPT_RUNNING__) return;
  window.__AUTO_CHAT_GPT_RUNNING__ = true;

  const CONFIG = {
    continueText: "תמשיך",
    manualMarker: "דרושה הנחייה",
    pollMs: 1200,
    settleMs: 2200,
    notificationTitle: "ChatGPT ממתין להנחיה",
    testSendOnStartup: true,
  };

  let lastAssistantText = "";
  let lastProcessedText = "";
  let lastChangeAt = Date.now();
  let waitingForManualInput = false;

  const normalize = (text) =>
    (text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();

  function getAssistantMessages() {
    return [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  }

  function getLastAssistantText() {
    const messages = getAssistantMessages();
    return messages.length
      ? normalize(messages[messages.length - 1].innerText)
      : "";
  }

  function isGenerating() {
    return !!document.querySelector(
      'button[aria-label*="Stop"], button[data-testid*="stop"], button[aria-label*="עצור"]'
    );
  }

  function findComposer() {
    return document.querySelector(
      '#prompt-textarea, textarea[placeholder], div[contenteditable="true"][data-placeholder]'
    );
  }

  function findSendButton() {
    return document.querySelector(
      'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="שלח"]'
    );
  }

  function setComposerText(text) {
    const composer = findComposer();
    if (!composer) return false;

    composer.focus();

    if (composer.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      composer.textContent = text;
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        })
      );
    }

    return true;
  }

  async function sendContinue() {
    if (!setComposerText(CONFIG.continueText)) return false;

    await new Promise((resolve) => setTimeout(resolve, 150));

    const send = findSendButton();
    if (send && !send.disabled) {
      send.click();
      return true;
    }

    const composer = findComposer();
    if (composer) {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true
        })
      );
      return true;
    }

    return false;
  }

  function notifyManualRequired() {
    waitingForManualInput = true;
    const message = "ChatGPT ממתין להנחיה בכרטיסייה הזו.";

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(CONFIG.notificationTitle, { body: message });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            new Notification(CONFIG.notificationTitle, { body: message });
          }
        }).catch(() => {});
      }
    }

    document.title = "🔔 דרושה הנחייה — ChatGPT";
    console.warn("[AutoChatGPT]", message);
  }

  function process() {
    const text = getLastAssistantText();
    if (!text) return;

    if (text !== lastAssistantText) {
      lastAssistantText = text;
      lastChangeAt = Date.now();
      waitingForManualInput = false;
      document.title = "ChatGPT";
      return;
    }

    if (waitingForManualInput || isGenerating()) return;
    if (Date.now() - lastChangeAt < CONFIG.settleMs) return;
    if (text === lastProcessedText) return;

    lastProcessedText = text;

    if (text.endsWith(CONFIG.manualMarker)) {
      notifyManualRequired();
      return;
    }

    sendContinue().then((sent) => {
      if (!sent) {
        lastProcessedText = "";
        console.warn("[AutoChatGPT] Could not send continue; will retry.");
      } else {
        console.log("[AutoChatGPT] Sent:", CONFIG.continueText);
      }
    });
  }

  setInterval(process, CONFIG.pollMs);

  // One-time startup test: send "תמשיך" once after the page is ready.
  if (CONFIG.testSendOnStartup) {
    setTimeout(async () => {
      const sent = await sendContinue();
      console.log(
        sent
          ? "[AutoChatGPT] Startup test: sent \"תמשיך\" once."
          : "[AutoChatGPT] Startup test: composer not ready."
      );
    }, 3000);
  }

  console.log("[AutoChatGPT] Running.");
})();