// Sample data so the app can be tried out before real parts are entered (Admin → System → Load demo data).
import { REMOVAL_REASONS, type CrushedCore, type DocKind, type Downtime, type Equipment, type Machine, type Part, type PmLog, type Stint, type Vendor, type Welder, type ShiftNote, type Announcement } from '../shared/types';
import { addDays, addMonths, fmtDay } from '../shared/pm';

const DAY = 86_400_000;

export function demoData() {
  // deterministic pseudo random
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();
  const people = ['Nick', 'Dave', 'Frank', 'Maria', 'Tom'];

  const machines: Machine[] = ['Bag Machine 1', 'Bag Machine 2', 'Bag Machine 3', 'Bag Machine 4', 'Extruder A', 'Extruder B', 'Printer 1', 'Winder 2']
    .map((name, i) => ({ id: `demo-m${i}`, name, area: i < 4 ? 'Converting' : i < 6 ? 'Extrusion' : 'Printing', pmTracked: i < 6 }));

  const shifts = ['1st shift (days)', '2nd shift (afternoons)', '3rd shift (nights)'];
  const mechanics = people.map((name, i) => ({ id: `demo-mech-${i}`, name, shift: shifts[i % 3] }));

  // ~2 months of machine PMs (one machine left overdue, one due today)
  const pms: PmLog[] = [];
  const today = fmtDay(new Date(now));

  machines.filter((m) => m.pmTracked).forEach((m, mi) => {
    let date = addDays(today, -63 + mi);
    let lastMonthly = '';
    const endOffset = mi === 1 ? -10 : mi === 2 ? -7 : -1; // machine 2 overdue, machine 3 due today
    while (date <= addDays(today, endOffset)) {
      const monthly = !lastMonthly || addMonths(lastMonthly, 1) <= date;
      if (monthly) lastMonthly = date;
      pms.push({ id: `demo-pm-${mi}-${date}`, machine: m.name, date, type: monthly ? 'monthly' : 'weekly', doneBy: rnd() > 0.2 ? pick(people) : '', notes: monthly ? 'Full monthly checklist, lubed bearings, checked belts' : '' });
      date = addDays(date, 7);
    }
  });

  const vendors: Vendor[] = [
    { id: 'demo-v1', name: 'McMaster-Carr', website: 'https://www.mcmaster.com', urlTemplate: 'https://www.mcmaster.com/{pn}', leadTimeDays: 1, preferred: true, phone: '(630) 833-0300' },
    { id: 'demo-v2', name: 'Motion Industries', website: 'https://www.motion.com', urlTemplate: 'https://www.motion.com/search?q={pn}', leadTimeDays: 3, preferred: true, contactName: 'Local branch' },
    { id: 'demo-v3', name: 'Grainger', website: 'https://www.grainger.com', urlTemplate: 'https://www.grainger.com/search?searchQuery={pn}', leadTimeDays: 2 },
    { id: 'demo-v4', name: 'Knife & Heater Supply Co.', leadTimeDays: 10, notes: 'Custom hot knives - call for quote' },
  ];

  const raw: [string, string, string, string, string, number, number, number, string, string][] = [
    // name, pn, manufacturer, category, location, qty, min, cost, vendor, unit
    ['Cartridge heater 1/2" x 6" 500W 240V', '3618K451', 'McMaster-Carr', 'Heaters', 'Crib A', 6, 4, 38.5, 'McMaster-Carr', 'ea'],
    ['Type J thermocouple 1/8" probe', '3871K23', 'McMaster-Carr', 'Sensors', 'Crib A', 3, 4, 27.9, 'McMaster-Carr', 'ea'],
    ['PTFE coated fiberglass tape 2" x 36yd', '76475A31', 'McMaster-Carr', 'Tooling', 'Crib A', 0, 3, 64.2, 'McMaster-Carr', 'roll'],
    ['Deep groove ball bearing 6204-2RS', '6204-2RSJEM', 'SKF', 'Bearings', 'Crib B', 14, 6, 11.4, 'Motion Industries', 'ea'],
    ['Deep groove ball bearing 6205-2RS', '6205-2RSJEM', 'SKF', 'Bearings', 'Crib B', 5, 6, 12.8, 'Motion Industries', 'ea'],
    ['Pillow block bearing 1-7/16"', 'P2B-SC-107', 'Timken', 'Bearings', 'Crib B', 2, 2, 58.0, 'Motion Industries', 'ea'],
    ['Timing belt 450-L-100', '450L100', 'Gates', 'Belts', 'Crib B', 4, 2, 31.75, 'Motion Industries', 'ea'],
    ['V-belt A42', 'A42', 'Gates', 'Belts', 'Crib B', 8, 3, 14.1, 'Motion Industries', 'ea'],
    ['Photoelectric sensor, diffuse, M18', 'QS18VP6D', 'Banner Engineering', 'Sensors', 'Maint. Shop', 2, 2, 118.0, 'Grainger', 'ea'],
    ['Registration eye / color mark sensor', 'QS18VN6LVQ8', 'Banner Engineering', 'Sensors', 'Maint. Shop', 1, 1, 289.0, 'Grainger', 'ea'],
    ['Proximity sensor 12mm inductive', 'IFS204', 'IFM', 'Sensors', 'Maint. Shop', 7, 3, 64.0, 'Motion Industries', 'ea'],
    ['Air cylinder 1-1/2" bore x 2" stroke', 'CQ2B40-50DZ', 'SMC', 'Pneumatics', 'Maint. Shop', 3, 2, 96.4, 'Motion Industries', 'ea'],
    ['Solenoid valve 5/2 24VDC', 'SY5120-5DZ-01', 'SMC', 'Pneumatics', 'Maint. Shop', 1, 2, 84.3, 'Motion Industries', 'ea'],
    ['Push-to-connect fitting 1/4" tube x 1/8" NPT', '5779K108', 'McMaster-Carr', 'Pneumatics', 'Crib A', 40, 20, 3.15, 'McMaster-Carr', 'ea'],
    ['Polyurethane tubing 1/4" OD blue (100 ft)', '5648K24', 'McMaster-Carr', 'Pneumatics', 'Crib A', 2, 1, 42.0, 'McMaster-Carr', 'roll'],
    ['Silicone sponge strip 1/2" x 1/8"', '8608K51', 'McMaster-Carr', 'Seals & O-Rings', 'Crib A', 12, 5, 9.6, 'McMaster-Carr', 'ft'],
    ['O-ring kit Buna-N assorted', '9262K12', 'McMaster-Carr', 'Seals & O-Rings', 'Crib A', 1, 1, 39.5, 'McMaster-Carr', 'set'],
    ['Solid state relay 40A', 'SSR-240D40', 'Omega', 'Electrical', 'Maint. Shop', 4, 2, 45.0, 'Grainger', 'ea'],
    ['Temperature controller 1/16 DIN', 'EZ-ZONE PM6', 'Watlow', 'Electrical', 'Maint. Shop', 1, 1, 312.0, 'Grainger', 'ea'],
    ['Fuse 10A fast acting (10 pk)', 'KTK-10', 'Eaton', 'Electrical', 'Maint. Shop', 3, 2, 27.5, 'Grainger', 'pk'],
    ['Hot knife blade - thin tip', 'HK-THIN-12', 'Custom', 'Hot Knives', 'Line Side', 5, 4, 145.0, 'Knife & Heater Supply Co.', 'ea'],
    ['Hot knife blade - wide tip', 'HK-WIDE-12', 'Custom', 'Hot Knives', 'Line Side', 2, 3, 165.0, 'Knife & Heater Supply Co.', 'ea'],
    ['Seal bar Teflon cover', 'SB-TC-24', 'Custom', 'Tooling', 'Line Side', 9, 4, 18.0, 'Knife & Heater Supply Co.', 'ea'],
    ['Socket head cap screw M6x20 (100)', '91290A316', 'McMaster-Carr', 'Fasteners', 'Crib A', 3, 1, 12.4, 'McMaster-Carr', 'box'],
    ['Compression spring 0.6" OD', '9657K411', 'McMaster-Carr', 'Springs', 'Crib A', 18, 8, 1.95, 'McMaster-Carr', 'ea'],
    ['Gear motor 1/2 HP 90VDC', '4Z130', 'Baldor (ABB)', 'Motors', 'Maint. Shop', 1, 1, 685.0, 'Grainger', 'ea'],
    ['Anti-static brush 24"', 'ASB-24', 'Custom', 'Tooling', 'Line Side', 0, 2, 54.0, 'Grainger', 'ea'],
  ];

  const parts: Part[] = raw.map(([name, pn, manufacturer, category, location, qty, minQty, unitCost, vendor, unit], i) => {
    const v = vendors.find((x) => x.name === vendor);
    return {
      id: `demo-p${i}`, name, partNumber: pn, manufacturer, category, location, qty, minQty, maxQty: minQty * 3, unit, unitCost, vendor,
      leadTimeDays: v?.leadTimeDays, orderUrl: v?.urlTemplate ? v.urlTemplate.replace('{pn}', encodeURIComponent(pn)) : '',
      machines: [pick(machines).name, ...(rnd() > 0.5 ? [pick(machines).name] : [])].filter((x, j, a) => a.indexOf(x) === j),
      critical: i % 7 === 0,
    };
  });
  parts.push({ id: 'demo-pold', name: 'Old style knife holder (Machine 5 - removed)', partNumber: 'KH-OLD-5', manufacturer: 'Custom', category: 'Tooling', location: 'Crib B', qty: 3, minQty: 0, unit: 'ea', decommissioned: true });

  const equipment: Equipment[] = [];
  const bagSizes: Equipment['bagSize'][] = ['small', 'medium', 'large', 'custom'];
  for (let i = 0; i < 10; i++) {
    const installed = i < 4; // one knife spot per bag machine
    equipment.push({
      id: `demo-k${i}`, type: 'knife', tag: `HK-${String(101 + i)}`, status: installed ? 'installed' : 'spare',
      machine: installed ? machines[i % 4].name : '',
      installedAt: installed ? now - Math.floor(rnd() * 45 + 2) * DAY : null,
      tipType: i % 3 ? 'thin' : 'wide', bagSize: bagSizes[i % 4], bagInches: i % 4 === 3 ? 14.5 : undefined,
    });
  }
  const rollerTypes: Equipment['rollerType'][] = ['nip', 'draw', 'nip', 'draw', 'idler'];
  for (let i = 0; i < 10; i++) {
    const installed = i < 8;
    equipment.push({
      id: `demo-r${i}`, type: 'roller', tag: `RL-${String(201 + i)}`, status: installed ? 'installed' : i === 8 ? 'repair' : 'spare',
      machine: installed ? machines[i % 6].name : '', position: installed ? pick(['Infeed', 'Outfeed', 'Upper', 'Lower']) : '',
      installedAt: installed ? now - Math.floor(rnd() * 240 + 5) * DAY : null, pmDays: 180,
      construction: i % 2 ? 'segmented' : 'solid', rollerType: rollerTypes[i % 5], diameter: [3, 4, 4.5, 6][i % 4], length: [24, 36, 48][i % 3],
    });
  }

  // past install → pull history (most pulled for wear)
  const pastStints = (e: Equipment, hosts: string[], life: [number, number]) => {
    const h: Stint[] = [];
    let end = (e.status === 'installed' ? e.installedAt! : now - Math.floor(rnd() * 20 + 1) * DAY) - DAY;
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const len = Math.floor(life[0] + rnd() * (life[1] - life[0]));
      const start = end - len * DAY;
      h.unshift({ machine: pick(hosts), installedAt: start, removedAt: end, reason: rnd() < 0.65 ? 'Wear' : rnd() < 0.5 ? pick(REMOVAL_REASONS) : '' });
      end = start - Math.floor(rnd() * 15 + 1) * DAY;
    }
    if (e.status === 'installed') h.push({ machine: e.machine!, position: e.position || '', installedAt: e.installedAt! });
    e.history = h;
  };
  for (const e of equipment) pastStints(e, machines.slice(0, e.type === 'knife' ? 4 : 6).map((m) => m.name), e.type === 'knife' ? [12, 60] : [90, 300]);

  // sonic welders, their horns & anvils
  const welders: Welder[] = [
    { id: 'demo-w1', name: 'Welder 1', machine: 'Bag Machine 1', model: 'Branson 2000X 20 kHz' },
    { id: 'demo-w2', name: 'Welder 2', machine: 'Bag Machine 3', model: 'Branson 2000X 20 kHz' },
    { id: 'demo-w3', name: 'Welder 3', machine: 'Bag Machine 4', model: 'Herrmann HiQ 35 kHz' },
  ];
  // Each welder holds exactly one horn and one anvil. Build each slot's timeline backwards from today:
  // the one on it now, then the ones it replaced (handed over the same day they came off).
  let tagNo = 11;
  for (const type of ['horn', 'anvil'] as const) {
    const life: [number, number] = type === 'horn' ? [70, 200] : [35, 120];
    welders.forEach((w) => {
      let end = now;
      for (let k = 0; k < 3; k++) {
        const len = Math.floor(life[0] + rnd() * (life[1] - life[0])) * (k === 0 ? 0.4 : 1);
        const start = end - Math.round(len) * DAY;
        const current = k === 0;
        const e: Equipment = {
          id: `demo-${type}${tagNo}`, type, tag: `${type === 'horn' ? 'H' : 'A'}-${tagNo}`,
          status: current ? 'installed' : k === 1 ? (rnd() < 0.5 ? 'spare' : 'repair') : 'retired',
          machine: current ? w.name : '', installedAt: current ? start : null,
          partNumber: type === 'horn' ? `HRN-${2040 + (tagNo % 3)}` : `ANV-${310 + (tagNo % 3)}`,
          history: [current
            ? { machine: w.name, installedAt: start }
            : { machine: w.name, installedAt: start, removedAt: end, reason: k === 2 ? 'Wear' : pick(['Wear', 'Wear', 'Damage', 'Repair / rebuild']), note: k === 2 ? 'Worn face, re-machining not worth it' : '' }],
          notes: k === 2 ? 'Scrapped' : '',
        };
        equipment.push(e);
        tagNo++;
        end = start;
      }
    });
    // one ready-to-go spare of each, never installed yet
    equipment.push({ id: `demo-${type}${tagNo}`, type, tag: `${type === 'horn' ? 'H' : 'A'}-${tagNo}`, status: 'spare', partNumber: type === 'horn' ? 'HRN-2040' : 'ANV-310', notes: 'New, in box' });
    tagNo++;
  }

  // ~2 months of downtime / glitches
  const problems: Record<string, [string, string][]> = {
    Sealing: [['Seal not holding on left side', 'Raised seal temp 10°'], ['Wrinkled seals', 'Re-shimmed seal bar']],
    'Hot knife': [['Knife not cutting through', 'Swapped hot knife'], ['Knife cycling slow', 'Cleaned contacts']],
    'Rollers / nip': [['Film tracking off the nip', 'Adjusted nip pressure'], ['Roller slipping', 'Cleaned roller face']],
    'Sonic welder': [['Weak welds, bags opening', 'Raised amplitude to 80%'], ['Overload fault on welder', 'Re-torqued horn, reset'], ['Anvil marks on film', 'Cleaned anvil']],
    Electrical: [['Photo-eye missing registration', 'Cleaned and re-taught eye'], ['Drive fault', 'Reset VFD']],
    Mechanical: [['Bag stacker jam', 'Cleared jam, adjusted guides'], ['Belt slipping', 'Tensioned belt']],
    'Film / material': [['Roll splice broke', 'Re-spliced'], ['Gauge bands in film', 'Called extrusion']],
  };
  const downtime: Downtime[] = [];
  for (let i = 0; i < 46; i++) {
    const cat = pick(Object.keys(problems));
    const [problem, fix] = pick(problems[cat]);
    const w = cat === 'Sonic welder' ? pick(welders) : null;
    downtime.push({
      id: `demo-dt${i}`, machine: w ? w.machine! : pick(machines.slice(0, 6)).name, welder: w?.name, category: cat, problem, fix,
      startedAt: now - Math.floor(rnd() * 60 * DAY) - 3600000, minutes: pick([5, 10, 10, 15, 20, 30, 45, 60, 90]),
      bpm: w || rnd() < 0.3 ? pick([90, 100, 110, 120, 130]) : undefined, reportedBy: pick(people),
    });
  }

  // crushed cores
  const cores: CrushedCore[] = [];
  for (let i = 0; i < 24; i++) {
    cores.push({ id: `demo-cc${i}`, tag: String(448100 + Math.floor(rnd() * 900)), at: now - Math.floor(rnd() * 45 * DAY), machine: rnd() < 0.7 ? pick(machines.slice(4, 8)).name : '', notes: rnd() < 0.3 ? pick(['Forklift damage', 'Crushed in storage', 'Dropped off rack']) : '', reportedBy: pick(people) });
  }

  // shift handover notes (a couple still need follow-up)
  const HOUR = 3_600_000;
  const notes: ShiftNote[] = [
    { id: 'demo-n1', text: 'Knife on position 2 is running hot. Swapped the thermocouple, keep an eye on it.', machine: machines[4].name, shift: '1st shift (days)', followUp: true, author: people[0], createdAt: now - 2 * HOUR },
    { id: 'demo-n2', text: 'Out of 3/4" roller bearings. Used the last one on the nip roller. Order guide started.', machine: machines[5].name, shift: '1st shift (days)', followUp: true, author: people[1], createdAt: now - 5 * HOUR },
    { id: 'demo-n3', text: 'Ran fine all night, no stops.', shift: '3rd shift (nights)', author: people[2], createdAt: now - 14 * HOUR },
    { id: 'demo-n4', text: 'Changed the horn on Welder 1, old one was cracked at the tip.', machine: machines[6].name, shift: '2nd shift (afternoons)', followUp: true, done: true, doneBy: people[0], doneAt: now - 20 * HOUR, author: people[3], createdAt: now - 26 * HOUR },
  ];
  const announcements: Announcement[] = [
    { id: 'demo-a1', title: 'Welcome to the sample data', body: 'Everything here is made up so you can try things out. An admin can erase it under Admin → Storage & usage.', level: 'info', audience: 'all', dismissible: true, active: true, author: 'Admin' },
  ];

  // ~10 months of usage history
  const movements: { partId: string; partName: string; delta: number; qtyAfter: number; kind: string; machine: string; userName: string; unitCost: number; at: number }[] = [];
  for (const p of parts.filter((x) => !x.decommissioned)) {
    const rate = rnd() * 0.25 + 0.02;
    let q = p.qty + 20;
    for (let d = 300; d > 0; d--) {
      if (rnd() < rate) {
        const take = Math.max(1, Math.round(rnd() * 2));
        q = Math.max(0, q - take);
        movements.push({ partId: p.id, partName: p.name, delta: -take, qtyAfter: q, kind: 'use', machine: pick(machines).name, userName: pick(people), unitCost: p.unitCost || 0, at: now - d * DAY + Math.floor(rnd() * 8 * 3600000) });
      }
      if (q <= (p.minQty || 1) && rnd() < 0.2) {
        const add = (p.maxQty || 6) - q;
        q += add;
        movements.push({ partId: p.id, partName: p.name, delta: add, qtyAfter: q, kind: 'receive', machine: '', userName: pick(people), unitCost: p.unitCost || 0, at: now - d * DAY + 9 * 3600000 });
      }
    }
  }

  return {
    docs: { machines, vendors, parts, equipment, pms, mechanics, welders, downtime, cores, notes, announcements } as unknown as Partial<Record<DocKind, Record<string, unknown>[]>>,
    movements,
  };
}
