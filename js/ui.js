/* ui.js — shared UI helpers (toast, modal/sheet, formatting)
   Phase 0 extract: no logic changes.
*/
// ---------- small utilities ----------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function faToEnDigits(str){
  if(str===null || str===undefined) return '';
  const map = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
               '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
               '٫':'.','،':'','٬':'',',':''};
  // ارقام فارسی/عربی + جداکننده‌های هزار (٬ و ,) و اعشار فارسی
  return String(str).replace(/[۰-۹٠-٩٫،٬,]/g, ch=>map[ch]!==undefined?map[ch]:ch);
}
function enToFaDigits(str){
  const map = {'0':'۰','1':'۱','2':'۲','3':'۳','4':'۴','5':'۵','6':'۶','7':'۷','8':'۸','9':'۹'};
  return String(str).replace(/[0-9]/g, ch=>map[ch]||ch);
}
function numVal(el){
  if(!el) return 0;
  // faToEnDigits جداکننده‌ها را حذف می‌کند تا parseFloat روی "4,000,000" مقدار 4000000 بدهد
  return parseFloat(faToEnDigits(el.value))||0;
}

/**
 * فرمت زنده مبلغ هنگام تایپ: جداکننده سه‌رقمی، حفظ سبک رقم (فارسی/انگلیسی).
 * فقط رشته نمایش را می‌سازد؛ مقدار عددی از طریق numVal/faToEnDigits خوانده می‌شود.
 */
function formatLiveAmount(str){
  if(str===null || str===undefined) return '';
  const raw = String(str);
  if(!raw) return '';
  const preferFa = /[۰-۹]/.test(raw);
  let cleaned = faToEnDigits(raw).replace(/[^\d.]/g, '');
  if(!cleaned) return '';
  const dot = cleaned.indexOf('.');
  let intPart = dot >= 0 ? cleaned.slice(0, dot) : cleaned;
  let fracPart = dot >= 0 ? cleaned.slice(dot + 1).replace(/\./g, '') : null;
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if(intPart === '' && fracPart !== null) intPart = '0';
  if(intPart === '') return '';
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = fracPart !== null ? (grouped + '.' + fracPart) : grouped;
  if(preferFa) out = enToFaDigits(out).replace(/,/g, '٬');
  return out;
}

/** تعداد ارقام (و نقطه اعشار) قبل از موقعیت cursor برای حفظ محل مکان‌نما */
function _countNumericChars(str){
  return faToEnDigits(str).replace(/[^\d.]/g, '').length;
}

function reformatAmountInputEl(el){
  if(!el || el.tagName !== 'INPUT') return;
  const oldVal = el.value;
  const sel = (typeof el.selectionStart === 'number') ? el.selectionStart : oldVal.length;
  const digitsBefore = _countNumericChars(oldVal.slice(0, sel));
  const formatted = formatLiveAmount(oldVal);
  if(formatted === oldVal) return;
  el.value = formatted;
  // مکان‌نما را بعد از همان تعداد رقم قرار بده
  let pos = formatted.length;
  let seen = 0;
  for(let i = 0; i < formatted.length; i++){
    if(/[\d۰-۹٠-٩.]/.test(formatted[i])){
      seen++;
      if(seen >= digitsBefore){
        pos = i + 1;
        break;
      }
    }
  }
  try{ el.setSelectionRange(pos, pos); }catch(e){}
}

/** آیا این input باید فرمت مبلغ زنده بگیرد؟ */
function isLiveAmountInput(el){
  if(!el || el.tagName !== 'INPUT') return false;
  if(el.type === 'date' || el.type === 'time' || el.type === 'checkbox' || el.type === 'file') return false;
  if(el.getAttribute('inputmode') !== 'decimal') return false;
  // فیلدهای تعداد/موجودی/وزن را فرمت مبلغی نکن (جداکننده روی qty معمولاً لازم نیست و ریسک UX دارد)
  const id = (el.id || '').toLowerCase();
  const cls = (el.className && String(el.className)) || '';
  if(/qty|stock|minstock|pkgw|weight|adjust/.test(id)) return false;
  if(/\b(row-qty|ret-qty|mi-qty)\b/.test(cls)) return false;
  return true;
}

// یک‌بار روی document: فرمت هنگام تایپ برای inputهای مبلغ (بدون نیاز به تغییر app.js)
(function bindLiveAmountFormatting(){
  function onInput(e){
    const el = e.target;
    if(!isLiveAmountInput(el)) return;
    reformatAmountInputEl(el);
  }
  if(typeof document !== 'undefined'){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', function(){
        document.addEventListener('input', onInput, true);
      });
    }else{
      document.addEventListener('input', onInput, true);
    }
  }
})();
function esc(s){
  return String(s===undefined||s===null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toman(n){ return (Math.round(n||0)).toLocaleString('fa-IR'); }
function balanceStatusWord(balance){
  if(balance>0) return 'بدهکار';
  if(balance<0) return 'بستانکار';
  return 'تسویه شده';
}
function balanceStatusText(balance, amountText){
  return balance===0 ? balanceStatusWord(balance) : (balanceStatusWord(balance)+': '+amountText);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowHHMM(){ const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function faDate(iso){
  if(!iso) return '—';
  try{ return new Date(iso).toLocaleDateString('fa-IR'); }catch(e){ return iso; }
}
function daysAgo(iso){
  if(!iso) return Infinity;
  const d = new Date(iso);
  if(isNaN(d)) return Infinity;
  return Math.floor((Date.now()-d.getTime())/86400000);
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(()=>t.classList.remove('show'), 2000);
}


// ---------- modals ----------
function closeModal(){
  const root = document.getElementById('modalRoot');
  root.innerHTML = '';
  if(window.scrollX) window.scrollTo(0, window.scrollY);
}

function openSheet(html){
  const root = document.getElementById('modalRoot');
  // مطمئن شو هر Modal قبلی کاملاً پاک شده (نه فقط مخفی) قبل از ساختن Modal جدید،
  // و یک reflow اجباری بین پاک‌شدن و رندر جدید انجام بده تا ظاهر (گوشه‌های گرد و غیره) بعد از باز/بسته‌شدن‌های مکرر خراب نشه
  closeModal();
  void root.offsetHeight;
  root.innerHTML = `
    <div class="overlay" id="overlay">
      <div class="sheet" style="position:relative;">
        <button class="close-x" id="closeX">×</button>
        ${html}
      </div>
    </div>`;
  document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id==='overlay') closeModal(); });
  document.getElementById('closeX').addEventListener('click', closeModal);
}

