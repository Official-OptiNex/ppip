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
  createdAt?: number;
  prefs?: UserPrefs;
}

export interface UserPrefs {
  theme?: 'light' | 'dark' | 'system';
  textSize?: 'standard' | 'large' | 'xlarge';
  desktopAlerts?: boolean;
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
  diameter?: number;
  length?: number;
  covering?: string;
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
}

export interface DocMap {
  parts: Part;
  manufacturers: Manufacturer;
  vendors: Vendor;
  machines: Machine;
  equipment: Equipment;
  orders: OrderGuide;
  settings: Settings;
}
export type DocKind = keyof DocMap;
export const DOC_KINDS: DocKind[] = ['parts', 'manufacturers', 'vendors', 'machines', 'equipment', 'orders', 'settings'];

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
    qty: 'num', minQty: 'num', maxQty: 'num', unit: 'str', unitCost: 'num', vendor: 'str', vendorPartNumber: 'str',
    leadTimeDays: 'num', orderUrl: 'str', imageId: 'str', decommissioned: 'bool', critical: 'bool', machines: 'strs', notes: 'text',
  },
  manufacturers: { name: 'str', website: 'str', urlTemplate: 'str', notes: 'text' },
  vendors: {
    name: 'str', website: 'str', urlTemplate: 'str', contactName: 'str', phone: 'str', email: 'str', accountNumber: 'str',
    leadTimeDays: 'num', preferred: 'bool', notes: 'text',
  },
  machines: { name: 'str', area: 'str', notes: 'text' },
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
    rollerPmDays: 'num', weeklyReportDay: 'num', currency: 'str', printTemplate: 'json', publicUrl: 'str',
  },
};

// Stock status used everywhere (colours: ok=green, low=orange, out=red)
export type StockStatus = 'ok' | 'low' | 'out' | 'retired';
export function stockStatus(p: Pick<Part, 'qty' | 'minQty' | 'decommissioned'>): StockStatus {
  if (p.decommissioned) return 'retired';
  const q = Number(p.qty) || 0;
  if (q <= 0) return 'out';
  if (p.minQty != null && q <= p.minQty) return 'low';
  return 'ok';
}

export const DEFAULT_PRINT_TEMPLATE: PrintTemplate = {
  title: 'Parts Order Request',
  subtitle: 'Maintenance / Process Engineering',
  headerNote: '',
  footerNote: 'Please return completed form to the maintenance office.',
  showLogo: true,
  logoText: 'PPIP',
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
];

export function buildOrderUrl(template: string | undefined, pn: string | undefined): string {
  if (!template || !pn) return '';
  return template.replace(/\{pn\}/g, encodeURIComponent(pn.trim()));
}
