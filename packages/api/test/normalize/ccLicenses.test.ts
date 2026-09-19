import { describe, expect, it } from "vitest";
import { CC_LICENSES, LICENSE_BY_CODE, LICENSE_BY_URL } from "../../src/normalize/ccLicenses.js";

describe("ccLicenses", () => {
  it("derives LICENSE_BY_URL and LICENSE_BY_CODE from the same 7-entry list, so GBIF and iNaturalist can never see a different set of known licenses", () => {
    expect(CC_LICENSES).toHaveLength(7);
    expect(Object.keys(LICENSE_BY_URL)).toHaveLength(7);
    expect(Object.keys(LICENSE_BY_CODE)).toHaveLength(7);
  });

  it("maps a given license to the same id whether looked up by URL or by code", () => {
    expect(LICENSE_BY_URL["https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode"]?.id).toBe(
      "CC_BY_NC_SA_4_0",
    );
    expect(LICENSE_BY_CODE["cc-by-nc-sa"]?.id).toBe("CC_BY_NC_SA_4_0");
  });

  it("includes the 4 variants previously missing from GBIF's map (cc-by-sa, cc-by-nd, cc-by-nc-sa, cc-by-nc-nd)", () => {
    for (const code of ["cc-by-sa", "cc-by-nd", "cc-by-nc-sa", "cc-by-nc-nd"]) {
      expect(LICENSE_BY_CODE[code]).toBeDefined();
    }
  });
});
