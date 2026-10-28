/**
 * Instaff smoke test: writes each booking or call-back request from the prototype into this Google Sheet.
 *
 * Set up once (about 10 minutes):
 *  1. Create a new Google Sheet. Name it "Instaff smoke test leads".
 *  2. File > Settings > Time zone: (GMT+05:30) India Standard Time > Save settings.
 *  3. Extensions > Apps Script. Delete everything in the editor, paste this whole file, then click Save.
 *  4. Deploy > New deployment. Click the gear next to "Select type" and choose Web app.
 *       Execute as: Me.  Who has access: Anyone.  Click Deploy.
 *  5. Google asks you to authorise. Choose your account, then Advanced > Go to (project name) > Allow.
 *     It shows a warning because you wrote the script yourself and Google has not reviewed it. That is expected.
 *  6. Copy the Web app URL (it ends in /exec).
 *  7. Open the prototype's index.html and paste the URL between the quotes in:  const SHEET_URL = '';
 *  8. Check it: open the /exec URL in your browser. It should say "Instaff lead webhook is running."
 *     Then make a test booking in the prototype. A "Leads" tab appears with the row in it.
 *
 * If you change this script later: Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 * The URL stays the same, so the prototype does not need changing.
 */

const SHEET_NAME = 'Leads';
// Facility was added on 23 Oct, and Source, Medium and Campaign (the UTM values) after it,
// so a sheet that already has rows keeps its columns in place.
const HEADERS = ['Submitted at', 'Ref', 'Type', 'Service', 'Date', 'Start time', 'Team', 'Time on site',
                 'Booking details', 'Note', 'Name', 'Business', 'Phone', 'Area', 'Facility',
                 'Source', 'Medium', 'Campaign'];
const KEYS    = ['ref', 'type', 'service', 'date', 'time', 'team', 'onsite',
                 'details', 'note', 'name', 'business', 'phone', 'area', 'facility',
                 'utm_source', 'utm_medium', 'utm_campaign'];
const MAX_LEN = 1000;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);   // two customers submitting at once still get separate rows
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Ignore anything that did not come from the prototype, and anything a bot filled in
    // (the hidden "website" field is invisible to people, so only bots fill it).
    if (d.source !== 'instaff-prototype' || d.website) return reply({ok: true, skipped: true});
    if (!d.name || !d.phone || !d.service) return reply({ok: false, error: 'missing fields'});

    const sheet = getSheet();
    sheet.appendRow([new Date()].concat(KEYS.map(k => clean(d[k]))));
    return reply({ok: true});
  } catch (err) {
    return reply({ok: false, error: String(err)});
  } finally {
    lock.releaseLock();
  }
}

// Visiting the URL in a browser shows this, which confirms the deployment works.
function doGet() {
  return ContentService.createTextOutput('Instaff lead webhook is running.');
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.getRange('M:M').setNumberFormat('@');   // keep phone numbers as text so +91 survives
  } else if (sheet.getLastColumn() < HEADERS.length) {
    // An older sheet: add the newer headers at the end. Existing rows and columns do not move.
    const from = sheet.getLastColumn();
    sheet.getRange(1, from + 1, 1, HEADERS.length - from)
      .setValues([HEADERS.slice(from)]).setFontWeight('bold');
  }
  return sheet;
}

// Text only, trimmed, length-capped. A leading = + - or @ would make Sheets treat a customer's
// typing as a formula, so those get an apostrophe in front and stay plain text.
function clean(v) {
  let s = (v === undefined || v === null) ? '' : String(v).trim().slice(0, MAX_LEN);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
