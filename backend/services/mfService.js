const axios = require('axios');
const cache = require('./cache');

const mfAPI = axios.create({
  baseURL: 'https://api.mfapi.in',
  timeout: 10000
});

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeCatalogItem = (item) => {
  const schemeCode = String(item?.schemeCode || item?.scheme_code || item?.code || '').trim();
  const schemeName = String(item?.schemeName || item?.scheme_name || item?.name || '').trim();
  if (!schemeCode || !schemeName) return null;
  return {
    schemeCode,
    schemeName,
    fundHouse: item?.fundHouse || item?.fund_house || '',
    category: item?.category || ''
  };
};

const getMFCatalog = async () => {
  const cacheKey = 'mf_catalog_all';
  const cached = await cache.mf.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await mfAPI.get('/mf');
    const catalog = Array.isArray(response.data)
      ? response.data.map(normalizeCatalogItem).filter(Boolean)
      : [];

    if (catalog.length) {
      await cache.mf.set(cacheKey, catalog);
      return catalog;
    }
  } catch (err) {
    // Fallback below
  }

  return popularMFs;
};

const getMFDetails = async (schemeCode) => {
  const cacheKey = `mf_${schemeCode}`;
  const cached = await cache.mf.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await mfAPI.get(`/mf/${schemeCode}`);
    const data = response.data;
    const meta = data?.meta || {};
    const latest = data.data?.[0];
    const prev = data.data?.[1];

    const nav = toNumber(latest?.nav);
    if (!meta.scheme_code || !meta.scheme_name || nav <= 0) {
      throw new Error(`Incomplete MF data for ${schemeCode}`);
    }

    const result = {
      schemeCode: String(meta.scheme_code),
      schemeName: meta.scheme_name,
      fundHouse: meta.fund_house,
      schemeType: meta.scheme_type,
      schemeCategory: meta.scheme_category,
      nav,
      date: latest?.date,
      change: prev ? Number((nav - toNumber(prev?.nav)).toFixed(4)) : 0,
      changePercent: prev ? Number((((nav - toNumber(prev?.nav)) / (toNumber(prev?.nav) || 1)) * 100).toFixed(2)) : 0,
      historicalData: data.data?.slice(0, 365) || []
    };

    await cache.mf.set(cacheKey, result);
    return result;
  } catch (err) {
    return getMockMFData(schemeCode);
  }
};

const searchMutualFunds = async (query) => {
  const searchText = String(query || '').trim();
  if (!searchText) return [];

  const cacheKey = `mf_search_${searchText.toLowerCase()}`;
  const cached = await cache.mf.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await mfAPI.get('/mf/search', {
      params: { q: searchText }
    });
    const directResults = Array.isArray(response.data)
      ? response.data.map(normalizeCatalogItem).filter(Boolean)
      : [];

    if (directResults.length) {
      await cache.mf.set(cacheKey, directResults);
      return directResults;
    }
  } catch (err) {
    // Fall through to catalog search.
  }

  const catalog = await getMFCatalog();
  const lowered = searchText.toLowerCase();
  const results = catalog
    .filter((mf) =>
      String(mf.schemeName || '').toLowerCase().includes(lowered) ||
      String(mf.fundHouse || '').toLowerCase().includes(lowered) ||
      String(mf.schemeCode || '').includes(searchText)
    )
    .slice(0, 20);

  await cache.mf.set(cacheKey, results);
  return results;
};

const getTopMFs = async () => {
  const cacheKey = 'mf_popular_enriched';
  const cached = await cache.mf.get(cacheKey);
  if (cached) return cached;

  const enriched = await Promise.all(popularMFs.map(async (fund) => {
    const details = await getMFDetails(fund.schemeCode);
    return {
      ...details,
      schemeCode: String(fund.schemeCode),
      schemeName: fund.schemeName,
      fundHouse: fund.fundHouse || details.fundHouse,
      category: fund.category || details.schemeCategory?.split(' - ')[1] || ''
    };
  }));

  await cache.mf.set(cacheKey, enriched);
  return enriched;
};

const getMFComparison = async (codes) => {
  const results = await Promise.all(codes.map(code => getMFDetails(code)));
  return results;
};

const getMockMFData = (schemeCode) => {
  const nav = (Math.random() * 200 + 10).toFixed(4);
  const change = ((Math.random() - 0.45) * 5).toFixed(4);
  return {
    schemeCode,
    schemeName: `Sample Fund - ${schemeCode}`,
    fundHouse: 'Sample AMC',
    schemeType: 'Open Ended Schemes',
    schemeCategory: 'Equity Scheme - Large Cap Fund',
    nav: toNumber(nav),
    date: new Date().toISOString().split('T')[0],
    change: toNumber(change),
    changePercent: Number(((toNumber(change) / (toNumber(nav) || 1)) * 100).toFixed(2)),
    historicalData: generateMockNAVHistory(),
    isMock: true
  };
};

const generateMockNAVHistory = () => {
  const data = [];
  let nav = Math.random() * 100 + 20;
  for (let i = 365; i >= 0; i--) {
    nav = nav * (1 + (Math.random() - 0.47) * 0.02);
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      nav: nav.toFixed(4)
    });
  }
  return data;
};

const popularMFs = [
  { schemeCode: '120503', schemeName: 'Mirae Asset Large Cap Fund - Regular Plan - Growth', fundHouse: 'Mirae Asset', category: 'Large Cap' },
  { schemeCode: '100356', schemeName: 'HDFC Top 100 Fund - Growth Option', fundHouse: 'HDFC Mutual Fund', category: 'Large Cap' },
  { schemeCode: '118550', schemeName: 'Axis Bluechip Fund - Regular Plan - Growth', fundHouse: 'Axis Mutual Fund', category: 'Large Cap' },
  { schemeCode: '120716', schemeName: 'Parag Parikh Flexi Cap Fund - Regular Plan - Growth', fundHouse: 'PPFAS Mutual Fund', category: 'Flexi Cap' },
  { schemeCode: '100270', schemeName: 'SBI Small Cap Fund - Regular Plan - Growth', fundHouse: 'SBI Mutual Fund', category: 'Small Cap' },
  { schemeCode: '119598', schemeName: 'Axis Small Cap Fund - Regular Plan - Growth', fundHouse: 'Axis Mutual Fund', category: 'Small Cap' },
  { schemeCode: '100425', schemeName: 'ICICI Prudential Technology Fund - Growth', fundHouse: 'ICICI Prudential', category: 'Sectoral' },
  { schemeCode: '120505', schemeName: 'Mirae Asset Emerging Bluechip Fund - Regular - Growth', fundHouse: 'Mirae Asset', category: 'Mid Cap' },
];

module.exports = {
  getMFDetails,
  searchMutualFunds,
  getTopMFs,
  getMFComparison,
  popularMFs
};
