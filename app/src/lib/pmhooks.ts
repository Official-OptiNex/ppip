import { useMemo } from 'react';
import { machinePmState, fmtDay, type MachinePmState } from '../../../shared/pm';
import { useStore } from './store';
import { useNow } from './util';

export function useToday() {
  const now = useNow(60_000);
  return fmtDay(new Date(now));
}

/** PM state of every machine that has PM tracking turned on, soonest due first. */
export function usePmStates(): MachinePmState[] {
  const machines = useStore((s) => s.docs.machines);
  const pms = useStore((s) => s.docs.pms);
  const today = useToday();
  return useMemo(() => {
    const logs = Object.values(pms);
    const order = { never: 0, overdue: 1, today: 2, soon: 3, ok: 4 } as const;
    return Object.values(machines).filter((m) => m.pmTracked)
      .map((m) => machinePmState(m, logs, today))
      .sort((a, b) => order[a.status] - order[b.status] || (a.nextDue || '').localeCompare(b.nextDue || '') || a.machine.localeCompare(b.machine, undefined, { numeric: true }));
  }, [machines, pms, today]);
}

export function pmDueCount(states: MachinePmState[]) {
  return states.filter((s) => s.status === 'overdue' || s.status === 'today' || s.status === 'never').length;
}
