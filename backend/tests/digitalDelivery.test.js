const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { validateExternalDelivery } = require("../utils/digitalDelivery");
const { stripDigitalFields } = require("../utils/orderAccess");
const { PUBLIC_PRODUCT_EXCLUDE } = require("../utils/productProjection");

describe("digitalDelivery utility and access gate", () => {
  describe("validateExternalDelivery", () => {
    test("valid https link allowed for digital product", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/course",
        externalAccessLabel: "Access Course",
        isDigital: true,
        productType: "single"
      });
      assert.equal(res.isValid, true);
      assert.equal(res.ok, true);
      assert.equal(res.digitalDelivery, "external");
      assert.equal(res.externalAccessLink, "https://example.com/course");
      assert.equal(res.externalAccessLabel, "Access Course");
    });

    test("http link allowed", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "http://example.com/course",
        externalAccessLabel: "Access Course",
        isDigital: true,
        productType: "single"
      });
      assert.equal(res.isValid, true);
      assert.equal(res.ok, true);
      assert.equal(res.digitalDelivery, "external");
      assert.equal(res.externalAccessLink, "http://example.com/course");
    });

    test("javascript:/data:/ftp: protocols rejected", () => {
      const jsRes = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "javascript:alert(1)",
        isDigital: true,
        productType: "single"
      });
      assert.equal(jsRes.isValid, false);
      assert.equal(jsRes.ok, false);

      const dataRes = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        isDigital: true,
        productType: "single"
      });
      assert.equal(dataRes.isValid, false);
      assert.equal(dataRes.ok, false);

      const ftpRes = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "ftp://files.example.com/course.zip",
        isDigital: true,
        productType: "single"
      });
      assert.equal(ftpRes.isValid, false);
      assert.equal(ftpRes.ok, false);
    });

    test("empty link for external rejected", () => {
      const emptyRes1 = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "",
        isDigital: true,
        productType: "single"
      });
      assert.equal(emptyRes1.isValid, false);

      const emptyRes2 = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "   ",
        isDigital: true,
        productType: "single"
      });
      assert.equal(emptyRes2.isValid, false);

      const emptyRes3 = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: null,
        isDigital: true,
        productType: "single"
      });
      assert.equal(emptyRes3.isValid, false);
    });

    test("whitespace rejected", () => {
      const wsInside = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/course page",
        isDigital: true,
        productType: "single"
      });
      assert.equal(wsInside.isValid, false);

      const wsLeading = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: " https://example.com/course",
        isDigital: true,
        productType: "single"
      });
      assert.equal(wsLeading.isValid, false);

      const wsTrailing = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/course ",
        isDigital: true,
        productType: "single"
      });
      assert.equal(wsTrailing.isValid, false);
    });

    test("too long link rejected (> 500 chars)", () => {
      const longUrl = "https://example.com/" + "a".repeat(485);
      assert.ok(longUrl.length > 500);
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: longUrl,
        isDigital: true,
        productType: "single"
      });
      assert.equal(res.isValid, false);
    });

    test("label too long rejected (> 40 chars)", () => {
      const longLabel = "a".repeat(41);
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/course",
        externalAccessLabel: longLabel,
        isDigital: true,
        productType: "single"
      });
      assert.equal(res.isValid, false);
    });

    test("plain non-digital single forced to onsite with empty link and label", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/course",
        externalAccessLabel: "Course",
        isDigital: false,
        productType: "single"
      });
      assert.equal(res.isValid, true);
      assert.equal(res.ok, true);
      assert.equal(res.digitalDelivery, "onsite");
      assert.equal(res.externalAccessLink, "");
      assert.equal(res.externalAccessLabel, "");
    });

    test("combo allowed external delivery even if isDigital is false", () => {
      const res = validateExternalDelivery({
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/combo-access",
        externalAccessLabel: "Access Combo Content",
        isDigital: false,
        productType: "bundle"
      });
      assert.equal(res.isValid, true);
      assert.equal(res.ok, true);
      assert.equal(res.digitalDelivery, "external");
      assert.equal(res.externalAccessLink, "https://example.com/combo-access");
      assert.equal(res.externalAccessLabel, "Access Combo Content");
    });
  });

  describe("access gate & projection", () => {
    test("stripDigitalFields removes externalAccessLink and label from items and bundle items", () => {
      const item = {
        name: "External Combo",
        digitalDelivery: "external",
        externalAccessLink: "https://example.com/top",
        externalAccessLabel: "Top Access",
        webReaderLink: "https://example.com/reader",
        bundleItems: [
          {
            name: "Component Item",
            digitalDelivery: "external",
            externalAccessLink: "https://example.com/sub",
            externalAccessLabel: "Sub Access",
            webReaderLink: "https://example.com/subreader"
          }
        ]
      };

      const stripped = stripDigitalFields(item);
      assert.equal(stripped.name, "External Combo");
      assert.equal(stripped.digitalDelivery, "external");
      assert.equal(stripped.externalAccessLink, undefined);
      assert.equal(stripped.externalAccessLabel, undefined);
      assert.equal(stripped.webReaderLink, undefined);

      assert.equal(stripped.bundleItems[0].name, "Component Item");
      assert.equal(stripped.bundleItems[0].digitalDelivery, "external");
      assert.equal(stripped.bundleItems[0].externalAccessLink, undefined);
      assert.equal(stripped.bundleItems[0].externalAccessLabel, undefined);
      assert.equal(stripped.bundleItems[0].webReaderLink, undefined);
    });

    test("the public exclude list contains externalAccessLink and externalAccessLabel", () => {
      assert.ok(PUBLIC_PRODUCT_EXCLUDE.includes("-externalAccessLink"));
      assert.ok(PUBLIC_PRODUCT_EXCLUDE.includes("-externalAccessLabel"));
      assert.ok(PUBLIC_PRODUCT_EXCLUDE.includes("-bundleItems.externalAccessLink"));
      assert.ok(PUBLIC_PRODUCT_EXCLUDE.includes("-bundleItems.externalAccessLabel"));
    });
  });
});
