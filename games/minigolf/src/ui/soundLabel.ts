/** Accessible name for the mute toggle, derived from the saved mute flag. */
export const soundActionLabel = (muted: boolean): string =>
  muted ? 'Sound off. Enable sound' : 'Sound on. Mute sound';
