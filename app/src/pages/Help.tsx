import { useMemo, useState, type ReactNode } from 'react';
import {
  Undo2, IdCard, Menu, ShoppingCart, GraduationCap, Wrench, CheckCircle2, AlertTriangle, XCircle, Archive, PackageMinus, PackagePlus, ClipboardCheck,
  Smartphone, Search, Flame, Printer, Wifi, Usb, AudioWaveform, Timer, Cylinder, Languages, Camera, Type, Tag, Scissors, Lock, Eye, History, Download,
  HelpCircle, Plus, Trash2, LogIn, KeyRound, ChevronDown, ClipboardList, PackageCheck, Hourglass, Factory,
} from 'lucide-react';
import { DEFAULT_WEEKLY_DAYS } from '../../../shared/pm';
import { startTour } from '../components/Tour';
import { SearchInput, rich } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../lib/i18n';

interface Topic { icon: ReactNode; title: string; steps?: string[]; text?: string }
interface Section { id: string; title: string; icon: ReactNode; topics: Topic[] }

// Written in English; every line goes through t() so it shows in Spanish too. **bold** marks button names.
function sections(): Section[] {
  return [
    {
      id: 'start', title: 'Getting started', icon: <LogIn />, topics: [
        { icon: <IdCard />, title: 'Sign in with your badge', steps: ['At the sign-in screen, just scan your employee badge — no clicking needed.', 'First time: sign in with your name and password, click **Add my badge** at the top of the screen and scan it once.'] },
        { icon: <Languages />, title: 'English or Spanish', steps: ['Pick **English** or **Español** at the top of the sign-in screen.', 'After you sign in, change it any time in **My settings** (click your name, bottom-left). It is saved to your account on every computer.'] },
        { icon: <Type />, title: 'Make the text bigger', steps: ['Click your name (bottom-left) → **My settings**.', 'Under **Text size** pick **Large** or **Extra large**.'] },
        { icon: <Camera />, title: 'Add your profile picture', steps: ['Click your name (bottom-left) → **My settings** → **Profile picture**.', 'Click **Upload from this PC**, or **Take photo with phone** and scan the QR code with your phone camera.'] },
        { icon: <GraduationCap />, title: 'Take the guided tour', text: 'A 2-minute walk through the app. Click **Take the guided tour** at the top of this page any time.' },
      ],
    },
    {
      id: 'parts', title: 'Parts & stock', icon: <PackageMinus />, topics: [
        { icon: <CheckCircle2 color="var(--ok)" />, title: 'Green — In stock', text: 'More than the “reorder at” number.' },
        { icon: <AlertTriangle color="var(--warn)" />, title: 'Orange — Running low', text: 'At or below the “reorder at” number. Time to order.' },
        { icon: <ShoppingCart color="var(--danger)" />, title: 'Red — Order now', text: 'Almost gone (at or below the “order now” number, or half the reorder point if that is blank). Order today.' },
        { icon: <XCircle color="var(--danger)" />, title: 'Red — Out of stock', text: 'Zero left. Order now.' },
        { icon: <Archive />, title: 'Gray — Decommissioned', text: 'Not used anymore. Hidden from the list and alerts.' },
        { icon: <Search />, title: 'Find a part', text: 'Type in the search bar at the top (or press **/**). Name, part number, manufacturer, location or machine all work.' },
        { icon: <PackageMinus />, title: 'I took parts off the shelf', steps: ['Click the **Quick log** button (bottom-right, on every page) → **Used / took parts**.', 'Type the part, enter how many and pick the machine. Done — stock goes down and it is logged.'] },
        { icon: <PackagePlus />, title: 'Parts came in', text: 'Click **Quick log** → **Received parts**, or open the part and click **Receive**. Enter how many arrived.' },
        { icon: <ClipboardCheck />, title: 'I counted the shelf', text: 'Open the part → **Count** and enter what is actually there.' },
        { icon: <Plus />, title: 'Add a new part', steps: ['**Parts** → **Add part**.', 'Fill in the name, part number and manufacturer — the order link builds itself for most suppliers.', 'Set **Reorder at** (turns orange) and, if you like, **Order now at** (turns red).'] },
        { icon: <Smartphone />, title: 'Add a part photo with your phone', steps: ['Edit the part → **Take photo with phone**.', 'Scan the QR code with your phone camera and tap the link.', 'Take the picture and tap **Send**. It appears on the computer by itself.'] },
      ],
    },
    {
      id: 'orders', title: 'Ordering', icon: <ClipboardList />, topics: [
        { icon: <Printer />, title: 'Order guide instead of paper', steps: ['**Order Guides** → **New order guide**.', 'Type the parts — it fills in part numbers from inventory.', 'Click **Print** (or **Save & print**).'] },
        { icon: <ShoppingCart />, title: 'Order everything that is low', text: 'Click **From low stock** — it builds the list of everything orange and red for you.' },
        { icon: <PackageCheck />, title: 'The order arrived', text: 'Open the order guide, set it to **Ordered**, and when it arrives click **Receive into stock**. Every linked part goes up by the amount ordered.' },
      ],
    },
    {
      id: 'machines', title: 'Machines, knives, welders', icon: <Factory />, topics: [
        { icon: <Wrench />, title: 'Machine PMs', steps: ['Open **PMs** → **Log a PM**.', 'Pick the machine, the date, weekly or monthly, and (optionally) who did it.', 'The next due date fills in by itself. Overdue machines turn red.'] },
        { icon: <Flame />, title: 'Hot knives & rollers', text: 'Use **Install**, **Remove** and **Move**. The page counts how many days each one has been on its machine. When you remove one you can pick a reason (wear, damage…) — it is optional.' },
        { icon: <History />, title: 'Install and pull dates', text: 'Open a knife or roller: **Install & pull dates** lists every machine it was on, when it went on, when it came off and how many days. Forgot to log one? Click **Add past install**.' },
        { icon: <Hourglass />, title: 'How long do they last?', text: 'On the Knives or Rollers page click **How long they last**: average, longest and shortest life, by type, by machine and by removal reason.' },
        { icon: <AudioWaveform />, title: 'Sonic welders: change a horn or anvil', steps: ['Open **Sonic Welders**. Each welder has one horn and one anvil.', 'On the welder card click **Change horn** (or **Change anvil**).', 'Pick the new one from the spares (or type a new tag), choose why the old one came off, and click **Confirm**. The old one goes back to spares.'] },
        { icon: <Timer />, title: 'Log downtime or a glitch', steps: ['Open **Downtime** → **Log downtime**.', 'Pick the machine, how many minutes it was down and the kind of problem.', 'Write what happened and what fixed it. Welder problems: use **Log glitch** on the welder card (it asks for the speed in bags per minute).'] },
        { icon: <Cylinder />, title: 'Log a crushed core', text: 'Open **Crushed Cores** → **Add crushed core**, scan or type the tag number and press **Enter**. Date and time fill in by themselves; the window stays open for the next one.' },
      ],
    },
    {
      id: 'labels', title: 'Labels & printing', icon: <Tag />, topics: [
        { icon: <Tag />, title: 'Print part labels', steps: ['Open a part → **Label**, or go to **More tools** → **Print Labels** and tick the parts.', 'Pick the label size and click **Print**.'] },
        { icon: <Scissors />, title: 'Small labels for bins and boxes', text: 'Pick **2 per label** up to **12 per label**. They print on one 4×6 Zebra label with dashed cut lines — cut along the lines with scissors.' },
        { icon: <Printer />, title: 'Zebra printer settings', text: 'In the print window: pick the **Zebra** printer, paper size **4 × 6 in**, margins **None**, scale **100%**, and turn off **Headers and footers**.' },
        { icon: <Tag />, title: 'Labels for boxes, shelves or anything', text: 'In **Print Labels** choose **Custom text**, type one label per line, and print. Good for bins, boxes, shelves and tool cribs.' },
      ],
    },
    {
      id: 'faq', title: 'Common questions', icon: <HelpCircle />, topics: [
        { icon: <Undo2 />, title: 'I made a mistake. Can I undo it?', text: 'Yes. After every change a bar appears at the bottom with an **Undo** button (or press **Ctrl+Z**). For older changes, open **Activity Log** (under More tools) and click **Undo** next to it — for up to 30 days.' },
        { icon: <Eye />, title: 'Why can’t I change anything?', text: 'Your account is a **Viewer** (look only). Ask an admin to make you an **Editor**.' },
        { icon: <KeyRound />, title: 'I forgot my password', text: 'Ask an admin to reset it (Admin → Users). Or sign in with your badge.' },
        { icon: <IdCard />, title: 'My badge does not work', text: 'Sign in with your name and password, then go to **My settings** → **Change badge** and scan it again. If it still fails, ask an admin to check your badge number.' },
        { icon: <Menu />, title: 'I can’t find a page', text: 'Less-used pages (reports, analytics, suppliers, labels, import/export) are under **More tools** in the menu. On a phone, tap **More** at the bottom.' },
        { icon: <History />, title: 'Who changed this?', text: 'Open **Activity Log** (under More tools). Every change shows who did it and when.' },
        { icon: <Trash2 />, title: 'Delete or retire?', text: '**Retire / scrap** (or **Decommission** for parts) keeps it on record but hides it. **Delete permanently** removes it for good — use it only for mistakes.' },
        { icon: <Wifi />, title: 'The internet dropped', text: 'Keep working. Changes are saved on your computer and sync when the connection is back. The green **Live** dot means you are connected.' },
        { icon: <Download />, title: 'Can I get it into Excel?', text: 'Yes — most pages have a download button, and **More tools** → **Import / Export** downloads everything.' },
        { icon: <Smartphone />, title: 'Can I use my phone?', text: 'Yes. Open the website and choose **Add to Home Screen** — it then works like an app.' },
        { icon: <Usb />, title: 'Running from a USB stick', text: 'Open **Start Process Engineer** on the stick. It uses the same data as the website.' },
        { icon: <Lock />, title: 'Is it private?', text: 'Yes. Only people with an account can sign in. Accounts are created by an admin.' },
      ],
    },
  ];
}

