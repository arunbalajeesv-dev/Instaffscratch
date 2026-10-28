// Returns the leads from the Google Sheet to the signed-in admin only.
// The Sheet's secret token lives in the LEADS_TOKEN environment variable and never reaches the browser.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmsvcbyxthsjnujyigly.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_kT_tqnOMqszanNmHDenqnQ_UHznHdeN';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({error: 'Sign in first.'});

  try {
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {headers: {apikey: SUPABASE_ANON_KEY, Authorization: auth}});
    if (!who.ok) return res.status(401).json({error: 'Your session has expired. Sign in again.'});

    const token = process.env.LEADS_TOKEN, sheet = process.env.SHEET_URL;
    if (!token || !sheet) return res.status(503).json({error: 'Leads are not configured yet (LEADS_TOKEN or SHEET_URL missing).'});

    const r = await fetch(sheet + '?action=leads&token=' + encodeURIComponent(token), {redirect: 'follow'});
    const data = await r.json().catch(() => null);
    if (!data || !data.ok) {
      return res.status(502).json({error: data && data.error === 'unauthorised'
        ? 'The Sheet rejected the token. Check LEADS_TOKEN in Apps Script > Project Settings > Script properties.'
        : 'Could not read the Sheet. Redeploy the Apps Script as a new version and try again.'});
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({error: 'Something went wrong reading the leads.'});
  }
};
