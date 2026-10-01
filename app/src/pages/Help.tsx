import { DEFAULT_WEEKLY_DAYS } from '../../../shared/pm';
import { startTour } from '../components/Tour';
import { IdCard, Menu, ShoppingCart, GraduationCap, Wrench, CheckCircle2, AlertTriangle, XCircle, Archive, PackageMinus, PackagePlus, ClipboardCheck, Smartphone, Search, Flame, Printer, Wifi, Usb } from 'lucide-react';

export function HelpPage() {
  const Item = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="list-item"><span className="li-icon info">{icon}</span><div className="grow"><b>{title}</b><div className="muted">{children}</div></div></div>
  );
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <div><h1>How to use Process Engineer</h1><p className="muted" style={{ marginTop: 6 }}>A quick guide. Everything saves automatically and shows up on everyone's screen right away.</p></div>
        <button className="btn primary lg" onClick={() => startTour()}><GraduationCap />Take the guided tour</button>
      </div>

      <div className="card">
        <div className="card-head"><h3>What the colors mean</h3></div>
        <div className="list">
          <Item icon={<CheckCircle2 color="var(--ok)" />} title="Green — In stock">More than the “reorder at” number.</Item>
          <Item icon={<AlertTriangle color="var(--warn)" />} title="Orange — Running low">At or below the “reorder at” number. Time to order.</Item>
          <Item icon={<ShoppingCart color="var(--danger)" />} title="Red — Order now">Almost gone (at or below the “order now” number, or half the reorder point if that's blank). Order today.</Item>
          <Item icon={<XCircle color="var(--danger)" />} title="Red — Out of stock">Zero left. Order now.</Item>
          <Item icon={<Archive />} title="Gray — Decommissioned">Not used anymore. Hidden from the list and alerts (tick the box on the part to do this).</Item>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Everyday tasks</h3></div>
        <div className="list">
          <Item icon={<Search />} title="Find a part">Type in the search bar at the top (or press <span className="kbd-hint">/</span>). Name, part number, manufacturer, location or machine all work.</Item>
          <Item icon={<PackageMinus />} title="Took a part off the shelf">Click <b>Take</b> on the part, enter how many, pick the machine. Stock goes down and it's logged.</Item>
          <Item icon={<PackagePlus />} title="Parts came in">Click <b>Add / Receive</b> and enter how many arrived.</Item>
          <Item icon={<ClipboardCheck />} title="Counted the shelf">Open the part → <b>Count</b> and enter what's actually there.</Item>
          <Item icon={<Smartphone />} title="Add a photo with your phone">Edit a part → <b>Take photo with phone</b> → scan the QR code with your phone camera → take the picture → Send. It appears on the computer by itself.</Item>
          <Item icon={<Printer />} title="Order guide instead of paper">Order Guides → <b>New order guide</b>. Type the parts (it fills in part numbers from inventory), then <b>Print</b>. “From low stock” builds the list for you.</Item>
          <Item icon={<Wrench />} title="Machine PMs">Open <b>PMs</b> → <b>Log a PM</b>: pick the machine, the date, weekly or monthly, and (optionally) who did it. The next due date fills in automatically: {DEFAULT_WEEKLY_DAYS} days after the last PM of any type, and a monthly PM once a month. Overdue machines turn red.</Item>
          <Item icon={<Flame />} title="Hot knives & rollers">Install, move or remove them. The page counts how many days each one has been on its machine.</Item>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Good to know</h3></div>
        <div className="list">
          <Item icon={<IdCard />} title="Sign in with your badge">At the sign-in screen just scan your employee badge — no clicking. First time: sign in with your name and password, then click <b>Add my badge</b> (top of the screen) and scan it once.</Item>
          <Item icon={<Menu />} title="Can't find a page?">Less-used pages (reports, analytics, suppliers, labels, import/export) are under <b>More tools</b> in the menu.</Item>
          <Item icon={<Wifi />} title="Live updates">The green “Live” dot means you're connected. If the internet drops, keep working — changes are saved on your computer and sync when it's back.</Item>
          <Item icon={<Usb />} title="Running from a USB stick">Open <b>Start Process Engineer</b> on the stick. It uses the same data as the website.</Item>
          <Item icon={<Smartphone />} title="On your phone">Open the website and choose “Add to Home Screen” — it then works like an app.</Item>
          <Item icon={<CheckCircle2 />} title="Text too small or too big?">Click your name (bottom-left) → <b>Text size</b>.</Item>
        </div>
      </div>
      <p className="small muted">Keyboard: <span className="kbd-hint">/</span> search · <span className="kbd-hint">Esc</span> close windows · <span className="kbd-hint">Ctrl</span>+<span className="kbd-hint">Enter</span> save a part.</p>
    </div>
  );
}
