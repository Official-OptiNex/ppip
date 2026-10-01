// Shared data model used by both the server (validation) and the web app (types).

export type Role = 'viewer' | 'editor' | 'admin';
export const ROLES: Role[] = ['viewer', 'editor', 'admin'];

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLogin?: number | null;
  badge?: string | null; // employee badge number (admins see all; each user sees their own)
  createdAt?: number;
  prefs?: UserPrefs;
}

export interface UserPrefs {
  theme?: 'light' | 'dark' | 'system';
  textSize?: 'standard' | 'large' | 'xlarge';
  desktopAlerts?: boolean;
  tutorialDone?: boolean; // first-login walkthrough finished or skipped
}

export interface BaseDoc {
  id: string;
  updatedAt?: number;
  updatedBy?: string;
  createdAt?: number;
}

export interface Part extends BaseDoc {
  name: string;
  partNumber?: string;
  manufacturer?: string;
  category?: string;
  location?: string;
  description?: string;
  qty: number;
  minQty?: number; // at or below = LOW (orange)
  orderQty?: number; // at or below = ORDER NOW (red); blank = half of minQty
  maxQty?: number; // target stock level when re-ordering
  unit?: string;
  unitCost?: number;
  vendor?: string;
  vendorPartNumber?: string;
  leadTimeDays?: number;
  orderUrl?: string;
  imageId?: string;
  decommissioned?: boolean;
  critical?: boolean;
  machines?: string[];
  notes?: string;
}

export interface Manufacturer extends BaseDoc {
  name: string;
  website?: string;
  urlTemplate?: string; // e.g. https://www.mcmaster.com/{pn}
  notes?: string;
}

export interface Vendor extends BaseDoc {
  name: string;
  website?: string;
  urlTemplate?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  accountNumber?: string;
  leadTimeDays?: number;
  preferred?: boolean;
  notes?: string;
}

export interface Machine extends BaseDoc {
  name: string;
  area?: string;
  notes?: string;
  pmTracked?: boolean; // shows on the PMs page
  pmWeeklyDays?: number; // next PM due this many days after the last PM of any type (default 7)
  pmMonthlyMonths?: number; // a monthly PM is required every N months (default 1)
}

/** People who do PMs and repairs (managed by admins; not necessarily app users). */
export interface Mechanic extends BaseDoc {
  name: string;
  shift?: string; // one of Settings.shifts
  phone?: string;
  notes?: string;
  inactive?: boolean; // left / no longer doing PMs (kept for history)
}

export type PmType = 'weekly' | 'monthly';
export interface PmLog extends BaseDoc {
  machine: string;
  date: string; // YYYY-MM-DD the PM was done
  type: PmType;
  doneBy?: string;
  nextDue?: string; // YYYY-MM-DD; filled in automatically, can be changed
  notes?: string;
}

export type EquipmentType = 'knife' | 'roller';
export type EquipmentStatus = 'installed' | 'spare' | 'repair' | 'retired';

export interface Equipment extends BaseDoc {
  type: EquipmentType;
  tag: string; // ID / serial written on the knife or roller
  status: EquipmentStatus;
  machine?: string;
  position?: string; // rollers only (a hot knife has one spot per machine)
  installedAt?: number | null;
  lastServiceAt?: number | null;
  pmDays?: number; // roller PM interval (hot knives have none)
  notes?: string;
  // Hot knives
  tipType?: 'thin' | 'wide';
  bagSize?: 'small' | 'medium' | 'large' | 'custom';
  bagInches?: number;
  // Rollers
  construction?: 'segmented' | 'solid';
  rollerType?: 'nip' | 'draw' | 'idler' | 'other';
  diameter?: number; // outer diameter, inches
  length?: number; // roller length, inches
  covering?: string; // no longer used (all rollers are rubber)
}

export interface OrderItem {
  partId?: string;
  name: string;
  partNumber?: string;
  manufacturer?: string;
  vendor?: string;
  qty: number;
  unit?: string;
  unitCost?: number;
  url?: string;
  reason?: string;
  received?: boolean;
}

export type OrderStatus = 'draft' | 'submitted' | 'approved' | 'ordered' | 'received' | 'cancelled';

