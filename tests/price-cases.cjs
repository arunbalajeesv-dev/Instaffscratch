// Runs real bookings through the app's own calc and price functions and checks the totals exactly.
//   npm install      (once, for jsdom)
//   npm run build:prices && npm test
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const pricesJs = fs.readFileSync(path.join(root, 'app/prices.js'), 'utf8');

// The page is loaded as a customer would load it. withPrices = false imitates a missing app/prices.js.
function loadApp(withPrices, tweak) {
  const dom = new JSDOM(html, {
    url: 'https://example.test/app/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.localStorage.setItem('instaff.verified', '9876543210');   // skip the sign-in screen
      w.fetch = async () => ({ ok: false });
      if (withPrices) { w.eval(pricesJs); if (tweak) tweak(w.INSTAFF_PRICES); }
    }
  });
  const w = dom.window;
  return { w, byId: w.eval('byId'), SERVICES: w.eval('SERVICES') };
}

// Each case sets only the answers the booking needs; everything else stays at the service's own default.
const CASES = [
  ['Toilet, medium, 2 WC, 2 urinals, 2 basins, 1 mirror', 240, 'toilet_cleaning',
    st => { st.facility = 'fac_medium'; Object.assign(st.qty, { wc_qty: 2, urinal_qty: 2, wash_basin_qty: 2, mirror_qty: 1, countertop_qty: 0 }); }],
  ['Opening & Closing, closing, medium, 2 fans, 250 sqft carpet, 500 sqft outdoor', 520, 'opening_closing',
    st => { st.service = 'closing'; st.pkg = 'pkg_medium'; Object.assign(st.qty, { fan_qty: 2, carpet_sqft: 250, outdoor_sqft: 500 }); }],
  ['Service-Time, medium, 120 minutes, 2 sofas', 370, 'service_time_cleaning',
    st => { st.pkg = 'pkg_medium'; st.duration = 120; st.qty.sofa_qty = 2; }],
  ['Store, SC03, 10 deep racks, 250 sqft wall, 7 fixtures', 620, 'store_cleaning',
    st => { st.size = 'SC03'; Object.assign(st.qty, { deep_rack_bays: 10, wall_area_sqft: 250, fixture_count: 7 }); }],
  ['Kitchen, medium, tile, 2 extra counters, 1 two-door fridge, 1 extra hob', 365, 'kitchen_equipment_cleaning',
    st => { st.size = 'medium'; st.tile = true; Object.assign(st.qty, { extra_counters_qty: 2, fridge_2door: 1, extra_hob_qty: 1 }); }],
  ['KST, 151 to 350 pcs, 2 trolleys, 150 pcs bulk sanitisation', 250, 'kst_dishwashing',
    st => { st.pkg = 'pkg_moderate'; Object.assign(st.qty, { trolley_qty: 2, bulk_sanitisation_qty: 150 }); }],
  ['POS, 3 people, 2 hours + 1 extra hour', 1080, 'pos_support',
    st => { st.dur = 'dur_2'; st.extra = 1; st.people = 3; }],
  ['Guest Server, 2 people, 4 hours', 800, 'guest_assistance_server',
    st => { st.dur = 'dur_4'; st.extra = 0; st.people = 2; }],
  ['Stock Counting, warehouse, 501 to 1,000 units, 11 to 25 SKUs', 385, 'stock_counting',
    st => { st.stock_type = 'warehouse'; st.quantity_band = 'q3'; st.sku_band = 's2'; }],
  ['Packing + Tagging, 251 to 500 units, 6 to 10 SKUs, mixed stock', 469, 'packing_tagging_scanning',
    st => { st.task = 'packing_tagging'; st.qty_band = 'medium'; st.sku_band = 'sku_6_10'; st.stock_condition = 'mixed'; }],
  ['Garbage, mixed, dry Large + wet Medium, lift to floor 2, 100 ft', 359, 'garbage_waste',
    st => { Object.assign(st, { waste: 'mixed', dry: 'dry_large', wet: 'wet_medium', sameFloor: false, lift: true, floors: 2, extraFt: 2 }); }],
  ['Garbage, dry only, "More" with 2 extra blocks, same floor', 460, 'garbage_waste',
    st => { Object.assign(st, { waste: 'dry', dry: 'dry_custom', dryBlocks: 2, sameFloor: true, extraFt: 0 }); }],
  ['Loading & Unloading together, 40 medium cartons + 10 large furniture, stairs to floor 2, 100 ft', 3176, 'loading_unloading',
    st => { Object.assign(st, { service_type: 'loading_unloading', ground_floor: false, service_lift: false, floor_number: 2, extraFt: 2,
      lines: [{ size: 'medium', qty: 40, types: ['carton_box'], crate: '', furn: '' },
              { size: 'large', qty: 10, types: ['furniture_equipment'], crate: '', furn: 'sofas' }] }); }]
];

