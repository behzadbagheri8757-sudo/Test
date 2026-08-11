/* prospect-core.js — prospects state & ops. Separate from CRM finance. */
const prospectState = {
  shops: [],
  routes: [],
  dailyTarget: null,
  ready: false,
};

async function loadProspectData(){
  if(!prospectDbInstance) await openProspectDatabase();
  const [shopsRaw, routesRaw] = await Promise.all([
    prospectDbGetAll('shops'),
    prospectDbGetAll('routes'),
  ]);
  prospectState.shops = shopsRaw.map(normalizeProspectShop);
  prospectState.routes = routesRaw.map(normalizeProspectRoute);
  await ensureProspectDailyTarget();
  prospectState.ready = true;
}

function prospectRouteName(routeId){
  const r = prospectState.routes.find(x=>x.id===routeId);
  return r ? r.name : '—';
}
function prospectNeighborhoodName(routeId, neighborhoodId){
  const r = prospectState.routes.find(x=>x.id===routeId);
  if(!r) return '—';
  const n = r.neighborhoods.find(x=>x.id===neighborhoodId);
  return n ? n.name : '—';
}

async function persistProspectShop(shop){
  shop.updatedAt = prospectNowISO();
  await prospectDbPut('shops', shop);
}

async function createProspectShop(payload){
  const score = prospectComputeScore(payload.answers||{});
  const rank = prospectScoreToRank(score);
  const visit = normalizeProspectVisit({
    date: prospectNowISO(),
    answers: {...(payload.answers||{})},
    score, rank,
    scoringVersion: PROSPECT_SCORING_VERSION,
    tags: [...(payload.tags||[])],
  });
  const shop = normalizeProspectShop({
    name: (payload.name||'').trim(),
    routeId: payload.routeId || null,
    neighborhoodId: payload.neighborhoodId || null,
    latestScore: score,
    latestRank: rank,
    visits: [visit],
    status: (payload.tags||[]).includes('became_customer') ? 'converted' : 'active',
  });
  await persistProspectShop(shop);
  prospectState.shops.push(shop);
  await registerProspectVisitForTarget();
  return shop;
}

async function addProspectVisit(shopId, payload){
  const shop = prospectState.shops.find(s=>s.id===shopId);
  if(!shop) return null;
  const score = prospectComputeScore(payload.answers||{});
  const rank = prospectScoreToRank(score);
  const visit = normalizeProspectVisit({
    date: prospectNowISO(),
    answers: {...(payload.answers||{})},
    score, rank,
    scoringVersion: PROSPECT_SCORING_VERSION,
    tags: [...(payload.tags||[])],
  });
  shop.visits.push(visit);
  shop.latestScore = score;
  shop.latestRank = rank;
  if((payload.tags||[]).includes('became_customer')) shop.status = 'converted';
  await persistProspectShop(shop);
  await registerProspectVisitForTarget();
  return shop;
}

async function deleteProspectShop(id){
  prospectState.shops = prospectState.shops.filter(s=>s.id!==id);
  await prospectDbDelete('shops', id);
}

async function addProspectRoute(name){
  const route = normalizeProspectRoute({name});
  await prospectDbPut('routes', route);
  prospectState.routes.push(route);
  return route;
}
async function deleteProspectRoute(id){
  prospectState.routes = prospectState.routes.filter(r=>r.id!==id);
  await prospectDbDelete('routes', id);
}
async function addProspectNeighborhood(routeId, name){
  const r = prospectState.routes.find(x=>x.id===routeId);
  if(!r) return;
  r.neighborhoods.push({id: typeof uid==='function'?uid():String(Date.now()), name: name.trim()});
  await prospectDbPut('routes', r);
}

