const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const POKI_HOSTS = ["poki.com", "poki-gdn.com", "poki.dev"];
const SDK_URL = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";

class PokiPlatform {
  constructor() {
    this.local = LOCAL_HOSTS.has(location.hostname);
    this.enabled = !this.local && POKI_HOSTS.some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`));
    this.initialized = false;
    this.playing = false;
    this.adActive = false;
    this.onAdStateChange = () => {};
  }

  async initialize() {
    if (!this.enabled) return false;
    try {
      await this.loadSdk();
      await window.PokiSDK.init();
      this.initialized = true;
      return true;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  loadingComplete() {
    this.call("gameLoadingFinished");
  }

  gameplayStart() {
    if (this.playing) return;
    this.playing = true;
    this.call("gameplayStart");
  }

  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    this.call("gameplayStop");
  }

  async commercialBreak() {
    if (!this.initialized || this.local || typeof window.PokiSDK?.commercialBreak !== "function") return false;
    this.setAdActive(true);
    try {
      await window.PokiSDK.commercialBreak(() => this.setAdActive(true));
      return true;
    } catch {
      return false;
    } finally {
      this.setAdActive(false);
    }
  }

  async rewardedBreak(options = {}) {
    if (!this.initialized || this.local || typeof window.PokiSDK?.rewardedBreak !== "function") return false;
    this.setAdActive(true);
    try {
      return Boolean(await window.PokiSDK.rewardedBreak({ ...options, onStart: () => this.setAdActive(true) }));
    } catch {
      return false;
    } finally {
      this.setAdActive(false);
    }
  }

  setAdActive(active) {
    if (this.adActive === active) return;
    this.adActive = active;
    this.onAdStateChange(active);
  }

  call(method) {
    if (!this.initialized || typeof window.PokiSDK?.[method] !== "function") return;
    try {
      window.PokiSDK[method]();
    } catch {
      // Platform events must never block local gameplay.
    }
  }

  loadSdk() {
    if (window.PokiSDK) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SDK_URL}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
}

export const poki = new PokiPlatform();
