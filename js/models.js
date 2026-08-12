/* models.js — constants, schema, emptyData, shared state
   Phase 0 extract: no logic changes.
*/
/* =======================================================================
   حبوبات و خشکبار باقری — دفتر حساب
   فایل تک‌صفحه‌ای، بدون سرور، بدون نیاز به اینترنت برای کارکرد اصلی.
   (فونت وزیرمتن و کتابخانه‌های اکسل/تصویر فقط برای همان قابلیت‌های
   اختیاری از CDN لود می‌شوند؛ اگر اینترنت نبود، بقیه‌ی برنامه عادی کار می‌کند.)
   ======================================================================= */

// Logo assets (external files — not inlined; load only when print/export needs them)
// NOTE: logo-export.png lives at the project root (next to index.html) — there is
// no assets/ folder in this project. The path below matches the real file location.
const APP_LOGO_DATA_URI = './logo-export.png';
const EXPORT_LOGO_DATA_URI = './logo-export.png';

const DB_NAME = 'baqeriDB';
const DB_VERSION = 1;
const STORE = 'appdata';
const RECORD_KEY = 'main';
const PRERESTORE_KEY = 'preRestoreSnapshot';

// schema versioning (data shape itself is unchanged/backward-compatible;
// this is just a marker so future migrations can tell old saves apart)
const CURRENT_SCHEMA_VERSION = 2;

// simple rotating auto-backup, stored as extra rows in the same IndexedDB
// object store — no new library, no new database
const AUTO_BACKUP_PREFIX = 'autoBackup_';
const AUTO_BACKUP_LIST_KEY = 'autoBackupList';
const AUTO_BACKUP_MAX = 5;
const AUTO_BACKUP_INTERVAL_MS = 12*60*60*1000; // حداکثر هر ۱۲ ساعت یک نسخه

const ROUTES = ['شرق','مرکز','غرب'];
const REGION_SUGGESTIONS = ['رویان','نوشهر','چالوس','سیسنگان','متل‌قو'];
const CATEGORY_SUGGESTIONS = ['حبوبات','خشکبار','آجیل','برنج','ادویه','سایر'];
const VISIT_RESULTS = ['سفارش گرفته شد','سفارش گرفته نشد','فروشگاه بسته بود','فقط بازدید/سرکشی'];

let data = emptyData();
let activeTab = 'dashboard';
let dbInstance = null;
let custFilter = 'all';
let custSortByDebt = false;

function emptyData(){
  // suppliers[].payments: legacy {date, amount} or extended
  //   {id, date, amount, method:'cash'|'check', note?,
  //    // when method==='check':
  //    faceAmount, checkNumber?, bank?, issueDate?, dueDate?, status:'pending'|'cleared'|'bounced'}
  // Customer receivable checks remain only in top-level data.checks (unchanged).
  return { products: [], customers: [], invoices: [], payments: [], checks: [], suppliers: [], invoiceSeq: 1000, schemaVersion: CURRENT_SCHEMA_VERSION };
}

