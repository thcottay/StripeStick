/**
 * StripeStick waitlist: receives submissions from the site's server and writes them to this
 * spreadsheet. Paste into Extensions > Apps Script on the sheet. Setup steps are in the README.
 *
 * The shared secret lives in Script Properties (SHARED_SECRET), never in this file.
 */

var SHEET_NAME = 'Waitlist';
var HEADERS = [
  'Email',
  'First name',
  'Signed up',
  'Consent wording',
  'Last updated',
  'Fault',
  'Handicap',
  'Practices at',
  'Would test prototype',
  'Heard about us',
  'ZIP or country',
  'Would pay',
  'Answers received',
];
var ANSWER_COLUMNS = {
  fault: 'Fault',
  handicap: 'Handicap',
  practice: 'Practices at',
  prototype: 'Would test prototype',
  source: 'Heard about us',
  location: 'ZIP or country',
  price: 'Would pay',
};

function doPost(e) {
  var result;
  try {
    result = handle_(JSON.parse(e.postData.contents));
  } catch (err) {
    console.error(err);
    result = { ok: false, error: 'server_error' };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(body) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret || body.secret !== secret) return { ok: false, error: 'unauthorized' };

  // One write at a time, so simultaneous sign-ups can't take the same row.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_();
    if (body.action === 'signup') return saveSignup_(sheet, body);
    if (body.action === 'answers') return saveAnswers_(sheet, body);
    return { ok: false, error: 'unknown_action' };
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var emails = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < emails.length; i++) {
    if (emails[i][0] === email) return i + 2;
  }
  return 0;
}

function readRow_(sheet, row) {
  return sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
}

// Plain-text format stops Sheets reading input as formulas and keeps ZIP codes like 02134 intact.
function writeRow_(sheet, row, values) {
  sheet.getRange(row, 1, 1, HEADERS.length).setNumberFormat('@').setValues([values]);
}

function column_(name) {
  return HEADERS.indexOf(name);
}

function saveSignup_(sheet, body) {
  var row = findRow_(sheet, body.email);
  var values;
  if (row) {
    values = readRow_(sheet, row);
    values[column_('First name')] = body.firstName;
  } else {
    row = sheet.getLastRow() + 1;
    values = HEADERS.map(function () { return ''; });
    values[column_('Email')] = body.email;
    values[column_('First name')] = body.firstName;
    values[column_('Signed up')] = body.at;
    values[column_('Consent wording')] = body.consentText;
  }
  values[column_('Last updated')] = body.at;
  writeRow_(sheet, row, values);
  return { ok: true };
}

function saveAnswers_(sheet, body) {
  var row = findRow_(sheet, body.email);
  if (!row) return { ok: true, found: false };
  var values = readRow_(sheet, row);
  Object.keys(ANSWER_COLUMNS).forEach(function (key) {
    values[column_(ANSWER_COLUMNS[key])] = body.answers[key] || '';
  });
  values[column_('Answers received')] = body.at;
  values[column_('Last updated')] = body.at;
  writeRow_(sheet, row, values);
  return { ok: true, found: true };
}