export function HelpPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ start: true, faq: true });
  const all = useMemo(() => sections(), []);
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hit = (tp: Topic) => !words.length || words.every((w) => [tp.title, tp.text, ...(tp.steps || [])].filter(Boolean).map((x) => t(x!).toLowerCase()).join(' ').includes(w));
  const shown = all.map((s) => ({ ...s, topics: s.topics.filter(hit) })).filter((s) => s.topics.length);

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div><h1>{t('Help & common questions')}</h1><p className="muted" style={{ marginTop: 6 }}>{t('Short how-tos. Everything saves by itself and shows up on everyone’s screen right away.')}</p></div>
        <button className="btn primary lg" onClick={() => startTour()}><GraduationCap />{t('Take the guided tour')}</button>
      </div>
      <div className="row wrap" style={{ gap: '1rem' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search help… (e.g. badge, label, undo)" />
        <LangSwitch />
      </div>
      <div className="chips" role="navigation" aria-label={t('Topics')}>
        {all.map((s) => <a key={s.id} className="filter-chip" href={`#/help`} onClick={(e) => { e.preventDefault(); setOpen((o) => ({ ...o, [s.id]: true })); document.getElementById(`help-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{t(s.title)}</a>)}
      </div>

      {shown.length === 0 && <div className="card card-pad muted">{t('Nothing found. Try another word, or ask an admin.')}</div>}
      {shown.map((s) => {
        const isOpen = !!words.length || open[s.id];
        return (
          <section key={s.id} id={`help-${s.id}`} className="card help-section">
            <button className="card-head help-toggle" onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))} aria-expanded={isOpen}>
              <span className="li-icon info">{s.icon}</span><h2 className="grow" style={{ fontSize: '1.3rem' }}>{t(s.title)}</h2>
              <span className="muted small">{s.topics.length}</span><ChevronDown className="chev" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} />
            </button>
            {isOpen && (
              <div className="list">
                {s.topics.map((tp) => (
                  <div key={tp.title} className="list-item help-topic">
                    <span className="li-icon">{tp.icon}</span>
                    <div className="grow">
                      <b style={{ fontSize: '1.08rem' }}>{t(tp.title)}</b>
                      {tp.text && <div className="muted" style={{ marginTop: 2 }}>{rich(tp.text)}</div>}
                      {tp.steps && <ol className="help-steps">{tp.steps.map((st) => <li key={st}>{rich(st)}</li>)}</ol>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <p className="small muted">{t('Keyboard:')} <span className="kbd-hint">/</span> {t('search')} · <span className="kbd-hint">Esc</span> {t('close windows')} · <span className="kbd-hint">Ctrl</span>+<span className="kbd-hint">Z</span> {t('undo')} · <span className="kbd-hint">Ctrl</span>+<span className="kbd-hint">Enter</span> {t('save a part')}</p>
      <p className="small muted">{t('PM rule: the next PM is due {n} days after the last PM of any type; a monthly PM is needed once a month.', { n: DEFAULT_WEEKLY_DAYS })}</p>
    </div>
  );
}
