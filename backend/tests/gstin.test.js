const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeGstin,
  isValidGstinFormat,
  gstinCheckChar,
  isValidGstinChecksum,
  gstinStateCode,
  stateByCode,
  codeByStateName,
  validateBusinessDetails,
  determineIsIntrastate
} = require("../utils/gstin");

describe("GSTIN helper functions (pure)", () => {
  test("27AAPFU0939F1ZV passes format and checksum; changing its last character fails checksum but still passes format", () => {
    const valid = "27AAPFU0939F1ZV";
    assert.strictEqual(isValidGstinFormat(valid), true);
    assert.strictEqual(isValidGstinChecksum(valid), true);

    const tampered = "27AAPFU0939F1ZA";
    assert.strictEqual(isValidGstinFormat(tampered), true);
    assert.strictEqual(isValidGstinChecksum(tampered), false);
  });

  test("29AABTV0911M1ZE and 29DSGXX1234F1Z0 pass format but FAIL checksum", () => {
    const g1 = "29AABTV0911M1ZE";
    assert.strictEqual(isValidGstinFormat(g1), true);
    assert.strictEqual(isValidGstinChecksum(g1), false);

    const g2 = "29DSGXX1234F1Z0";
    assert.strictEqual(isValidGstinFormat(g2), true);
    assert.strictEqual(isValidGstinChecksum(g2), false);
  });

  test("lowercase input normalises; wrong length/pattern fails format; gstinStateCode returns the first two digits; stateByCode('29') is Karnataka", () => {
    assert.strictEqual(normalizeGstin(" 27aapfu0939f1zv "), "27AAPFU0939F1ZV");
    assert.strictEqual(isValidGstinFormat("27aapfu0939f1zv"), true);

    assert.strictEqual(isValidGstinFormat("27AAPFU0939F1Z"), false); // 14 chars
    assert.strictEqual(isValidGstinFormat("27AAPFU0939F1ZVV"), false); // 16 chars
    assert.strictEqual(isValidGstinFormat("27AAPFU0939F10V"), false); // 14th char must be Z
    assert.strictEqual(isValidGstinFormat(""), false);
    assert.strictEqual(isValidGstinFormat(null), false);

    assert.strictEqual(gstinStateCode("29AABTV0911M1ZE"), "29");
    assert.strictEqual(gstinStateCode("27AAPFU0939F1ZV"), "27");

    assert.strictEqual(stateByCode("29"), "Karnataka");
    assert.strictEqual(stateByCode(29), "Karnataka");
    assert.strictEqual(codeByStateName("Karnataka"), "29");
    assert.strictEqual(codeByStateName("karnataka"), "29");
    assert.strictEqual(codeByStateName("KA"), "29");
    assert.strictEqual(codeByStateName("ka"), "29");
  });

  test("validateBusinessDetails server-side rule helper", () => {
    // 1. Empty GSTIN is allowed
    const resEmpty = validateBusinessDetails({
      legalName: "Digital Sanskrit Guru Store",
      gstin: "",
      address: "Bangalore",
      state: "Karnataka",
      stateCode: "29",
      email: "support@digitalsanskritguru.com"
    });
    assert.strictEqual(resEmpty.ok, true);
    assert.strictEqual(resEmpty.data.gstin, "");

    // 2. Valid format and matching state is accepted
    const resValid = validateBusinessDetails({
      legalName: "Vyoma Linguistic Labs Foundation",
      gstin: "27AAPFU0939F1ZV",
      address: "Mumbai",
      state: "Maharashtra",
      stateCode: "27",
      email: "admin@vyomalabs.in"
    });
    assert.strictEqual(resValid.ok, true);
    assert.strictEqual(resValid.data.gstin, "27AAPFU0939F1ZV");

    // 3. A bad check digit is allowed (not hard-failed) as long as format and state match
    const resBadCheckDigit = validateBusinessDetails({
      legalName: "DSG",
      gstin: "29AABTV0911M1ZE",
      address: "Bangalore",
      state: "Karnataka",
      stateCode: "29",
      email: "test@example.com"
    });
    assert.strictEqual(resBadCheckDigit.ok, true);
    assert.strictEqual(resBadCheckDigit.data.gstin, "29AABTV0911M1ZE");

    // 4. GSTIN state code that does not match selected state is rejected
    const resMismatchedState = validateBusinessDetails({
      legalName: "DSG",
      gstin: "27AAPFU0939F1ZV", // 27 = Maharashtra
      address: "Bangalore",
      state: "Karnataka", // 29 = Karnataka
      stateCode: "29",
      email: "test@example.com"
    });
    assert.strictEqual(resMismatchedState.ok, false);
    assert.match(resMismatchedState.message, /GSTIN state code \(27\) does not match the selected state \(Karnataka\)/);

    // 5. Invalid GSTIN format rejected
    const resBadFormat = validateBusinessDetails({
      gstin: "INVALID123",
      state: "Karnataka",
      stateCode: "29"
    });
    assert.strictEqual(resBadFormat.ok, false);
    assert.strictEqual(resBadFormat.message, "Enter a valid 15-character GSTIN.");

    // 6. Selected state missing or stateCode mismatch rejected when GSTIN provided
    const resMissingState = validateBusinessDetails({
      gstin: "29AABTV0911M1ZE",
      state: "",
      stateCode: ""
    });
    assert.strictEqual(resMissingState.ok, false);
    assert.strictEqual(resMissingState.message, "Select the business state.");
  });

  test("determineIsIntrastate tax logic helper", () => {
    // 1. Order taxDetails cgst + sgst > 0 -> intra-state (true)
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: { cgstAmount: 50, sgstAmount: 50, igstAmount: 0 } }, "Maharashtra", "Karnataka"),
      true
    );

    // 2. Order taxDetails igst > 0 -> inter-state (false)
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: { cgstAmount: 0, sgstAmount: 0, igstAmount: 100 } }, "Karnataka", "Karnataka"),
      false
    );

    // 3. Fallback: compare customer state with seller state
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: {} }, "Karnataka", "Karnataka"),
      true
    );
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: {} }, "KA", "Karnataka"),
      true
    );
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: {} }, "karnataka", ""), // fallback to Karnataka
      true
    );
    assert.strictEqual(
      determineIsIntrastate({ taxDetails: {} }, "Delhi", "Karnataka"),
      false
    );
  });
});