export interface OrderGuide extends BaseDoc {
  number?: string;
  title: string;
  requestedBy?: string;
  department?: string;
  machine?: string;
  dateNeeded?: string; // YYYY-MM-DD
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  status: OrderStatus;
  vendor?: string;
  poNumber?: string;
  notes?: string;
  items: OrderItem[];
}

export interface PrintTemplate {
  title: string;
  subtitle?: string;
  headerNote?: string;
  footerNote?: string;
  showLogo?: boolean;
  logoText?: string;
  accent?: string;
  columns: {
    partNumber: boolean;
    manufacturer: boolean;
    vendor: boolean;
    unitCost: boolean;
    total: boolean;
    reason: boolean;
    link: boolean;
  };
  signatures: string[]; // e.g. ["Requested by", "Supervisor approval", "Purchasing"]
  fontScale?: number;
}

export interface Settings extends BaseDoc {
  companyName?: string;
  department?: string;
  categories?: string[];
  locations?: string[];
  units?: string[];
  knifePmDays?: number; // no longer used (hot knives have no PM)
  rollerPmDays?: number;
  weeklyReportDay?: number; // 0=Sun..6=Sat
  currency?: string;
  printTemplate?: PrintTemplate;
  publicUrl?: string; // used for QR codes when running from USB
  badgeLogin?: boolean; // allow one-scan badge sign-in (default on)
  shifts?: string[]; // shift names mechanics can be assigned to
}

export interface DocMap {
  parts: Part;
  manufacturers: Manufacturer;
  vendors: Vendor;
  machines: Machine;
  equipment: Equipment;
  orders: OrderGuide;
  pms: PmLog;
  mechanics: Mechanic;
  settings: Settings;
}
export type DocKind = keyof DocMap;
export const DOC_KINDS: DocKind[] = ['parts', 'manufacturers', 'vendors', 'machines', 'equipment', 'orders', 'pms', 'mechanics', 'settings'];

export interface Movement {
  id: string;
  partId: string;
  partName: string;
  delta: number;
  qtyAfter: number;
  kind: 'use' | 'receive' | 'adjust' | 'create';
  machine?: string | null;
  note?: string | null;
  userName?: string | null;
  at: number;
  unitCost?: number | null;
}

export interface Activity {
  id: string;
  at: number;
  userName?: string | null;
  action: string;
  kind?: string | null;
  refId?: string | null;
  summary: string;
}

export interface AppNotification {
  id: string;
  at: number;
  level: 'info' | 'warn' | 'danger' | 'success';
  title: string;
  body?: string | null;
  link?: string | null;
}

// ---- Field specifications (server-side sanitising) ----
export type FieldType = 'str' | 'text' | 'num' | 'bool' | 'strs' | 'json' | 'time';
export const FIELD_SPECS: Record<DocKind, Record<string, FieldType>> = {
  parts: {
    name: 'str', partNumber: 'str', manufacturer: 'str', category: 'str', location: 'str', description: 'text',
    qty: 'num', minQty: 'num', orderQty: 'num', maxQty: 'num', unit: 'str', unitCost: 'num', vendor: 'str', vendorPartNumber: 'str',
    leadTimeDays: 'num', orderUrl: 'str', imageId: 'str', decommissioned: 'bool', critical: 'bool', machines: 'strs', notes: 'text',
  },
  manufacturers: { name: 'str', website: 'str', urlTemplate: 'str', notes: 'text' },
  vendors: {
    name: 'str', website: 'str', urlTemplate: 'str', contactName: 'str', phone: 'str', email: 'str', accountNumber: 'str',
    leadTimeDays: 'num', preferred: 'bool', notes: 'text',
  },
  machines: { name: 'str', area: 'str', notes: 'text', pmTracked: 'bool', pmWeeklyDays: 'num', pmMonthlyMonths: 'num' },
  mechanics: { name: 'str', shift: 'str', phone: 'str', notes: 'text', inactive: 'bool' },
  pms: { machine: 'str', date: 'str', type: 'str', doneBy: 'str', nextDue: 'str', notes: 'text' },
  equipment: {
    type: 'str', tag: 'str', status: 'str', machine: 'str', position: 'str', installedAt: 'time', lastServiceAt: 'time', pmDays: 'num',
    notes: 'text', tipType: 'str', bagSize: 'str', bagInches: 'num', construction: 'str', rollerType: 'str', diameter: 'num',
    length: 'num', covering: 'str',
  },
  orders: {
    number: 'str', title: 'str', requestedBy: 'str', department: 'str', machine: 'str', dateNeeded: 'str', priority: 'str',
    status: 'str', vendor: 'str', poNumber: 'str', notes: 'text', items: 'json',
  },
  settings: {
    companyName: 'str', department: 'str', categories: 'strs', locations: 'strs', units: 'strs', knifePmDays: 'num',
    rollerPmDays: 'num', weeklyReportDay: 'num', currency: 'str', printTemplate: 'json', publicUrl: 'str', badgeLogin: 'bool', shifts: 'strs',
  },
};

