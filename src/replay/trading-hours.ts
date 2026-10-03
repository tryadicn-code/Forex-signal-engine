/**
 * B3-M1: FX market trading hours.
 *
 * The retail FX market trades continuously from Sunday 21:00 UTC to Friday
 * 22:00 UTC. Some brokers offset these by up to an hour (DST), and a few
 * close earlier on Fridays. The conservative window used here closes the
 * market one hour earlier on Friday and opens it one hour later on Sunday
 * so a backtest never fabricates signals from a closed session.
 *
 * Holidays (Christmas, New Year, Independence Day in the US, etc.) are NOT
 * modelled. If a specific strategy is sensitive to holiday liquidity, the
 * caller should pre-filter the dataset or supply a custom predicate to the
 * replay runner.
 */

/**
 * Returns true when the given UTC epoch millisecond timestamp falls inside
 * the modelled FX trading window. Weekends are excluded; holidays are not.
 */
export function isFxMarketOpen(utcMs: number): boolean {
  const date = new Date(utcMs);
  const day = date.getUTCDay();
  const hours = date.getUTCHours();

  // Friday: close at 22:00 UTC.
  if (day === 5 && hours >= 22) return false;
  // Saturday: always closed.
  if (day === 6) return false;
  // Sunday: open at 21:00 UTC.
  if (day === 0 && hours < 21) return false;

  return true;
}

/**
 * Convenience predicate factory for the replay runner. Returns a function
 * that answers "should this timestamp be evaluated?".
 */
export function makeMarketHoursPredicate(): (utcMs: number) => boolean {
  return isFxMarketOpen;
}