import type { Band } from "./palette";

/**
 * 無白の環境音(Web Audio・完全に手続き生成、音声ファイルなし)。
 * - ルームトーン: ローパスしたノイズの低いうねり
 * - 砂のせせらぎ: バンドパスノイズの粒立ち。ズームで近づくほど明瞭に
 * - 時間帯で音色が移ろう(夜は暗く沈み、昼はわずかに明るい)
 * ブラウザの自動再生制限のため、最初のユーザー操作で静かに立ち上がる。
 */

export type SoundHandle = {
  setMuted: (m: boolean) => void;
  destroy: () => void;
};

export function createSound(opts: {
  getBand: () => Band;
  getZoom: () => number;
  initiallyMuted: boolean;
}): SoundHandle {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let baseFilter: BiquadFilterNode | null = null;
  let trickleFilter: BiquadFilterNode | null = null;
  let trickleGain: GainNode | null = null;
  let muted = opts.initiallyMuted;
  let destroyed = false;
  let tuner: ReturnType<typeof setInterval> | null = null;

  function noiseSource(c: AudioContext): AudioBufferSourceNode {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function build() {
    if (ctx || destroyed) return;
    try {
      const c = new AudioContext();
      ctx = c;
      master = c.createGain();
      master.gain.value = 0;
      master.connect(c.destination);

      /* ルームトーン */
      const base = noiseSource(c);
      baseFilter = c.createBiquadFilter();
      baseFilter.type = "lowpass";
      baseFilter.frequency.value = 200;
      const baseGain = c.createGain();
      baseGain.gain.value = 0.05;
      base.connect(baseFilter).connect(baseGain).connect(master);
      base.start();

      /* 砂のせせらぎ */
      const trickle = noiseSource(c);
      trickleFilter = c.createBiquadFilter();
      trickleFilter.type = "bandpass";
      trickleFilter.frequency.value = 3200;
      trickleFilter.Q.value = 1.1;
      trickleGain = c.createGain();
      trickleGain.gain.value = 0.008;
      trickle.connect(trickleFilter).connect(trickleGain).connect(master);
      trickle.start();

      if (!muted) {
        master.gain.linearRampToValueAtTime(1, c.currentTime + 4);
      }

      /* 時間帯・ズーム・粒立ちの揺らぎ */
      tuner = setInterval(() => {
        if (!ctx || !baseFilter || !trickleFilter || !trickleGain) return;
        const dark = opts.getBand() === "night" || opts.getBand() === "dusk";
        const z = Math.min(8, Math.max(0.5, opts.getZoom()));
        const near = Math.min(1, z / 4);
        const t = ctx.currentTime;
        baseFilter.frequency.linearRampToValueAtTime(dark ? 170 : 240, t + 0.4);
        trickleFilter.frequency.linearRampToValueAtTime(
          (dark ? 2700 : 3600) + near * 900,
          t + 0.4,
        );
        const flutter = 0.7 + Math.random() * 0.6;
        trickleGain.gain.linearRampToValueAtTime(
          (0.005 + near * 0.014) * flutter * (dark ? 0.85 : 1),
          t + 0.4,
        );
      }, 450);
    } catch {
      ctx = null;
    }
  }

  /* 最初の操作で立ち上げる(自動再生制限対応) */
  const boot = () => {
    if (!muted) build();
    if (ctx) removeBootListeners();
  };
  const bootEvents: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel"];
  function removeBootListeners() {
    for (const ev of bootEvents) window.removeEventListener(ev, boot);
  }
  for (const ev of bootEvents) window.addEventListener(ev, boot);

  return {
    setMuted(m: boolean) {
      muted = m;
      if (!m && !ctx) build(); /* ボタン押下=ユーザー操作の文脈で生成できる */
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(m ? 0 : 1, t + 0.8);
      }
    },
    destroy() {
      destroyed = true;
      removeBootListeners();
      if (tuner) clearInterval(tuner);
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