// Stock status used everywhere: ok = green, low = orange ("running low"),
// order = red ("order now"), out = red (none left), retired = grey (decommissioned).
export type StockStatus = 'ok' | 'low' | 'order' | 'out' | 'retired';
type StockFields = Pick<Part, 'qty' | 'minQty' | 'orderQty' | 'decommissioned'>;
/** Stock level at or below which a part is "order now". Uses the part's own setting, else half the reorder point. */
export function orderNowLevel(p: Pick<Part, 'minQty' | 'orderQty'>): number | null {
  if (p.orderQty != null) return p.orderQty;
  if (p.minQty != null && p.minQty >= 2) return Math.floor(p.minQty / 2);
  return null;
}
export function stockStatus(p: StockFields): StockStatus {
  if (p.decommissioned) return 'retired';
  const q = Number(p.qty) || 0;
  if (q <= 0) return 'out';
  const order = orderNowLevel(p);
  if (order != null && q <= order) return 'order';
  if (p.minQty != null && q <= p.minQty) return 'low';
  return 'ok';
}
/** Low, order-now or out: belongs on a reorder list. */
export function needsReorder(s: StockStatus) { return s === 'low' || s === 'order' || s === 'out'; }

export const DEFAULT_PRINT_TEMPLATE: PrintTemplate = {
  title: 'Parts Order Request',
  subtitle: 'Maintenance / Process Engineering',
  headerNote: '',
  footerNote: 'Please return completed form to the maintenance office.',
  showLogo: true,
  logoText: '',
  accent: '#1f5fbf',
  columns: { partNumber: true, manufacturer: true, vendor: true, unitCost: true, total: true, reason: true, link: false },
  signatures: ['Requested by', 'Supervisor approval', 'Purchasing'],
  fontScale: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  companyName: 'My Plant',
  department: 'Process Engineering / Maintenance',
  categories: ['Bearings', 'Belts', 'Electrical', 'Fasteners', 'Heaters', 'Hot Knives', 'Hydraulics', 'Motors', 'Pneumatics', 'Rollers', 'Sensors', 'Seals & O-Rings', 'Springs', 'Tooling', 'Other'],
  locations: ['Crib A', 'Crib B', 'Maint. Shop', 'Line Side'],
  units: ['ea', 'pk', 'box', 'ft', 'in', 'm', 'roll', 'set', 'pair', 'gal', 'lb'],
  shifts: ['1st shift (days)', '2nd shift (afternoons)', '3rd shift (nights)', 'Weekend'],
  knifePmDays: 30,
  rollerPmDays: 180,
  weeklyReportDay: 1,
  currency: 'USD',
  printTemplate: DEFAULT_PRINT_TEMPLATE,
};

