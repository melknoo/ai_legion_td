/**
 * Getting back into a running online game after a reload: the reconnection token of the current
 * room lives in sessionStorage (per tab, survives reloads). The server holds a dropped seat for 60 s.
 */
const KEY = 'legion.rejoin';

export function saveRejoin(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Storage may be unavailable (private mode); a reload then just can't rejoin.
  }
}

/** The stored token if it belongs to `roomId` (tokens read "roomId:secret"). */
export function rejoinToken(roomId: string): string | null {
  try {
    const token = sessionStorage.getItem(KEY);
    return token?.startsWith(`${roomId}:`) ? token : null;
  } catch {
    return null;
  }
}

export function clearRejoin(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored then either.
  }
}
