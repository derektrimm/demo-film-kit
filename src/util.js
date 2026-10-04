// Easing and timing helpers for the caption page.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
// 0 before a, 1 after b, linear between.
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
// A window: fades in over fi seconds from a, out over fo seconds before b.
export const win = (t, a, b, fi = 0.35, fo = 0.35) => Math.min(smooth((t - a) / fi), smooth((b - t) / fo));
// A key press: 0 at rest, 1 bottomed out at time p, back up over `up` seconds.
export function press(t, p, down = 0.09, up = 0.22) {
  const d = t - p;
  if (d > -down && d < 0) return easeOut((d + down) / down);
  if (d >= 0 && d < up) return 1 - smooth(d / up);
  return 0;
}
