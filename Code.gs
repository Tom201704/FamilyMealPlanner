/**
 * Dinner Planner — shared storage (Google Apps Script).
 *
 * Stores the whole planner as one JSON file in the Google Drive of the person
 * who deploys this script. Anyone with the web-app URL can read and write —
 * no login, no key. Setup: see README.md, section "Shared storage".
 *
 * Safety:
 *  - Every save carries the revision it was based on. If someone else saved in
 *    between, the save is refused with the current data and the page replays
 *    its change on top (nothing gets overwritten silently).
 *  - Once per day the previous state is copied into the Drive folder
 *    "Dinner Planner backups" (kept for BACKUP_KEEP_DAYS days).
 */

const FILE_NAME = 'dinner-planner-db.json';
const BACKUP_FOLDER = 'Dinner Planner backups';
const BACKUP_KEEP_DAYS = 60;

function emptyDb_() {
  return { version: 1, rev: 0, tags: ['Tom likes', 'Make ahead'], recipes: [], weeks: {} };
}

function dbFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (e) { /* deleted → create a new one */ }
  }
  const f = DriveApp.createFile(FILE_NAME, JSON.stringify(emptyDb_(), null, 1), 'application/json');
  props.setProperty('FILE_ID', f.getId());
  return f;
}

function readDb_() {
  const text = dbFile_().getBlob().getDataAsString('UTF-8');
  return text ? JSON.parse(text) : emptyDb_();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function backupOncePerDay_(text) {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'Europe/Zurich', 'yyyy-MM-dd');
  if (props.getProperty('LAST_BACKUP') === today) return;
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  folder.createFile(`dinner-planner-${today}.json`, text, 'application/json');
  // prune old backups
  const cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) f.setTrashed(true);
  }
  props.setProperty('LAST_BACKUP', today);
}

function doGet() {
  return json_({ ok: true, db: readDb_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'Busy, please try again.' });
  try {
    const body = JSON.parse(e.postData.contents);
    const db = body.db;
    if (!db || !Array.isArray(db.recipes) || !Array.isArray(db.tags) || typeof db.weeks !== 'object') {
      return json_({ ok: false, error: 'Invalid data — not saved.' });
    }
    const file = dbFile_();
    const currentText = file.getBlob().getDataAsString('UTF-8');
    const current = currentText ? JSON.parse(currentText) : emptyDb_();
    if ((current.rev || 0) !== body.baseRev) {
      return json_({ ok: false, conflict: true, db: current });
    }
    if (currentText) backupOncePerDay_(currentText);
    db.rev = (current.rev || 0) + 1;
    db.savedAt = new Date().toISOString();
    file.setContent(JSON.stringify(db, null, 1));
    return json_({ ok: true, rev: db.rev });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
