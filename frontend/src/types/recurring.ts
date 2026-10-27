import type { HardLogoutScope } from "./wizyfi";

export interface RecurringReset {
  id: string;
  place: string;
  scopeType: HardLogoutScope;
  routerIds: string[];
  /** "HH:MM:SS" wall-clock time in `timezone`. */
  timeOfDay: string;
  /** 0 = Monday … 6 = Sunday; empty = every day. */
  weekdays: number[];
  timezone: string;
  isActive: boolean;
  /** Earliest still-scheduled occurrence, or null (paused / none yet). */
  nextOccurrence: string | null;
  createdAt: string;
}

export interface RecurringResetInput {
  place: string;
  scopeType: HardLogoutScope;
  routerIds: string[];
  timeOfDay: string; // "HH:MM"
  weekdays: number[];
}
