// Machine PM schedule rules (used by the web app and the daily server check).
//  • Weekly: the next PM is due N days (default 7) after the last PM of ANY type.
//  • Monthly: a monthly PM must be done once every M months (default 1) after the last monthly.
//  • Whichever comes first is the next PM due; if the monthly is due by then, the next PM is a monthly.
import type { Machine, PmLog } from './types';

export const DEFAULT_WEEKLY_DAYS = 7;
export const DEFAULT_MONTHLY_MONTHS = 1;

/** Parse 'YYYY-MM-DD' as a local calendar date (noon avoids DST edge cases). */
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}
export function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(s: string, n: number): string {
  const d = parseDay(s); d.setDate(d.getDate() + n); return fmtDay(d);
}
/** Calendar months; clamps to the end of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(s: string, n: number): string {
  const d = parseDay(s);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmtDay(d);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export type PmStatus = 'overdue' | 'today' | 'soon' | 'ok' | 'never';
export interface MachinePmState {
  machine: string;
  lastAny?: PmLog;
  lastMonthly?: PmLog;
  nextWeekly?: string; // next PM of any type
  nextMonthly?: string;
  nextDue?: string; // earliest of the two
  nextType: 'weekly' | 'monthly';
  daysLeft: number | null; // negative = overdue
  status: PmStatus;
  weeklyDays: number;
  monthlyMonths: number;
}

const newestFirst = (a: PmLog, b: PmLog) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

export function machinePmState(machine: Pick<Machine, 'name' | 'pmWeeklyDays' | 'pmMonthlyMonths'>, logs: PmLog[], today: string): MachinePmState {
  const weeklyDays = machine.pmWeeklyDays || DEFAULT_WEEKLY_DAYS;
  const monthlyMonths = machine.pmMonthlyMonths || DEFAULT_MONTHLY_MONTHS;
  const mine = logs.filter((l) => l.machine === machine.name).sort(newestFirst);
  const lastAny = mine[0];
  const lastMonthly = mine.find((l) => l.type === 'monthly');
  // a "next due" typed on the latest entry overrides the automatic weekly date
  const nextWeekly = lastAny ? lastAny.nextDue || addDays(lastAny.date, weeklyDays) : undefined;
  const nextMonthly = lastMonthly ? addMonths(lastMonthly.date, monthlyMonths) : undefined;
  if (!lastAny) {
    return { machine: machine.name, nextType: 'monthly', daysLeft: null, status: 'never', weeklyDays, monthlyMonths };
  }
  // no monthly ever done -> the monthly is due now
  const monthlyDue = nextMonthly ?? today;
  const monthlyFirst = monthlyDue <= nextWeekly!;
  const nextDue = monthlyFirst ? monthlyDue : nextWeekly!;
  const daysLeft = daysBetween(today, nextDue);
  const status: PmStatus = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= 2 ? 'soon' : 'ok';
  return { machine: machine.name, lastAny, lastMonthly, nextWeekly, nextMonthly: monthlyDue, nextDue, nextType: monthlyFirst ? 'monthly' : 'weekly', daysLeft, status, weeklyDays, monthlyMonths };
}

/** Suggested "next PM due" for a new entry (what the log form pre-fills). */
export function suggestNextDue(machine: Pick<Machine, 'name' | 'pmWeeklyDays' | 'pmMonthlyMonths'>, logs: PmLog[], entry: Pick<PmLog, 'date' | 'type' | 'id'>): string {
  const weeklyDays = machine.pmWeeklyDays || DEFAULT_WEEKLY_DAYS;
  const monthlyMonths = machine.pmMonthlyMonths || DEFAULT_MONTHLY_MONTHS;
  const weekly = addDays(entry.date, weeklyDays);
  const prevMonthly = entry.type === 'monthly' ? entry : logs.filter((l) => l.machine === machine.name && l.type === 'monthly' && l.id !== entry.id).sort(newestFirst)[0];
  if (!prevMonthly) return weekly;
  const monthly = addMonths(prevMonthly.date, monthlyMonths);
  return monthly < weekly ? monthly : weekly;
}
