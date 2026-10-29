const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  isDigitalLikeItem,
  canAutoComplete,
  shouldCompleteAfterGrant
} = require("../utils/accessFulfilment");

describe("mixedCombo - physical items in bundle line tests (pure, no DB)", () => {
  test('bundle line named "Gita Web Version + Book Combo" with bundleItems [{ name: "Gita Web", isDigital: true, webReaderLink: "https://x" }, { name: "Gita Book", isDigital: false }] -> isDigitalLikeItem false; canAutoComplete([line]) false', () => {
    const line = {
      name: "Gita Web Version + Book Combo",
      bundleItems: [
        { name: "Gita Web", isDigital: true, webReaderLink: "https://x" },
        { name: "Gita Book", isDigital: false }
      ]
    };

    assert.equal(isDigitalLikeItem(line), false);
    assert.equal(canAutoComplete([line]), false);
  });

  test("same bundle with the line's own isDigital: true -> still false", () => {
    const line = {
      name: "Gita Web Version + Book Combo",
      isDigital: true,
      bundleItems: [
        { name: "Gita Web", isDigital: true, webReaderLink: "https://x" },
        { name: "Gita Book", isDigital: false }
      ]
    };

    assert.equal(isDigitalLikeItem(line), false);
    assert.equal(canAutoComplete([line]), false);
  });

  test("bundle with two digital components (isDigital true) -> true; canAutoComplete true", () => {
    const line = {
      name: "Digital Duo Bundle",
      bundleItems: [
        { name: "Gita Web", isDigital: true },
        { name: "Upanishad Web", isDigital: true }
      ]
    };

    assert.equal(isDigitalLikeItem(line), true);
    assert.equal(canAutoComplete([line]), true);
  });

  test("bundle where one component only has an externalAccessLink -> counts as digital", () => {
    const line = {
      name: "Portal Bundle",
      bundleItems: [
        { name: "Course Portal", externalAccessLink: "https://example.com/portal" }
      ]
    };

    assert.equal(isDigitalLikeItem(line), true);
    assert.equal(canAutoComplete([line]), true);
  });

  test('bundle with a custom physical component { name: "Rudraksha Mala", isDigital: false } -> false', () => {
    const line = {
      name: "Spiritual Pack",
      bundleItems: [
        { name: "Gita Web", isDigital: true, webReaderLink: "https://x" },
        { name: "Rudraksha Mala", isDigital: false }
      ]
    };

    assert.equal(isDigitalLikeItem(line), false);
    assert.equal(canAutoComplete([line]), false);
  });

  test('single item named "Web Version" with no bundleItems -> still true (unchanged)', () => {
    const singleItem = {
      name: "Web Version"
    };

    assert.equal(isDigitalLikeItem(singleItem), true);
    assert.equal(canAutoComplete([singleItem]), true);
  });

  test("shouldCompleteAfterGrant for a granted manual-access combo that also contains a book -> false", () => {
    const grantedComboWithBook = {
      name: "Gita Web Version + Book Combo",
      accessManual: true,
      accessGrantedAt: new Date(),
      bundleItems: [
        { name: "Gita Web", isDigital: true, webReaderLink: "https://x" },
        { name: "Gita Book", isDigital: false }
      ]
    };

    assert.equal(shouldCompleteAfterGrant([grantedComboWithBook]), false);
  });
});
