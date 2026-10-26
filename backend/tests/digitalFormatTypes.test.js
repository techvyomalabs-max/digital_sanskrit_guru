const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  BUILT_IN_DIGITAL_FORMAT_TYPES,
  DEFAULT_DIGITAL_FORMAT_TYPES,
  normalizeDigitalFormatTypes,
  isBuiltInDigitalFormatType,
  canSaveProductSettings
} = require("../utils/digitalFormatTypes");

describe("Digital Format Types (pure)", () => {
  describe("normalizeDigitalFormatTypes", () => {
    it("keeps built-ins and returns default list when input is not an array", () => {
      const result = normalizeDigitalFormatTypes(null);
      assert.deepEqual(result, DEFAULT_DIGITAL_FORMAT_TYPES);
      BUILT_IN_DIGITAL_FORMAT_TYPES.forEach((b) => {
        assert.ok(result.includes(b), `Expected default list to include built-in "${b}"`);
      });
    });

    it("removes duplicates case-insensitively while preserving order", () => {
      const input = [
        "Web Version",
        "Flipbook",
        "Kindle",
        "E-Book",
        "e-book",
        "E-BOOK",
        "PDF",
        "pdf"
      ];
      const result = normalizeDigitalFormatTypes(input);
      assert.deepEqual(result, [
        "Web Version",
        "Flipbook",
        "Kindle",
        "E-Book",
        "PDF"
      ]);
    });

    it("trims whitespace and caps entries to 40 characters", () => {
      const longName = "A".repeat(50);
      const input = [
        "  Web Version  ",
        " Flipbook ",
        "Kindle",
        longName
      ];
      const result = normalizeDigitalFormatTypes(input);
      assert.equal(result[3], "A".repeat(40));
      assert.equal(result[0], "Web Version");
      assert.equal(result[1], "Flipbook");
    });

    it("refuses names containing 'kindle' (case-insensitive)", () => {
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "Kindle",
            "Kindle Unlimited"
          ]);
        },
        /cannot contain 'kindle'/i
      );

      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "Kindle",
            "Amazon-kindle-edition"
          ]);
        },
        /cannot contain 'kindle'/i
      );
    });

    it("refuses names containing 'flipbook' (case-insensitive)", () => {
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "Kindle",
            "Mini Flipbook"
          ]);
        },
        /cannot contain 'flipbook'/i
      );

      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "Kindle",
            "FLIPBOOK viewer"
          ]);
        },
        /cannot contain 'flipbook'/i
      );
    });

    it("refuses deleting built-in 'Kindle'", () => {
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "E-Book",
            "PDF"
          ]);
        },
        /Built-in digital format types/i
      );
    });

    it("refuses deleting built-in 'Flipbook'", () => {
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Kindle",
            "E-Book",
            "PDF"
          ]);
        },
        /Built-in digital format types/i
      );
    });

    it("refuses deleting built-in 'Web Version'", () => {
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Flipbook",
            "Kindle",
            "E-Book",
            "PDF"
          ]);
        },
        /Built-in digital format types/i
      );
    });

    it("refuses renaming built-in 'Kindle'", () => {
      // Trying to rename Kindle to e.g. "Amazon Reader"
      assert.throws(
        () => {
          normalizeDigitalFormatTypes([
            "Web Version",
            "Flipbook",
            "Amazon Reader",
            "E-Book"
          ]);
        },
        /Built-in digital format types/i
      );
    });

    it("auto-adds built-ins when autoAddBuiltIns option is enabled", () => {
      const result = normalizeDigitalFormatTypes(["E-Book", "PDF"], { autoAddBuiltIns: true });
      assert.ok(result.includes("Web Version"));
      assert.ok(result.includes("Flipbook"));
      assert.ok(result.includes("Kindle"));
      assert.ok(result.includes("E-Book"));
      assert.ok(result.includes("PDF"));
    });
  });

  describe("isBuiltInDigitalFormatType", () => {
    it("correctly identifies built-ins case-insensitively", () => {
      assert.equal(isBuiltInDigitalFormatType("Web Version"), true);
      assert.equal(isBuiltInDigitalFormatType("web version"), true);
      assert.equal(isBuiltInDigitalFormatType("Flipbook"), true);
      assert.equal(isBuiltInDigitalFormatType("FLIPBOOK"), true);
      assert.equal(isBuiltInDigitalFormatType("Kindle"), true);
      assert.equal(isBuiltInDigitalFormatType("kindle"), true);
      assert.equal(isBuiltInDigitalFormatType("E-Book"), false);
      assert.equal(isBuiltInDigitalFormatType("PDF"), false);
      assert.equal(isBuiltInDigitalFormatType("Other"), false);
      assert.equal(isBuiltInDigitalFormatType("Audio Book"), false);
    });
  });

  describe("permission rule: canSaveProductSettings", () => {
    it("allows a products-page admin to save digitalFormatTypes only", () => {
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes"], ["products"]),
        true
      );
    });

    it("allows an add-products-page admin to save digitalFormatTypes only", () => {
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes"], ["add-products"]),
        true
      );
    });

    it("allows an admin with products page to save productCategories only", () => {
      assert.equal(
        canSaveProductSettings(["productCategories"], ["products"]),
        true
      );
    });

    it("allows an admin with products page to save both productCategories and digitalFormatTypes", () => {
      assert.equal(
        canSaveProductSettings(["productCategories", "digitalFormatTypes"], ["products"]),
        true
      );
      assert.equal(
        canSaveProductSettings(["productCategories", "digitalFormatTypes"], ["add-products"]),
        true
      );
    });

    it("refuses when other settings keys are included in the request", () => {
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes", "gstPercent"], ["products"]),
        false
      );
      assert.equal(
        canSaveProductSettings(["productCategories", "deliveryCharge"], ["add-products"]),
        false
      );
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes", "siteTheme"], ["products"]),
        false
      );
    });

    it("refuses when admin does not have products or add-products page access", () => {
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes"], ["orders"]),
        false
      );
      assert.equal(
        canSaveProductSettings(["productCategories"], ["customers"]),
        false
      );
      assert.equal(
        canSaveProductSettings(["digitalFormatTypes"], []),
        false
      );
    });

    it("refuses when bodyKeys is empty", () => {
      assert.equal(canSaveProductSettings([], ["products"]), false);
    });
  });

  describe("normalizeSettings fallback on corrupted stored format types (pure, no DB)", () => {
    it("falls back to DEFAULT_DIGITAL_FORMAT_TYPES when stored digitalFormatTypes is corrupt", () => {
      const { normalizeSettings } = require("../routes/settingsRoutes");
      const corruptedSettings = {
        digitalFormatTypes: ["Corrupt Kindle Edition", "Mini Flipbook"]
      };
      const result = normalizeSettings(corruptedSettings);
      assert.deepEqual(result.digitalFormatTypes, [...DEFAULT_DIGITAL_FORMAT_TYPES]);
    });
  });
});
