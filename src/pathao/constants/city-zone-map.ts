/**
 * Static mapping of Bangladeshi city names (lowercase) to Pathao City IDs and default Zone IDs.
 *
 * ⚠️ IMPORTANT: Zone IDs below are illustrative placeholders.
 * Before production deployment, verify actual zone IDs via:
 *   GET https://api.pathao.com/aladdin/api/v1/zones/{city_id}
 * and update accordingly.
 */
export const CITY_ZONE_MAP: Record<string, { cityId: number; zoneId: number }> = {
  'dhaka':         { cityId: 1,  zoneId: 1  },
  'chattogram':    { cityId: 2,  zoneId: 15 },
  'chittagong':    { cityId: 2,  zoneId: 15 }, // alternate spelling
  'sylhet':        { cityId: 3,  zoneId: 30 },
  'rajshahi':      { cityId: 4,  zoneId: 40 },
  'khulna':        { cityId: 5,  zoneId: 50 },
  'barishal':      { cityId: 6,  zoneId: 60 },
  'barisal':       { cityId: 6,  zoneId: 60 }, // alternate spelling
  'mymensingh':    { cityId: 7,  zoneId: 70 },
  'rangpur':       { cityId: 8,  zoneId: 80 },
  'comilla':       { cityId: 9,  zoneId: 90 },
  'cumilla':       { cityId: 9,  zoneId: 90 }, // alternate spelling
  'narayanganj':   { cityId: 10, zoneId: 100 },
  'gazipur':       { cityId: 1,  zoneId: 1  }, // falls under Dhaka region
  'narsingdi':     { cityId: 1,  zoneId: 1  }, // falls under Dhaka region
};

/** Default fallback City ID (Dhaka) when city name is not found in CITY_ZONE_MAP */
export const DEFAULT_CITY_ID = 1;

/** Default fallback Zone ID (Dhaka central) when city name is not found in CITY_ZONE_MAP */
export const DEFAULT_ZONE_ID = 1;
