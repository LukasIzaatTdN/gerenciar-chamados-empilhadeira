import { useCallback, useRef } from "react";

type SoundType = "info" | "success" | "urgent" | "alert";

/**
 * Generates notification sounds using the Web Audio API.
 * No external files needed — pure synthesis.
 */
export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (frequency: number, duration: number, delay: number, type: OscillatorType = "sine", volume = 0.3) => {
      try {
        const ctx = getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
        gain.gain.setValueAtTime(volume, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      } catch {
        // Audio not available
      }
    },
    [getCtx]
  );

  const play = useCallback(
    (soundType: SoundType) => {
      // Throttle: don't play more than once per 500ms
      const now = Date.now();
      if (now - lastPlayedRef.current < 500) return;
      lastPlayedRef.current = now;

      switch (soundType) {
        case "info":
          // Pleasant two-tone chime
          playTone(523.25, 0.15, 0, "sine", 0.25); // C5
          playTone(659.25, 0.2, 0.12, "sine", 0.25); // E5
          break;

        case "success":
          // Ascending three-note success
          playTone(523.25, 0.12, 0, "sine", 0.2); // C5
          playTone(659.25, 0.12, 0.1, "sine", 0.2); // E5
          playTone(783.99, 0.25, 0.2, "sine", 0.2); // G5
          break;

        case "urgent":
          // Rapid alarm-like beeps
          playTone(880, 0.1, 0, "square", 0.15); // A5
          playTone(880, 0.1, 0.15, "square", 0.15);
          playTone(1046.5, 0.2, 0.3, "square", 0.18); // C6
          playTone(880, 0.1, 0.5, "square", 0.15);
          playTone(1046.5, 0.25, 0.65, "square", 0.18);
          break;

        case "alert":
          // Soft two-tone attention getter
          playTone(440, 0.15, 0, "triangle", 0.2); // A4
          playTone(554.37, 0.2, 0.13, "triangle", 0.25); // C#5
          playTone(659.25, 0.15, 0.28, "triangle", 0.2); // E5
          break;
      }
    },
    [playTone]
  );

  return { play };
}