// Common industrial manufacturers / suppliers with auto order-link templates ({pn} = part number).
export const SEED_MANUFACTURERS: Omit<Manufacturer, 'id'>[] = [
  { name: 'McMaster-Carr', website: 'https://www.mcmaster.com', urlTemplate: 'https://www.mcmaster.com/{pn}' },
  { name: 'Grainger', website: 'https://www.grainger.com', urlTemplate: 'https://www.grainger.com/search?searchQuery={pn}' },
  { name: 'MSC Industrial', website: 'https://www.mscdirect.com', urlTemplate: 'https://www.mscdirect.com/browse/tn?searchterm={pn}' },
  { name: 'Motion Industries', website: 'https://www.motion.com', urlTemplate: 'https://www.motion.com/search?q={pn}' },
  { name: 'Applied Industrial', website: 'https://www.applied.com', urlTemplate: 'https://www.applied.com/search?text={pn}' },
  { name: 'AutomationDirect', website: 'https://www.automationdirect.com', urlTemplate: 'https://www.automationdirect.com/adc/shopping/catalog?keywords={pn}' },
  { name: 'Misumi', website: 'https://us.misumi-ec.com', urlTemplate: 'https://us.misumi-ec.com/vona2/result/?Keyword={pn}' },
  { name: 'Allen-Bradley (Rockwell)', website: 'https://www.rockwellautomation.com', urlTemplate: 'https://www.rockwellautomation.com/en-us/search.html?keyword={pn}' },
  { name: 'Siemens', website: 'https://mall.industry.siemens.com', urlTemplate: 'https://mall.industry.siemens.com/mall/en/us/Catalog/Search?searchTerm={pn}' },
  { name: 'SMC', website: 'https://www.smcusa.com', urlTemplate: 'https://www.smcusa.com/search?q={pn}' },
  { name: 'Festo', website: 'https://www.festo.com', urlTemplate: 'https://www.festo.com/us/en/search/?text={pn}' },
  { name: 'Parker Hannifin', website: 'https://www.parker.com', urlTemplate: 'https://www.parker.com/us/en/search.html?searchTerm={pn}' },
  { name: 'Bimba', website: 'https://www.bimba.com', urlTemplate: 'https://www.bimba.com/search?q={pn}' },
  { name: 'Banner Engineering', website: 'https://www.bannerengineering.com', urlTemplate: 'https://www.bannerengineering.com/us/en/search.html?q={pn}' },
  { name: 'Keyence', website: 'https://www.keyence.com', urlTemplate: 'https://www.keyence.com/search/?q={pn}' },
  { name: 'Omron', website: 'https://automation.omron.com', urlTemplate: 'https://automation.omron.com/en/us/search?q={pn}' },
  { name: 'SICK', website: 'https://www.sick.com', urlTemplate: 'https://www.sick.com/us/en/search?text={pn}' },
  { name: 'IFM', website: 'https://www.ifm.com', urlTemplate: 'https://www.ifm.com/us/en/product/{pn}' },
  { name: 'Turck', website: 'https://www.turck.us', urlTemplate: 'https://www.turck.us/en/search?q={pn}' },
  { name: 'Phoenix Contact', website: 'https://www.phoenixcontact.com', urlTemplate: 'https://www.phoenixcontact.com/en-us/search?q={pn}' },
  { name: 'SKF', website: 'https://www.skf.com', urlTemplate: 'https://www.skf.com/us/search-results?q={pn}' },
  { name: 'Timken', website: 'https://www.timken.com', urlTemplate: '' },
  { name: 'NSK', website: 'https://www.nskamericas.com', urlTemplate: '' },
  { name: 'Gates', website: 'https://www.gates.com', urlTemplate: 'https://www.gates.com/us/en/search.html?q={pn}' },
  { name: 'Baldor (ABB)', website: 'https://www.baldor.com', urlTemplate: 'https://www.baldor.com/catalog/{pn}' },
  { name: 'Watlow', website: 'https://www.watlow.com', urlTemplate: 'https://www.watlow.com/search?q={pn}' },
  { name: 'Tempco', website: 'https://www.tempco.com', urlTemplate: '' },
  { name: 'Chromalox', website: 'https://www.chromalox.com', urlTemplate: '' },
  { name: 'Omega', website: 'https://www.omega.com', urlTemplate: 'https://www.omega.com/en-us/search/?text={pn}' },
  { name: 'IGUS', website: 'https://www.igus.com', urlTemplate: 'https://www.igus.com/search?q={pn}' },
  { name: 'Eaton', website: 'https://www.eaton.com', urlTemplate: '' },
  { name: 'Schneider Electric', website: 'https://www.se.com', urlTemplate: 'https://www.se.com/us/en/search/?q={pn}' },
  { name: 'Loctite', website: 'https://www.henkel-adhesives.com', urlTemplate: '' },
  { name: '3M', website: 'https://www.3m.com', urlTemplate: '' },
  { name: 'Amazon', website: 'https://www.amazon.com', urlTemplate: 'https://www.amazon.com/s?k={pn}' },
  // --- motors, drives & power transmission
  { name: 'WEG', website: 'https://www.weg.net', urlTemplate: '' },
  { name: 'Leeson', website: 'https://www.leeson.com', urlTemplate: '' },
  { name: 'Marathon Motors', website: 'https://www.regalrexnord.com', urlTemplate: '' },
  { name: 'Regal Rexnord', website: 'https://www.regalrexnord.com', urlTemplate: '' },
  { name: 'Dodge', website: 'https://www.dodgeindustrial.com', urlTemplate: '' },
  { name: 'Browning', website: 'https://www.regalrexnord.com', urlTemplate: '' },
  { name: 'Martin Sprocket & Gear', website: 'https://www.martinsprocket.com', urlTemplate: '' },
  { name: 'Boston Gear', website: 'https://www.bostongear.com', urlTemplate: '' },
  { name: 'SEW-Eurodrive', website: 'https://www.seweurodrive.com', urlTemplate: '' },
  { name: 'NORD Drivesystems', website: 'https://www.nord.com', urlTemplate: '' },
  { name: 'Lenze', website: 'https://www.lenze.com', urlTemplate: '' },
  { name: 'Yaskawa', website: 'https://www.yaskawa.com', urlTemplate: '' },
  { name: 'ABB', website: 'https://new.abb.com', urlTemplate: '' },
  { name: 'Mitsubishi Electric', website: 'https://us.mitsubishielectric.com', urlTemplate: '' },
  { name: 'Danfoss', website: 'https://www.danfoss.com', urlTemplate: '' },
  { name: 'Tsubaki', website: 'https://www.ustsubaki.com', urlTemplate: '' },
  { name: 'Renold', website: 'https://www.renold.com', urlTemplate: '' },
  { name: 'Diamond Chain', website: 'https://www.diamondchain.com', urlTemplate: '' },
  { name: 'Lovejoy', website: 'https://www.lovejoy-inc.com', urlTemplate: '' },
  { name: 'Ruland', website: 'https://www.ruland.com', urlTemplate: '' },
  { name: 'Fenner Drives', website: 'https://www.fennerdrives.com', urlTemplate: '' },
  { name: 'Optibelt', website: 'https://www.optibelt.com', urlTemplate: '' },
  { name: 'Habasit', website: 'https://www.habasit.com', urlTemplate: '' },
  { name: 'Intralox', website: 'https://www.intralox.com', urlTemplate: '' },
  // --- bearings & linear motion
  { name: 'Schaeffler (FAG / INA)', website: 'https://www.schaeffler.com', urlTemplate: '' },
  { name: 'NTN', website: 'https://www.ntnamericas.com', urlTemplate: '' },
  { name: 'Koyo (JTEKT)', website: 'https://koyo.jtekt.co.jp', urlTemplate: '' },
  { name: 'McGill', website: 'https://www.regalrexnord.com', urlTemplate: '' },
  { name: 'Sealmaster', website: 'https://www.regalrexnord.com', urlTemplate: '' },
  { name: 'THK', website: 'https://www.thk.com', urlTemplate: '' },
  { name: 'HIWIN', website: 'https://www.hiwin.us', urlTemplate: '' },
  // --- pneumatics, hydraulics & fluid
  { name: 'Norgren (IMI)', website: 'https://www.imi-precision.com', urlTemplate: '' },
  { name: 'Emerson / Aventics', website: 'https://www.emerson.com', urlTemplate: '' },
  { name: 'Numatics', website: 'https://www.emerson.com', urlTemplate: '' },
  { name: 'Clippard', website: 'https://www.clippard.com', urlTemplate: '' },
  { name: 'MAC Valves', website: 'https://www.macvalves.com', urlTemplate: '' },
  { name: 'ARO (Ingersoll Rand)', website: 'https://www.arozone.com', urlTemplate: '' },
  { name: 'Camozzi', website: 'https://www.camozzi.com', urlTemplate: '' },
  { name: 'Bosch Rexroth', website: 'https://www.boschrexroth.com', urlTemplate: '' },
  { name: 'Vickers (Eaton)', website: 'https://www.eaton.com', urlTemplate: '' },
  { name: 'Sun Hydraulics', website: 'https://www.sunhydraulics.com', urlTemplate: '' },
  { name: 'Swagelok', website: 'https://www.swagelok.com', urlTemplate: '' },
  { name: 'Graco', website: 'https://www.graco.com', urlTemplate: '' },
  { name: 'Gast', website: 'https://www.gastmfg.com', urlTemplate: '' },
  { name: 'Busch Vacuum', website: 'https://www.buschvacuum.com', urlTemplate: '' },
  { name: 'Becker Pumps', website: 'https://www.beckerpumps.com', urlTemplate: '' },
  { name: 'Dixon Valve', website: 'https://www.dixonvalve.com', urlTemplate: '' },
  // --- sensors, controls & electrical
  { name: 'Pepperl+Fuchs', website: 'https://www.pepperl-fuchs.com', urlTemplate: '' },
  { name: 'Balluff', website: 'https://www.balluff.com', urlTemplate: '' },
  { name: 'Cognex', website: 'https://www.cognex.com', urlTemplate: '' },
  { name: 'Datalogic', website: 'https://www.datalogic.com', urlTemplate: '' },
  { name: 'Leuze', website: 'https://www.leuze.com', urlTemplate: '' },
  { name: 'Honeywell', website: 'https://www.honeywell.com', urlTemplate: '' },
  { name: 'Red Lion', website: 'https://www.redlion.net', urlTemplate: '' },
  { name: 'Pilz', website: 'https://www.pilz.com', urlTemplate: '' },
  { name: 'Schmersal', website: 'https://www.schmersal.com', urlTemplate: '' },
  { name: 'Square D', website: 'https://www.se.com', urlTemplate: '' },
  { name: 'WAGO', website: 'https://www.wago.com', urlTemplate: '' },
  { name: 'Weidmüller', website: 'https://www.weidmuller.com', urlTemplate: '' },
  { name: 'Hoffman (nVent)', website: 'https://hoffman.nvent.com', urlTemplate: '' },
  { name: 'Bussmann (Eaton)', website: 'https://www.eaton.com', urlTemplate: '' },
  { name: 'Littelfuse', website: 'https://www.littelfuse.com', urlTemplate: '' },
  { name: 'Mersen', website: 'https://www.mersen.com', urlTemplate: '' },
  { name: 'Panduit', website: 'https://www.panduit.com', urlTemplate: '' },
  { name: 'Hubbell', website: 'https://www.hubbell.com', urlTemplate: '' },
  { name: 'Brady', website: 'https://www.bradyid.com', urlTemplate: '' },
  { name: 'Fluke', website: 'https://www.fluke.com', urlTemplate: '' },
  { name: 'Fuji Electric', website: 'https://americas.fujielectric.com', urlTemplate: '' },
  { name: 'Hotset', website: 'https://www.hotset.com', urlTemplate: '' },
  { name: 'Durex Industries', website: 'https://www.durexindustries.com', urlTemplate: '' },
  // --- packaging / sealing / hot melt
  { name: 'CS Hyde', website: 'https://www.cshyde.com', urlTemplate: '' },
  { name: 'Nordson', website: 'https://www.nordson.com', urlTemplate: '' },
  { name: 'Valco Melton', website: 'https://www.valcomelton.com', urlTemplate: '' },
  // --- lubricants & chemicals
  { name: 'Mobil', website: 'https://www.mobil.com', urlTemplate: '' },
  { name: 'Klüber', website: 'https://www.klueber.com', urlTemplate: '' },
  { name: 'Lubriplate', website: 'https://www.lubriplate.com', urlTemplate: '' },
  { name: 'CRC', website: 'https://www.crcindustries.com', urlTemplate: '' },
  { name: 'WD-40', website: 'https://www.wd40.com', urlTemplate: '' },
];

