/**
 * RCCG Kingdom Parish - Remittance Calculator
 * Handles all HQ percentage and fixed quota calculations
 */

const REMITTANCE_RATES = {
  membersTithe: {
    national: 0.58,
    local: 0.42,
    label: "Members' Tithe"
  },
  ministersTithe: {
    national: 0.62,
    local: 0.38,
    label: "Ministers' Tithe"
  },
  thanksgiving: {
    national: 0.75,
    area: 0.05,
    pastor: 0.10,
    ministers: 0.09,
    pastorsSeed: 0.01,   // 1% Seed — remitted to National HQ
    local: 0,
    label: "Thanksgiving (TG)"
  },
  sundaySchool: {
    national: 1.00,
    local: 0,
    label: "Sunday School"
  },
  slo: {
    national: 0.30,
    local: 0.70,
    label: "Sunday Love Offering (SLO)"
  },
  crm: {
    national: 0.60,
    local: 0.40,
    label: "CRM (Weekly Activities)"
  },
  workersOffering: {
    national: 0.25,
    local: 0.75,
    label: "Gospel Fund (Workers' Offering)"
  },
  firstFruit: {
    national: 1.00,
    local: 0,
    label: "First Fruit"
  },
  childrenOffering: {
    national: 0.35,
    localChildrensDept: 0.65,
    label: "Teen/Children's Offering"
  }
};

const PROVINCE_REBATE_RATE = 0.20; // 20% of local retained tithes (Members' Tithe + Ministers' Tithe) only

/**
 * Calculate all remittances from a given income object
 * @param {Object} income - Income figures for each category
 * @returns {Object} - Full breakdown of remittances and local retained
 */
function calculateRemittances(income) {
  const result = {
    breakdown: {},
    totals: {
      totalIncome: 0,
      totalToNational: 0,
      totalToArea: 0,
      totalToPastor: 0,
      totalToMinisters: 0,
      localRetainedBeforeRebate: 0,
      localTithe: 0,
      provinceRebate: 0,
      netLocalRetained: 0
    }
  };

  // Members' Tithe — tracked separately for Province Rebate calculation
  if (income.membersTithe) {
    const amt = income.membersTithe;
    result.breakdown.membersTithe = {
      label: REMITTANCE_RATES.membersTithe.label,
      total: amt,
      national: amt * REMITTANCE_RATES.membersTithe.national,
      local: amt * REMITTANCE_RATES.membersTithe.local
    };
    result.totals.totalToNational += result.breakdown.membersTithe.national;
    result.totals.localRetainedBeforeRebate += result.breakdown.membersTithe.local;
    result.totals.localTithe += result.breakdown.membersTithe.local;
  }

  // Ministers' Tithe — tracked separately for Province Rebate calculation
  if (income.ministersTithe) {
    const amt = income.ministersTithe;
    result.breakdown.ministersTithe = {
      label: REMITTANCE_RATES.ministersTithe.label,
      total: amt,
      national: amt * REMITTANCE_RATES.ministersTithe.national,
      local: amt * REMITTANCE_RATES.ministersTithe.local
    };
    result.totals.totalToNational += result.breakdown.ministersTithe.national;
    result.totals.localRetainedBeforeRebate += result.breakdown.ministersTithe.local;
    result.totals.localTithe += result.breakdown.ministersTithe.local;
  }

  // Thanksgiving
  if (income.thanksgiving) {
    const amt = income.thanksgiving;
    result.breakdown.thanksgiving = {
      label: REMITTANCE_RATES.thanksgiving.label,
      total: amt,
      national: amt * REMITTANCE_RATES.thanksgiving.national,
      area: amt * REMITTANCE_RATES.thanksgiving.area,
      pastor: amt * REMITTANCE_RATES.thanksgiving.pastor,
      ministers: amt * REMITTANCE_RATES.thanksgiving.ministers,
      pastorsSeed: amt * REMITTANCE_RATES.thanksgiving.pastorsSeed,
      local: 0
    };
    result.totals.totalToNational += result.breakdown.thanksgiving.national;
    result.totals.totalToArea += result.breakdown.thanksgiving.area;
    result.totals.totalToPastor += result.breakdown.thanksgiving.pastor;
    result.totals.totalToMinisters += result.breakdown.thanksgiving.ministers;
  }

  // Sunday School (100% to National)
  if (income.sundaySchool) {
    const amt = income.sundaySchool;
    result.breakdown.sundaySchool = {
      label: REMITTANCE_RATES.sundaySchool.label,
      total: amt,
      national: amt,
      local: 0
    };
    result.totals.totalToNational += amt;
  }

  // SLO
  if (income.slo) {
    const amt = income.slo;
    result.breakdown.slo = {
      label: REMITTANCE_RATES.slo.label,
      total: amt,
      national: amt * REMITTANCE_RATES.slo.national,
      local: amt * REMITTANCE_RATES.slo.local
    };
    result.totals.totalToNational += result.breakdown.slo.national;
    result.totals.localRetainedBeforeRebate += result.breakdown.slo.local;
  }

  // CRM
  if (income.crm) {
    const amt = income.crm;
    result.breakdown.crm = {
      label: REMITTANCE_RATES.crm.label,
      total: amt,
      national: amt * REMITTANCE_RATES.crm.national,
      local: amt * REMITTANCE_RATES.crm.local
    };
    result.totals.totalToNational += result.breakdown.crm.national;
    result.totals.localRetainedBeforeRebate += result.breakdown.crm.local;
  }

  // Workers' Offering
  if (income.workersOffering) {
    const amt = income.workersOffering;
    result.breakdown.workersOffering = {
      label: REMITTANCE_RATES.workersOffering.label,
      total: amt,
      national: amt * REMITTANCE_RATES.workersOffering.national,
      local: amt * REMITTANCE_RATES.workersOffering.local
    };
    result.totals.totalToNational += result.breakdown.workersOffering.national;
    result.totals.localRetainedBeforeRebate += result.breakdown.workersOffering.local;
  }

  // Children's Offering
  if (income.childrenOffering) {
    const amt = income.childrenOffering;
    result.breakdown.childrenOffering = {
      label: REMITTANCE_RATES.childrenOffering.label,
      total: amt,
      national: amt * REMITTANCE_RATES.childrenOffering.national,
      local: 0,
      childrensDept: amt * REMITTANCE_RATES.childrenOffering.localChildrensDept
    };
    result.totals.totalToNational += result.breakdown.childrenOffering.national;
  }

  // Province Rebate = 20% of local retained tithes ONLY (Members' Tithe + Ministers' Tithe)
  // This is NOT applied to SLO, CRM, Gospel Fund (Workers' Offering), Teen/Children's Offering etc.
  result.totals.provinceRebate = result.totals.localTithe * PROVINCE_REBATE_RATE;
  result.totals.netLocalRetained = result.totals.localRetainedBeforeRebate - result.totals.provinceRebate;

  // Total income
  result.totals.totalIncome = Object.values(income).reduce((a, b) => a + b, 0);

  return result;
}

/**
 * Format number as Nigerian Naira
 */
function formatNaira(amount) {
  if (typeof amount !== 'number' || !isFinite(amount)) return '₦0';
  return '₦' + Math.round(amount).toLocaleString('en-NG');
}

export { calculateRemittances, formatNaira, REMITTANCE_RATES, PROVINCE_REBATE_RATE };
