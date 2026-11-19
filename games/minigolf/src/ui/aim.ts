/** Drawn aim-line length at full power, in course units. */
export const AIM_LINE_LENGTH = 120;
/** Shortest drawn aim line, so direction stays readable at low power. */
export const AIM_LINE_MIN_LENGTH = 32;

/**
 * Display length of the tapered aim line. Only the drawing grows to the
 * minimum; the shot's real power and angle are unchanged.
 */
export const aimLineLength = (power: number): number =>
  Math.max(power * AIM_LINE_LENGTH, AIM_LINE_MIN_LENGTH);
