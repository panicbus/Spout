import type { License } from "@spout/contracts";

/**
 * The full standard Creative Commons 4.0 license family (all 7
 * non-public-domain variants plus CC0) — the single source of truth both
 * `normalize/sighting.ts` (GBIF, keyed by full legalcode URL) and
 * `normalize/inaturalist.ts` (keyed by iNaturalist's short code) build
 * their lookup maps from. Before this existed, GBIF's map only carried 3
 * of the 7 variants (cc0/cc-by/cc-by-nc) while iNaturalist's carried all
 * 7 — a real, silent bug: a `cc-by-nc-sa`-licensed observation (verified
 * live during R3 to actually occur) ingested via iNaturalist's direct API
 * while within its 35-day window would permanently disappear once it
 * aged out, because GBIF's own republication of that same observation
 * (via its iNaturalist dataset) hit `if (!license) return null` for a
 * license GBIF's map had simply never been told about. One shared list
 * makes that class of drift structurally impossible, not just fixed once.
 */
export const CC_LICENSES: readonly {
  id: string;
  /** iNaturalist's short `license_code` value. */
  code: string;
  /** GBIF's full legalcode URL (`https://` canonical form). */
  url: string;
  commercialUse: boolean;
}[] = [
  {
    id: "CC0_1_0",
    code: "cc0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/legalcode",
    commercialUse: true,
  },
  {
    id: "CC_BY_4_0",
    code: "cc-by",
    url: "https://creativecommons.org/licenses/by/4.0/legalcode",
    commercialUse: true,
  },
  {
    id: "CC_BY_SA_4_0",
    code: "cc-by-sa",
    url: "https://creativecommons.org/licenses/by-sa/4.0/legalcode",
    commercialUse: true,
  },
  {
    id: "CC_BY_ND_4_0",
    code: "cc-by-nd",
    url: "https://creativecommons.org/licenses/by-nd/4.0/legalcode",
    commercialUse: true,
  },
  {
    id: "CC_BY_NC_4_0",
    code: "cc-by-nc",
    url: "https://creativecommons.org/licenses/by-nc/4.0/legalcode",
    commercialUse: false,
  },
  {
    id: "CC_BY_NC_SA_4_0",
    code: "cc-by-nc-sa",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode",
    commercialUse: false,
  },
  {
    id: "CC_BY_NC_ND_4_0",
    code: "cc-by-nc-nd",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode",
    commercialUse: false,
  },
];

function toLicense(entry: (typeof CC_LICENSES)[number]): License {
  return { id: entry.id, url: entry.url, commercialUse: entry.commercialUse };
}

/** Keyed on GBIF's full `https://` legalcode URL form. */
export const LICENSE_BY_URL: Record<string, License> = Object.fromEntries(
  CC_LICENSES.map((entry) => [entry.url, toLicense(entry)]),
);

/** Keyed on iNaturalist's short `license_code` value. */
export const LICENSE_BY_CODE: Record<string, License> = Object.fromEntries(
  CC_LICENSES.map((entry) => [entry.code, toLicense(entry)]),
);