/* ---- daily target ---- */
function defaultProspectDailyTarget(prevTarget, prevLastMsg){
  return { date: prospectTodayStr(), target: prevTarget||0, count:0, hit:{}, lastMsg: prevLastMsg||{} };
}
async function ensureProspectDailyTarget(){
  let rec = await prospectDbGet('meta','dailyTarget');
  let dt = rec ? rec.value : null;
  if(!dt || dt.date !== prospectTodayStr()){
    dt = defaultProspectDailyTarget(dt?dt.target:0, dt?dt.lastMsg:{});
    await prospectDbPut('meta', {key:'dailyTarget', value:dt});
  }
  prospectState.dailyTarget = dt;
  return dt;
}
async function setProspectDailyTargetValue(newTarget){
  const dt = await ensureProspectDailyTarget();
  dt.target = newTarget;
  prospectState.dailyTarget = dt;
  await prospectDbPut('meta', {key:'dailyTarget', value:dt});
}
async function registerProspectVisitForTarget(){
  const dt = await ensureProspectDailyTarget();
  dt.count += 1;
  if(dt.target > 0){
    const pct = (dt.count/dt.target)*100;
    if(pct>=100) dt.hit['100']=true;
    else if(pct>=80) dt.hit['80']=true;
    else if(pct>=50) dt.hit['50']=true;
  }
  prospectState.dailyTarget = dt;
  await prospectDbPut('meta', {key:'dailyTarget', value:dt});
}

/**
 * Convert prospect shop → CRM customer (baqeri data.customers).
 * Does NOT copy evaluation visits into customer.visits.
 * Idempotent: if already linked, returns existing customer id.
 */
async function convertProspectToCustomer(shopId){
  const shop = prospectState.shops.find(s=>s.id===shopId);
  if(!shop) throw new Error('مغازه پیدا نشد');

  if(shop.linkedCustomerId){
    const existing = (typeof data!=='undefined' && data.customers)
      ? data.customers.find(c=>c.id===shop.linkedCustomerId) : null;
    if(existing){
      shop.status = 'converted';
      await persistProspectShop(shop);
      return { customerId: existing.id, created: false, customer: existing };
    }
  }

  // prevent duplicate by exact name match among active customers
  const name = (shop.name||'').trim();
  if(typeof data!=='undefined' && data.customers){
    const dup = data.customers.find(c =>
      (c.name||'').trim() === name && c.active !== false && !c._fromProspectId
    );
    // allow if linked to this shop via note marker
    const already = data.customers.find(c => c.prospectShopId === shop.id);
    if(already){
      shop.linkedCustomerId = already.id;
      shop.status = 'converted';
      await persistProspectShop(shop);
      if(typeof saveData==='function') await saveData();
      return { customerId: already.id, created: false, customer: already };
    }
  }

  const region = prospectRouteName(shop.routeId);
  const route = prospectNeighborhoodName(shop.routeId, shop.neighborhoodId);
  const noteParts = [
    'تبدیل‌شده از ارزیابی مغازه',
    'امتیاز آخرین ارزیابی: ' + shop.latestScore + ' (رتبه ' + shop.latestRank + ')',
  ];
  const customer = {
    id: typeof uid==='function' ? uid() : ('c'+Date.now()),
    name: name,
    ownerName: '',
    phone: '',
    region: region !== '—' ? region : '',
    route: route !== '—' ? route : '',
    address: '',
    note: noteParts.join(' — '),
    openingBalance: 0,
    visits: [],
    active: true,
    prospectShopId: shop.id,
  };
  if(typeof data==='undefined' || !data.customers){
    throw new Error('داده CRM در دسترس نیست');
  }
  data.customers.push(customer);
  if(typeof saveData==='function') await saveData();

  shop.linkedCustomerId = customer.id;
  shop.status = 'converted';
  await persistProspectShop(shop);

  return { customerId: customer.id, created: true, customer };
}

async function bootProspectPage(activeNavId, afterLoad){
  try{
    if(typeof loadData==='function') await loadData();
    if(typeof renderSharedNav==='function') renderSharedNav(activeNavId);
    if(typeof renderBottomNav==='function') renderBottomNav(activeNavId);
    if(typeof ensureAppBackButton==='function') ensureAppBackButton(activeNavId);
    await loadProspectData();
    if(typeof afterLoad==='function') await afterLoad();
  }catch(e){
    console.error('bootProspectPage failed', e);
    if(typeof showToast==='function') showToast('خطا در بارگذاری ارزیابی مغازه‌ها');
  }
}
