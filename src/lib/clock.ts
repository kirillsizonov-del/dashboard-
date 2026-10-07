/**
 * Единые часы приложения: отметки, круги, таймер и «сегодня» берут время отсюда.
 * Для проверок время можно сдвинуть: window.__TRAFIC_NOW__ = сдвиг в мс от настоящего времени.
 * Можно и подменить Date.now целиком. После сдвига экран пересчитается на следующей секунде
 * или сразу по событию visibilitychange.
 */
export function now(): number {
  const shift = typeof window === "undefined" ? 0 : Number((window as { __TRAFIC_NOW__?: unknown }).__TRAFIC_NOW__) || 0;
  return Date.now() + shift;
}
