let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

function beep(
  freq: number,
  startAfter: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
) {
  const ac = getCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ac.currentTime + startAfter;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // 音が鳴らなくてもゲームは続行できる
  }
}

export function playCorrect() {
  beep(660, 0, 0.15);
  beep(880, 0.12, 0.25);
}

export function playWrong() {
  beep(220, 0, 0.25, "square", 0.08);
}

export function playPop() {
  beep(520, 0, 0.08, "triangle", 0.2);
}

export function playWin() {
  [523, 659, 784, 1047].forEach((f, i) => beep(f, i * 0.15, 0.3));
}
