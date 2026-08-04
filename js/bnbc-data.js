/* =====================================================================
   TwinAnalytic — BNBC 2020 / ACI 318 Code Data Tables
   ---------------------------------------------------------------------
   Reference tables transcribed from BNBC 2020 Part 6 Chapter 2 and the
   ACI 318 reinforcement tables. These back every calculator in the
   Precision Analysis Suite so a table is defined once and reused.
   ===================================================================== */

const BNBC = (function () {
  'use strict';

  /* -------------------------------------------------------------
     Table 6.2.15 — Seismic zone coefficient Z for towns of Bangladesh
     ------------------------------------------------------------- */
  const SEISMIC_ZONE_Z = {
    'Bagerhat': 0.12, 'Bandarban': 0.28, 'Barguna': 0.12, 'Barisal': 0.12,
    'Bhola': 0.12, 'Bogra': 0.28, 'Brahmanbaria': 0.28, 'Chandpur': 0.20,
    'Chapainababganj': 0.12, 'Chittagong': 0.28, 'Chuadanga': 0.12,
    'Comilla': 0.20, "Cox's Bazar": 0.28, 'Dhaka': 0.20, 'Dinajpur': 0.20,
    'Faridpur': 0.20, 'Feni': 0.20, 'Gaibandha': 0.28, 'Gazipur': 0.20,
    'Gopalganj': 0.12, 'Habiganj': 0.36, 'Jaipurhat': 0.20, 'Jamalpur': 0.36,
    'Jessore': 0.12, 'Jhalokati': 0.12, 'Jhenaidah': 0.12, 'Khagrachari': 0.28,
    'Khulna': 0.12, 'Kishoreganj': 0.36, 'Kurigram': 0.36, 'Kushtia': 0.20,
    'Lakshmipur': 0.20, 'Lalmanirhat': 0.28, 'Madaripur': 0.20, 'Magura': 0.12,
    'Manikganj': 0.20, 'Maulvibazar': 0.36, 'Meherpur': 0.12, 'Mongla': 0.12,
    'Munshiganj': 0.20, 'Mymensingh': 0.36, 'Narail': 0.12, 'Narayanganj': 0.20,
    'Narsingdi': 0.28, 'Natore': 0.20, 'Naogaon': 0.20, 'Netrakona': 0.36,
    'Nilphamari': 0.12, 'Noakhali': 0.20, 'Pabna': 0.20, 'Panchagarh': 0.20,
    'Patuakhali': 0.12, 'Pirojpur': 0.12, 'Rajbari': 0.20, 'Rajshahi': 0.12,
    'Rangamati': 0.28, 'Rangpur': 0.28, 'Satkhira': 0.12, 'Shariatpur': 0.20,
    'Sherpur': 0.36, 'Sirajganj': 0.28, 'Srimangal': 0.36, 'Sunamganj': 0.36,
    'Sylhet': 0.36, 'Tangail': 0.28, 'Thakurgaon': 0.20
  };

  /* Seismic zone number from Z (BNBC 2020 Figure 6.2.24) */
  function zoneFromZ(Z) {
    if (Math.abs(Z - 0.12) < 1e-9) return 1;
    if (Math.abs(Z - 0.20) < 1e-9) return 2;
    if (Math.abs(Z - 0.28) < 1e-9) return 3;
    if (Math.abs(Z - 0.36) < 1e-9) return 4;
    // Tolerant fallback for user-entered intermediate Z values
    if (Z <= 0.16) return 1;
    if (Z <= 0.24) return 2;
    if (Z <= 0.32) return 3;
    return 4;
  }

  /* -------------------------------------------------------------
     Table 6.2.16 — Site dependent soil factor and the periods that
     define the elastic response spectrum
     ------------------------------------------------------------- */
  const SOIL_PARAMS = {
    SA: { S: 1.00, TB: 0.15, TC: 0.40, TD: 2.0, name: 'SA — Rock' },
    SB: { S: 1.20, TB: 0.15, TC: 0.50, TD: 2.0, name: 'SB — Very dense sand / stiff clay' },
    SC: { S: 1.15, TB: 0.20, TC: 0.60, TD: 2.0, name: 'SC — Dense sand / very stiff clay' },
    SD: { S: 1.35, TB: 0.20, TC: 0.80, TD: 2.0, name: 'SD — Medium dense sand / firm clay' },
    SE: { S: 1.40, TB: 0.15, TC: 0.50, TD: 2.0, name: 'SE — Soft soil deposit' }
  };

  /* -------------------------------------------------------------
     Table 6.2.17 — Importance factor I for earthquake design
     ------------------------------------------------------------- */
  const IMPORTANCE_FACTOR = { 'I, II': 1.00, 'III': 1.25, 'IV': 1.50 };

  /* -------------------------------------------------------------
     Table 6.2.20 — Coefficients to estimate the approximate period
     T = Ct * H^m   (H in metres)
     ------------------------------------------------------------- */
  const PERIOD_COEFF = {
    CMRF: { Ct: 0.0466, m: 0.90, name: 'Concrete moment resisting frame' },
    SMRF: { Ct: 0.0724, m: 0.80, name: 'Steel moment resisting frame' },
    EBSF: { Ct: 0.0731, m: 0.75, name: 'Eccentrically braced steel frame' },
    AOSS: { Ct: 0.0488, m: 0.75, name: 'All other structural systems' }
  };

  /* -------------------------------------------------------------
     Table 6.2.19 — Response reduction factor R, system overstrength
     factor Omega and deflection amplification factor Cd
     ------------------------------------------------------------- */
  const SFRS = [
    { group: 'Bearing wall systems (no frame)', name: 'Special reinforced concrete shear walls', R: 5, W: 2.5, Cd: 5 },
    { group: 'Bearing wall systems (no frame)', name: 'Ordinary reinforced concrete shear walls', R: 4, W: 2.5, Cd: 4 },
    { group: 'Bearing wall systems (no frame)', name: 'Ordinary reinforced masonry shear walls', R: 2, W: 2.5, Cd: 1.75 },
    { group: 'Bearing wall systems (no frame)', name: 'Ordinary plain masonry shear walls', R: 1.5, W: 2.5, Cd: 1.25 },

    { group: 'Building frame systems', name: 'Steel eccentrically braced frames, moment resisting connections', R: 8, W: 2, Cd: 4 },
    { group: 'Building frame systems', name: 'Steel eccentrically braced frames, non-moment-resisting connections', R: 7, W: 2, Cd: 4 },
    { group: 'Building frame systems', name: 'Special steel concentrically braced frames', R: 6, W: 2, Cd: 5 },
    { group: 'Building frame systems', name: 'Ordinary steel concentrically braced frames', R: 3.25, W: 2, Cd: 3.25 },
    { group: 'Building frame systems', name: 'Special reinforced concrete shear walls', R: 6, W: 2.5, Cd: 5 },
    { group: 'Building frame systems', name: 'Ordinary reinforced concrete shear walls', R: 5, W: 2.5, Cd: 4.25 },
    { group: 'Building frame systems', name: 'Ordinary reinforced masonry shear walls', R: 2, W: 2.5, Cd: 2 },
    { group: 'Building frame systems', name: 'Ordinary plain masonry shear walls', R: 1.5, W: 2.5, Cd: 1.25 },

    { group: 'Moment resisting frame systems', name: 'Special steel moment frames', R: 8, W: 3, Cd: 5.5 },
    { group: 'Moment resisting frame systems', name: 'Intermediate steel moment frames', R: 4.5, W: 3, Cd: 4 },
    { group: 'Moment resisting frame systems', name: 'Ordinary steel moment frames', R: 3.5, W: 3, Cd: 3 },
    { group: 'Moment resisting frame systems', name: 'Special reinforced concrete moment frames', R: 8, W: 3, Cd: 5.5 },
    { group: 'Moment resisting frame systems', name: 'Intermediate reinforced concrete moment frames', R: 5, W: 3, Cd: 4.5 },
    { group: 'Moment resisting frame systems', name: 'Ordinary reinforced concrete moment frames', R: 3, W: 3, Cd: 2.5 },

    { group: 'Dual systems with special moment frames', name: 'Steel eccentrically braced frames', R: 8, W: 2.5, Cd: 4 },
    { group: 'Dual systems with special moment frames', name: 'Special steel concentrically braced frames', R: 7, W: 2.5, Cd: 5.5 },
    { group: 'Dual systems with special moment frames', name: 'Special reinforced concrete shear walls', R: 7, W: 2.5, Cd: 5.5 },
    { group: 'Dual systems with special moment frames', name: 'Ordinary reinforced concrete shear walls', R: 6, W: 2.5, Cd: 5 },

    { group: 'Dual systems with intermediate moment frames', name: 'Special steel concentrically braced frames', R: 6, W: 2.5, Cd: 5 },
    { group: 'Dual systems with intermediate moment frames', name: 'Special reinforced concrete shear walls', R: 6.5, W: 2.5, Cd: 5 },
    { group: 'Dual systems with intermediate moment frames', name: 'Ordinary reinforced masonry shear walls', R: 3, W: 3, Cd: 3 },
    { group: 'Dual systems with intermediate moment frames', name: 'Ordinary reinforced concrete shear walls', R: 5.5, W: 2.5, Cd: 4.5 },

    { group: 'Dual shear wall-frame system', name: 'Dual shear wall-frame system', R: 4.5, W: 2.5, Cd: 4 },
    { group: 'Steel systems not specifically detailed', name: 'Steel systems not specifically detailed', R: 3, W: 3, Cd: 3 }
  ];

  /* -------------------------------------------------------------
     Table 6.2.21 — Allowable storey drift ratio by occupancy
     ------------------------------------------------------------- */
  const DRIFT_LIMIT = { 'I, II': 0.020, 'III': 0.015, 'IV': 0.010 };

  /* =============================================================
     WIND — BNBC 2020 Part 6 Chapter 2 Section 2.4
     ============================================================= */

  /* Table 6.2.14 — Basic wind speed V (m/s) for selected locations */
  const BASIC_WIND_SPEED = {
    'Angarpota': 47.8, 'Bagerhat': 77.5, 'Bandarban': 62.5, 'Barguna': 80.0,
    'Barisal': 78.7, 'Bhola': 69.5, 'Bogra': 61.9, 'Brahmanbaria': 56.7,
    'Chandpur': 50.6, 'Chapai Nawabganj': 41.4, 'Chittagong': 80.0,
    'Chuadanga': 61.9, 'Comilla': 61.4, "Cox's Bazar": 80.0, 'Dhaka': 65.7,
    'Dinajpur': 41.4, 'Faridpur': 63.1, 'Feni': 64.1, 'Gaibandha': 65.6,
    'Gazipur': 66.5, 'Gopalganj': 74.5, 'Habiganj': 54.2, 'Hatiya': 80.0,
    'Ishurdi': 69.5, 'Joypurhat': 56.7, 'Jamalpur': 56.7, 'Jessore': 64.1,
    'Jhalakati': 80.0, 'Jhenaidah': 65.0, 'Khagrachhari': 56.7, 'Khulna': 73.3,
    'Kishoreganj': 64.7, 'Kurigram': 65.6, 'Kushtia': 66.9, 'Lakshmipur': 51.2,
    'Lalmonirhat': 63.7, 'Madaripur': 68.1, 'Magura': 65.0, 'Manikganj': 58.2,
    'Maulvibazar': 53.0, 'Meherpur': 58.2, 'Mongla': 80.0, 'Munshiganj': 57.1,
    'Mymensingh': 67.4, 'Naogaon': 55.2, 'Narail': 68.6, 'Narayanganj': 61.1,
    'Narsingdi': 59.7, 'Natore': 61.9, 'Netrakona': 65.6, 'Nilphamari': 44.7,
    'Noakhali': 57.1, 'Pabna': 63.1, 'Panchagarh': 41.4, 'Patuakhali': 80.0,
    'Pirojpur': 80.0, 'Rajbari': 59.1, 'Rajshahi': 49.2, 'Rangamati': 56.7,
    'Rangpur': 65.3, 'Satkhira': 57.6, 'Shariatpur': 61.9, 'Sherpur': 62.5,
    'Sirajganj': 50.6, 'Srimangal': 50.6, 'Sunamganj': 61.1, 'Sylhet': 61.1,
    'Tangail': 50.6, 'Teknaf': 80.0, 'Thakurgaon': 41.4
  };

  /* Table 6.2.10 — Terrain exposure constants */
  const EXPOSURE = {
    A: { alpha: 7.0, zg: 365.76, aHat: 1 / 7, bHat: 0.84, alphaBar: 0.25, bBar: 0.45, c: 0.30, l: 97.54, epsBar: 1 / 3, zmin: 9.14 },
    B: { alpha: 9.5, zg: 274.32, aHat: 1 / 9.5, bHat: 1.00, alphaBar: 1 / 6.5, bBar: 0.65, c: 0.20, l: 152.40, epsBar: 0.20, zmin: 4.57 },
    C: { alpha: 11.5, zg: 213.36, aHat: 1 / 11.5, bHat: 1.07, alphaBar: 1 / 9, bBar: 0.80, c: 0.15, l: 198.12, epsBar: 0.125, zmin: 2.13 }
  };

  /* Table 6.2.12 — Wind directionality factor Kd */
  const KD_FACTOR = {
    'TYPE-1': { Kd: 0.85, name: 'Buildings — main wind force resisting system' },
    'TYPE-2': { Kd: 0.85, name: 'Buildings — components and cladding' },
    'TYPE-3': { Kd: 0.85, name: 'Arched roofs' },
    'TYPE-4': { Kd: 0.90, name: 'Chimneys, tanks — square' },
    'TYPE-5': { Kd: 0.95, name: 'Chimneys, tanks — hexagonal' },
    'TYPE-6': { Kd: 0.95, name: 'Chimneys, tanks — round' },
    'TYPE-7': { Kd: 0.85, name: 'Solid signs' },
    'TYPE-8': { Kd: 0.85, name: 'Open signs and lattice framework' },
    'TYPE-9': { Kd: 0.85, name: 'Trussed towers — triangular, square, rectangular' }
  };

  /* Figure 6.2.5 — Internal pressure coefficient GCpi */
  const GCPI = {
    OB: { v: 0.00, name: 'Open building' },
    PEB: { v: 0.55, name: 'Partially enclosed building' },
    EB: { v: 0.18, name: 'Enclosed building' }
  };

  /* Table 6.2.9 — Wind importance factor */
  const WIND_IMPORTANCE = { 'I': 0.87, 'II': 1.00, 'III': 1.15, 'IV': 1.15 };

  /* =============================================================
     TWO-WAY SLAB MOMENT COEFFICIENTS
     ACI Method 2 (ACI 318-63 Tables A1-A3), retained by BNBC 2020
     for slabs supported on stiff beams along all four edges.

     Index order is Case 1 through Case 9; the key is the span ratio
     m = short span / long span. A zero entry means the coefficient
     does not apply to that edge condition.
     ============================================================= */
  const SLAB_COEFF = {
    CA_NEG: {
      '1': [0, 0.045, 0, 0.05, 0.075, 0.071, 0, 0.033, 0.061],
      '0.95': [0, 0.05, 0, 0.055, 0.079, 0.075, 0, 0.038, 0.065],
      '0.9': [0, 0.055, 0, 0.06, 0.08, 0.079, 0, 0.043, 0.068],
      '0.85': [0, 0.06, 0, 0.066, 0.082, 0.083, 0, 0.049, 0.072],
      '0.8': [0, 0.065, 0, 0.071, 0.083, 0.086, 0, 0.055, 0.075],
      '0.75': [0, 0.069, 0, 0.076, 0.085, 0.088, 0, 0.061, 0.078],
      '0.7': [0, 0.074, 0, 0.081, 0.086, 0.091, 0, 0.068, 0.081],
      '0.65': [0, 0.077, 0, 0.085, 0.087, 0.093, 0, 0.074, 0.083],
      '0.6': [0, 0.081, 0, 0.089, 0.088, 0.095, 0, 0.08, 0.085],
      '0.55': [0, 0.084, 0, 0.092, 0.089, 0.096, 0, 0.085, 0.086],
      '0.5': [0, 0.086, 0, 0.094, 0.09, 0.097, 0, 0.089, 0.088],
    },
    CB_NEG: {
      '1': [0, 0.045, 0.076, 0.05, 0, 0, 0.071, 0.061, 0.033],
      '0.95': [0, 0.041, 0.072, 0.045, 0, 0, 0.067, 0.056, 0.029],
      '0.9': [0, 0.037, 0.07, 0.04, 0, 0, 0.062, 0.052, 0.025],
      '0.85': [0, 0.031, 0.065, 0.034, 0, 0, 0.057, 0.046, 0.021],
      '0.8': [0, 0.027, 0.061, 0.029, 0, 0, 0.051, 0.041, 0.017],
      '0.75': [0, 0.022, 0.056, 0.024, 0, 0, 0.044, 0.036, 0.014],
      '0.7': [0, 0.017, 0.05, 0.019, 0, 0, 0.038, 0.029, 0.011],
      '0.65': [0, 0.014, 0.043, 0.015, 0, 0, 0.031, 0.024, 0.008],
      '0.6': [0, 0.01, 0.035, 0.011, 0, 0, 0.024, 0.018, 0.006],
      '0.55': [0, 0.007, 0.028, 0.008, 0, 0, 0.019, 0.014, 0.005],
      '0.5': [0, 0.006, 0.022, 0.006, 0, 0, 0.014, 0.01, 0.003],
    },
    CA_DL: {
      '1': [0.036, 0.018, 0.018, 0.027, 0.027, 0.033, 0.027, 0.02, 0.023],
      '0.95': [0.04, 0.02, 0.021, 0.03, 0.028, 0.036, 0.031, 0.022, 0.024],
      '0.9': [0.045, 0.022, 0.025, 0.033, 0.029, 0.039, 0.035, 0.025, 0.026],
      '0.85': [0.05, 0.024, 0.029, 0.036, 0.031, 0.042, 0.04, 0.029, 0.028],
      '0.8': [0.056, 0.026, 0.034, 0.039, 0.032, 0.045, 0.045, 0.032, 0.029],
      '0.75': [0.061, 0.028, 0.04, 0.043, 0.033, 0.048, 0.051, 0.036, 0.031],
      '0.7': [0.068, 0.03, 0.046, 0.046, 0.035, 0.051, 0.058, 0.04, 0.033],
      '0.65': [0.074, 0.032, 0.054, 0.05, 0.036, 0.054, 0.065, 0.044, 0.034],
      '0.6': [0.081, 0.034, 0.062, 0.053, 0.037, 0.056, 0.073, 0.048, 0.036],
      '0.55': [0.088, 0.035, 0.071, 0.056, 0.038, 0.058, 0.081, 0.052, 0.037],
      '0.5': [0.095, 0.037, 0.08, 0.059, 0.039, 0.061, 0.089, 0.056, 0.038],
    },
    CB_DL: {
      '1': [0.036, 0.018, 0.027, 0.027, 0.018, 0.027, 0.033, 0.023, 0.02],
      '0.95': [0.033, 0.016, 0.025, 0.024, 0.015, 0.024, 0.031, 0.021, 0.017],
      '0.9': [0.029, 0.014, 0.024, 0.022, 0.013, 0.021, 0.028, 0.019, 0.015],
      '0.85': [0.026, 0.012, 0.022, 0.019, 0.011, 0.017, 0.025, 0.017, 0.013],
      '0.8': [0.023, 0.011, 0.02, 0.016, 0.009, 0.015, 0.022, 0.015, 0.01],
      '0.75': [0.019, 0.009, 0.018, 0.013, 0.007, 0.012, 0.02, 0.013, 0.007],
      '0.7': [0.016, 0.007, 0.016, 0.011, 0.005, 0.009, 0.017, 0.011, 0.006],
      '0.65': [0.013, 0.006, 0.014, 0.009, 0.004, 0.007, 0.014, 0.009, 0.005],
      '0.6': [0.01, 0.004, 0.011, 0.007, 0.003, 0.006, 0.012, 0.007, 0.004],
      '0.55': [0.008, 0.003, 0.009, 0.005, 0.002, 0.004, 0.009, 0.005, 0.003],
      '0.5': [0.006, 0.002, 0.007, 0.004, 0.001, 0.003, 0.007, 0.004, 0.002],
    },
    CA_LL: {
      '1': [0.036, 0.027, 0.027, 0.032, 0.032, 0.035, 0.032, 0.028, 0.03],
      '0.95': [0.04, 0.03, 0.031, 0.035, 0.034, 0.038, 0.036, 0.031, 0.032],
      '0.9': [0.045, 0.034, 0.035, 0.039, 0.037, 0.042, 0.04, 0.035, 0.036],
      '0.85': [0.05, 0.037, 0.04, 0.043, 0.041, 0.046, 0.045, 0.04, 0.039],
      '0.8': [0.056, 0.041, 0.045, 0.048, 0.044, 0.051, 0.051, 0.044, 0.042],
      '0.75': [0.061, 0.045, 0.051, 0.052, 0.047, 0.055, 0.056, 0.049, 0.046],
      '0.7': [0.068, 0.049, 0.057, 0.057, 0.051, 0.06, 0.063, 0.054, 0.05],
      '0.65': [0.074, 0.053, 0.064, 0.062, 0.055, 0.064, 0.07, 0.059, 0.054],
      '0.6': [0.081, 0.058, 0.071, 0.067, 0.059, 0.068, 0.077, 0.065, 0.059],
      '0.55': [0.088, 0.062, 0.08, 0.072, 0.063, 0.073, 0.085, 0.07, 0.063],
      '0.5': [0.095, 0.066, 0.088, 0.077, 0.067, 0.078, 0.092, 0.076, 0.067],
    },
    CB_LL: {
      '1': [0.036, 0.027, 0.032, 0.032, 0.027, 0.032, 0.035, 0.03, 0.028],
      '0.95': [0.033, 0.025, 0.029, 0.029, 0.024, 0.029, 0.032, 0.027, 0.025],
      '0.9': [0.029, 0.022, 0.027, 0.026, 0.021, 0.025, 0.029, 0.024, 0.022],
      '0.85': [0.026, 0.019, 0.024, 0.023, 0.019, 0.022, 0.026, 0.022, 0.02],
      '0.8': [0.023, 0.017, 0.022, 0.02, 0.016, 0.019, 0.023, 0.019, 0.017],
      '0.75': [0.019, 0.014, 0.019, 0.016, 0.013, 0.016, 0.02, 0.016, 0.013],
      '0.7': [0.016, 0.012, 0.016, 0.014, 0.011, 0.013, 0.017, 0.014, 0.011],
      '0.65': [0.013, 0.01, 0.014, 0.011, 0.009, 0.01, 0.014, 0.011, 0.009],
      '0.6': [0.01, 0.007, 0.011, 0.009, 0.007, 0.008, 0.011, 0.009, 0.007],
      '0.55': [0.008, 0.006, 0.009, 0.007, 0.005, 0.006, 0.009, 0.007, 0.006],
      '0.5': [0.006, 0.004, 0.007, 0.005, 0.004, 0.005, 0.007, 0.005, 0.004],
    },
  };

  const SLAB_CASE_NAMES = [
    'Case 1 - All four edges discontinuous',
    'Case 2 - All four edges continuous',
    'Case 3 - One short edge discontinuous',
    'Case 4 - One long edge discontinuous',
    'Case 5 - Two adjacent edges discontinuous',
    'Case 6 - Two short edges discontinuous',
    'Case 7 - Two long edges discontinuous',
    'Case 8 - Three edges discontinuous, one long edge continuous',
    'Case 9 - Three edges discontinuous, one short edge continuous'
  ];

  /* Read a coefficient, stepping the span ratio to a tabulated value.
     Ca reads the floor of m and Cb the ceiling, matching the source
     workbook and keeping both directions on the safe side. */
  function slabCoeff(table, m, caseNo, mode) {
    const t = SLAB_COEFF[table];
    if (!t) return 0;
    const step = 0.05;
    let key = (mode === 'ceil') ? Math.ceil(m / step) * step : Math.floor(m / step) * step;
    key = Math.min(1, Math.max(0.5, key));
    const row = t[String(parseFloat(key.toFixed(2)))];
    if (!row) return 0;
    return row[Math.min(8, Math.max(0, (caseNo | 0) - 1))] || 0;
  }

  /* =============================================================
     REINFORCEMENT
     ============================================================= */

  /* Imperial bar designations — nominal diameter (in) and area (in^2) */
  const BAR_IMPERIAL = {
    '#3': { db: 0.375, Ab: 0.11 }, '#4': { db: 0.500, Ab: 0.20 },
    '#5': { db: 0.625, Ab: 0.31 }, '#6': { db: 0.750, Ab: 0.44 },
    '#7': { db: 0.875, Ab: 0.60 }, '#8': { db: 1.000, Ab: 0.79 },
    '#9': { db: 1.128, Ab: 1.00 }, '#10': { db: 1.270, Ab: 1.27 },
    '#11': { db: 1.410, Ab: 1.56 }, '#14': { db: 1.693, Ab: 2.25 },
    '#18': { db: 2.257, Ab: 4.00 }
  };

  /* Metric bar diameters commonly stocked in Bangladesh (mm) */
  const BAR_METRIC = [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 40];

  /* Area of one metric bar, mm^2 */
  function barAreaMM(dia) { return Math.PI / 4 * dia * dia; }
  /* Area of one metric bar expressed in in^2 */
  function barAreaIN(diaMM) { const d = diaMM / 25.4; return Math.PI / 4 * d * d; }

  /* Unit weight of a metric bar, kg/m — the exact steel-density form.
     The widely quoted d^2/162 shortcut is this expression rounded. */
  function barWeightKgPerM(diaMM) { return barAreaMM(diaMM) * 1e-6 * 7850; }

  /* =============================================================
     SHARED ACI HELPERS
     ============================================================= */

  /* ACI 318 beta1 for a rectangular stress block, f'c in MPa */
  function beta1MPa(fcMPa) {
    if (fcMPa <= 28) return 0.85;
    return Math.max(0.85 - 0.05 * (fcMPa - 28) / 7, 0.65);
  }

  /* ACI 318 beta1, f'c in psi */
  function beta1PSI(fcPSI) {
    if (fcPSI <= 4000) return 0.85;
    return Math.max(0.85 - 0.05 * (fcPSI - 4000) / 1000, 0.65);
  }

  /* Strength reduction factor from net tensile strain (ACI 318-19),
     for spiral members pass tied = false */
  function phiFromStrain(epsT, fy, Es, tied) {
    const epsTy = (fy || 420) / (Es || 200000);
    const phiC = (tied === false) ? 0.75 : 0.65;
    if (epsT >= epsTy + 0.003) return 0.90;
    if (epsT <= epsTy) return phiC;
    return phiC + (0.90 - phiC) * (epsT - epsTy) / 0.003;
  }

  /* Unit conversions used throughout the suite. Everything routes
     through these so the 25.4 mm/in factor is never approximated. */
  const CONV = {
    IN_TO_MM: 25.4,
    MM_TO_IN: 1 / 25.4,
    FT_TO_M: 0.3048,
    M_TO_FT: 1 / 0.3048,
    KIP_TO_KN: 4.4482216,
    KSF_TO_KPA: 47.880259,
    PSI_TO_MPA: 0.00689476,
    PCF_TO_KNM3: 0.157087
  };

  return {
    SEISMIC_ZONE_Z, zoneFromZ, SOIL_PARAMS, IMPORTANCE_FACTOR, PERIOD_COEFF,
    SFRS, DRIFT_LIMIT, BASIC_WIND_SPEED, EXPOSURE, KD_FACTOR, GCPI,
    SLAB_COEFF, SLAB_CASE_NAMES, slabCoeff,
    WIND_IMPORTANCE, BAR_IMPERIAL, BAR_METRIC, barAreaMM, barAreaIN,
    barWeightKgPerM, beta1MPa, beta1PSI, phiFromStrain, CONV
  };
})();

if (typeof window !== 'undefined') window.BNBC = BNBC;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBC;
