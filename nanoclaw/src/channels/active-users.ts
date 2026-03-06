/**
 * Track active userIds seen from incoming Redis messages.
 * Used by context-compiler to know which users to compile for,
 * instead of relying on the static config.userId.
 */

const activeUsers = new Map<string, number>(); // userId → last seen timestamp
const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/** Record that a user was seen (call from exec-handler, frames-consumer, media-consumer). */
export function trackUser(userId: string): void {
  activeUsers.set(userId, Date.now());
}

/** Get all recently-active userIds (within expiry window). */
export function getActiveUserIds(): string[] {
  const now = Date.now();
  const result: string[] = [];
  for (const [uid, lastSeen] of activeUsers) {
    if (now - lastSeen <= EXPIRY_MS) {
      result.push(uid);
    } else {
      activeUsers.delete(uid);
    }
  }
  return result;
}
