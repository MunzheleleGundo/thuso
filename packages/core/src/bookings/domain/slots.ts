import { MINUTE } from "../../shared/time";

/**
 * Double-booking prevention.
 *
 * Every booking claims one "slot lock" document per 15-minute block it touches,
 * id = `${staffId}_${blockStartMs}`. Locks can only be created, never overwritten,
 * so two bookings that share any block cannot both be committed. This holds for
 * bookings made in the app (even ones queued offline) and on the public page,
 * because both write the same lock documents in the same atomic batch or transaction.
 */
export const LOCK_BLOCK_MINUTES = 15;
const BLOCK = LOCK_BLOCK_MINUTES * MINUTE;

export function lockBlocks(startAt: number, endAt: number): number[] {
  const first = Math.floor(startAt / BLOCK) * BLOCK;
  const out: number[] = [];
  for (let t = first; t < endAt; t += BLOCK) out.push(t);
  return out;
}

export const lockId = (staffId: string, block: number) => `${staffId}_${block}`;