let failed = 0;
const fmt = n => (n === null ? 'on call' : String(n));
function check(label, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(96)} expected ${fmt(want).padStart(7)}   got ${fmt(got).padStart(7)}`);
}

const { w, byId, SERVICES } = loadApp(true);
function price(id, set) {
  const svc = byId(id), st = svc.init();
  set(st);
  const r = svc.calc(st);
  return { svc, st, r, p: w.priceFor(svc, st, r) };
}

console.log('--- Bookings through the real calc and price functions');
CASES.forEach(([label, want, id, set]) => check(label, price(id, set).p, want));

console.log('\n--- Safety rules');
// Anything the customer chose that has no price makes the whole booking "on call", never a partial figure.
{
  const t = loadApp(true, P => { delete P.services.toilet_cleaning.items.urinal_qty; });
  const svc = t.byId('toilet_cleaning'), st = svc.init();
  CASES[0][3](st);
  check('Toilet with the urinal price removed shows "on call", not a partial total', t.w.priceFor(svc, st, svc.calc(st)), null);
  const st2 = svc.init(); Object.assign(st2.qty, { wc_qty: 2, urinal_qty: 0, wash_basin_qty: 0, mirror_qty: 0 }); st2.facility = 'fac_medium';
  check('Same file, but no urinals chosen, still prices (150 + 2 x 15)', t.w.priceFor(svc, st2, svc.calc(st2)), 180);
}
// A missing app/prices.js: every service shows "on call".
{
  const t = loadApp(false);
  const all = t.SERVICES.every(s => { const st = s.init(); return t.w.priceFor(s, st, s.calc(st)) === null; });
  check(`Without app/prices.js all ${t.SERVICES.length} services show "on call"`, all, true);
}
// Anything that goes to a call (care) has no price.
{
  const { p } = price('toilet_cleaning', st => { st.facility = 'fac_complex'; Object.assign(st.qty, { wc_qty: 100, urinal_qty: 100, wash_basin_qty: 100, mirror_qty: 100, countertop_qty: 50 }); });
  check('A booking that needs a call (more than 8 hours of work) has no price', p, null);
}
// live = N hides a service, Y or blank shows it.
{
  const t = loadApp(true, P => { P.services.pos_support.settings.live = 'N'; P.services.stock_counting.settings.live = ''; });
  const live = t.w.eval('serviceLive');
  check('live = N hides the service', live('pos_support'), false);
  check('live = blank shows the service', live('stock_counting'), true);
  check('live = Y shows the service', live('toilet_cleaning'), true);
}
// Every service in the file has a price rule, and the settings were read as described.
{
  const ids = Object.keys(w.INSTAFF_PRICES.services).sort().join(',');
  const app = SERVICES.map(s => s.id).sort().join(',');
  check('The price file and the app list the same 13 services', ids === app, true);
  const A = w.INSTAFF_PRICES.all.settings;
  check('tax_included is Y (no GST added)', A.tax_included, 'Y');
  check('show_price_as is Fixed (label "Price")', w.eval('priceLabel')(), 'Price');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
