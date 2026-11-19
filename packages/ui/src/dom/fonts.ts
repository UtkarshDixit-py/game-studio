import { getUiFontFamily, setUiFontFamily, uiTokens } from '../tokens';

export interface FontLoadResult {
  family: string;
  loaded: boolean;
}

const WEIGHTS = [400, 600, 700, 800] as const;

/**
 * Waits for the four UI weights with one total deadline. The family chosen
 * here is fixed for the whole page session: Phaser rasterises text once, so a
 * late webfont must never move it.
 */
export const loadUiFonts = async (timeoutMs = 1200): Promise<FontLoadResult> => {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    setUiFontFamily(uiTokens.font.fallback);
    return { family: uiTokens.font.fallback, loaded: false };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('font timeout')), timeoutMs);
    });
    await Promise.race([
      Promise.all(WEIGHTS.map((weight) => document.fonts.load(`${weight} 24px "Nunito Sans"`))),
      deadline,
    ]);
    const loaded = document.fonts.check('400 24px "Nunito Sans"');
    const family = loaded ? uiTokens.font.family : uiTokens.font.fallback;
    setUiFontFamily(family);
    return { family, loaded };
  } catch {
    setUiFontFamily(uiTokens.font.fallback);
    return { family: uiTokens.font.fallback, loaded: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/** The family selected for this session. */
export const selectedFontFamily = (): string => getUiFontFamily();
