/**
 * The Google Apps Script the team pastes into script.google.com. It runs in
 * their own Gmail, which has a daily read quota and a 6-minute run limit, so
 * the one-year import goes in chunks: each hourly run reads at most
 * THREADS_PER_RUN threads, remembers where it stopped (Script Properties)
 * and the next run carries on. A quota error just ends the run early.
 */
export function appsScript(url: string, token: string) {
  return `// TeamHQ: Airbnb email sync.
// Runs inside your own Gmail: finds Airbnb's booking, change, cancellation
// and review emails and sends only those to TeamHQ. Guest message threads
// and everything else in the mailbox are never read or sent.
const TEAMHQ_URL = '${url}';
const TEAMHQ_TOKEN = '${token}';
const SEARCH = 'from:(airbnb.com) -subject:(RE) -subject:(message) -subject:(inquiry) subject:(review OR confirmed OR cancelled OR canceled OR cancellation OR altered OR change OR changed OR updated)';
const THREADS_PER_RUN = 300;

// Runs every hour (see setUp): the last 3 days, then the next chunk of the
// one-year import if it isn't finished. Duplicates are skipped by TeamHQ.
function syncRecent() {
  send_(SEARCH + ' newer_than:3d', 0, 100);
  continueImport_();
}

// Starts (or restarts) the one-year import. It continues every hour by itself.
function backfillLastYear() {
  PropertiesService.getScriptProperties().setProperty('IMPORT_AT', '0');
  continueImport_();
}

function continueImport_() {
  const props = PropertiesService.getScriptProperties();
  const at = props.getProperty('IMPORT_AT');
  if (at === null) return;
  const next = send_(SEARCH + ' newer_than:365d', Number(at), THREADS_PER_RUN);
  if (next === null) {
    props.deleteProperty('IMPORT_AT');
    Logger.log('One-year import finished');
  } else {
    props.setProperty('IMPORT_AT', String(next));
    Logger.log('Import paused at thread ' + next + '. The next hourly run continues.');
  }
}

// Returns null when the search is exhausted, otherwise where to resume.
function send_(query, start, maxThreads) {
  const began = Date.now();
  const end = start + maxThreads;
  try {
    while (start < end && Date.now() - began < 4 * 60 * 1000) {
      const threads = GmailApp.search(query, start, Math.min(40, end - start));
      if (!threads.length) return null;
      const messages = [];
      GmailApp.getMessagesForThreads(threads).forEach(function (list) {
        list.forEach(function (m) {
          messages.push({ id: m.getId(), subject: m.getSubject(), from: m.getFrom(), date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 40000) });
        });
      });
      for (let i = 0; i < messages.length; i += 40) {
        const res = UrlFetchApp.fetch(TEAMHQ_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + TEAMHQ_TOKEN },
          payload: JSON.stringify({ messages: messages.slice(i, i + 40) }),
          muteHttpExceptions: true,
        });
        Logger.log(res.getResponseCode() + ' ' + res.getContentText());
        if (res.getResponseCode() !== 200) return start;
      }
      start += threads.length;
    }
  } catch (e) {
    // Usually Gmail's daily quota. Nothing is lost: the next run retries.
    Logger.log('Stopped early: ' + e);
  }
  return start;
}

// Run this once: schedules the hourly sync and starts the one-year import.
function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncRecent').timeBased().everyHours(1).create();
  backfillLastYear();
}
`;
}