/** Common industrial suppliers / distributors (where parts are bought), with search links where the format is known. */
export const SEED_VENDORS: Omit<Vendor, 'id'>[] = [
  { name: 'McMaster-Carr', website: 'https://www.mcmaster.com', urlTemplate: 'https://www.mcmaster.com/{pn}', leadTimeDays: 1 },
  { name: 'Grainger', website: 'https://www.grainger.com', urlTemplate: 'https://www.grainger.com/search?searchQuery={pn}', leadTimeDays: 2 },
  { name: 'MSC Industrial', website: 'https://www.mscdirect.com', urlTemplate: 'https://www.mscdirect.com/browse/tn?searchterm={pn}', leadTimeDays: 2 },
  { name: 'Motion Industries', website: 'https://www.motion.com', urlTemplate: 'https://www.motion.com/search?q={pn}' },
  { name: 'Applied Industrial', website: 'https://www.applied.com', urlTemplate: 'https://www.applied.com/search?text={pn}' },
  { name: 'Fastenal', website: 'https://www.fastenal.com', urlTemplate: 'https://www.fastenal.com/product?query={pn}' },
  { name: 'Zoro', website: 'https://www.zoro.com', urlTemplate: 'https://www.zoro.com/search?q={pn}' },
  { name: 'Global Industrial', website: 'https://www.globalindustrial.com', urlTemplate: 'https://www.globalindustrial.com/searchResult?q={pn}' },
  { name: 'Uline', website: 'https://www.uline.com', urlTemplate: 'https://www.uline.com/Search?keywords={pn}' },
  { name: 'AutomationDirect', website: 'https://www.automationdirect.com', urlTemplate: 'https://www.automationdirect.com/adc/shopping/catalog?keywords={pn}' },
  { name: 'Misumi', website: 'https://us.misumi-ec.com', urlTemplate: 'https://us.misumi-ec.com/vona2/result/?Keyword={pn}' },
  { name: 'Digi-Key', website: 'https://www.digikey.com', urlTemplate: 'https://www.digikey.com/en/products/result?keywords={pn}' },
  { name: 'Mouser', website: 'https://www.mouser.com', urlTemplate: 'https://www.mouser.com/c/?q={pn}' },
  { name: 'Newark', website: 'https://www.newark.com', urlTemplate: 'https://www.newark.com/search?st={pn}' },
  { name: 'Galco', website: 'https://www.galco.com', urlTemplate: 'https://www.galco.com/catalogsearch/result/?q={pn}' },
  { name: 'RS Americas (Allied)', website: 'https://us.rs-online.com', urlTemplate: '' },
  { name: 'Radwell', website: 'https://www.radwell.com', urlTemplate: '' },
  { name: 'Kaman / Kaman Distribution', website: 'https://www.kamandirect.com', urlTemplate: '' },
  { name: 'BDI (Bearing Distributors)', website: 'https://www.bdi-usa.com', urlTemplate: '' },
  { name: 'Wesco / Anixter', website: 'https://www.wesco.com', urlTemplate: '' },
  { name: 'Graybar', website: 'https://www.graybar.com', urlTemplate: '' },
  { name: 'Border States', website: 'https://www.borderstates.com', urlTemplate: '' },
  { name: 'Rexel / Gexpro', website: 'https://www.rexelusa.com', urlTemplate: '' },
  { name: 'Northern Tool', website: 'https://www.northerntool.com', urlTemplate: '' },
  { name: 'The Home Depot', website: 'https://www.homedepot.com', urlTemplate: 'https://www.homedepot.com/s/{pn}' },
  { name: "Lowe's", website: 'https://www.lowes.com', urlTemplate: 'https://www.lowes.com/search?searchTerm={pn}' },
  { name: 'Amazon Business', website: 'https://www.amazon.com', urlTemplate: 'https://www.amazon.com/s?k={pn}' },
  { name: 'eBay (surplus / used)', website: 'https://www.ebay.com', urlTemplate: 'https://www.ebay.com/sch/i.html?_nkw={pn}' },
];

export function buildOrderUrl(template: string | undefined, pn: string | undefined): string {
  if (!template || !pn) return '';
  return template.replace(/\{pn\}/g, encodeURIComponent(pn.trim()));
}
