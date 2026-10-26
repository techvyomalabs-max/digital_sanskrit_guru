const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("plainText utility (pure)", async () => {
  const { htmlToPlainText } = await import("../../src/utils/plainText.js");

  it("converts lists and block tags into space-separated clean text", () => {
    const input = "<ul> <li><strong>Hello</strong></li> <li>World</li></ul>";
    assert.equal(htmlToPlainText(input), "Hello World");
  });

  it("handles headings, paragraphs, styled tags, entities and non-breaking spaces", () => {
    const input = '<h4 style="color: red;">Title</h4><p>Body &amp; more&nbsp;text</p>';
    assert.equal(htmlToPlainText(input), "Title Body & more text");
  });

  it("completely removes script blocks and their content", () => {
    const input = "<script>alert(1)</script>Safe";
    assert.equal(htmlToPlainText(input), "Safe");
  });

  it("completely removes style blocks and their content", () => {
    const input = "<style>body { color: red; }</style>Content";
    assert.equal(htmlToPlainText(input), "Content");
  });

  it("removes inline media tags like img with event handlers", () => {
    const input = "<img src=x onerror=alert(1)>Text";
    assert.equal(htmlToPlainText(input), "Text");
  });

  it("preserves entity text like '&lt;b&gt;' as literal visible characters '<b>'", () => {
    const input = "The code is &lt;b&gt;bold&lt;/b&gt;";
    assert.equal(htmlToPlainText(input), "The code is <b>bold</b>");
  });

  it("decodes decimal and hexadecimal numeric entities", () => {
    const decimalInput = "Item &#65; costs &#8377;100";
    assert.equal(htmlToPlainText(decimalInput), "Item A costs ₹100");

    const hexInput = "Sanskrit &#x2014; &#x41;";
    assert.equal(htmlToPlainText(hexInput), "Sanskrit — A");
  });

  it("cuts at a word boundary when maxLength is set and appends '…'", () => {
    const input = "<p>The quick brown fox jumps over the lazy dog</p>";
    // Cutting with maxLength = 16 (index 16 is 'o' in 'fox', last space before is at 15 after 'brown')
    const result = htmlToPlainText(input, 16);
    assert.equal(result, "The quick brown…");

    // When maxLength exceeds string length, no ellipsis added
    assert.equal(htmlToPlainText("<p>Short</p>", 20), "Short");
  });

  it("does not throw on null, undefined, or numbers", () => {
    assert.doesNotThrow(() => htmlToPlainText(null));
    assert.doesNotThrow(() => htmlToPlainText(undefined));
    assert.doesNotThrow(() => htmlToPlainText(12345));
    assert.doesNotThrow(() => htmlToPlainText(0));

    assert.equal(htmlToPlainText(null), "");
    assert.equal(htmlToPlainText(undefined), "");
    assert.equal(htmlToPlainText(12345), "12345");
    assert.equal(htmlToPlainText(0), "0");
  });

  it("preserves Sanskrit diacritics such as Gītā", () => {
    const input = "<h3>Śrīmad Bhagavad Gītā</h3><p>Aṣṭādhyāyī and Dhāturūpa</p>";
    assert.equal(htmlToPlainText(input), "Śrīmad Bhagavad Gītā Aṣṭādhyāyī and Dhāturūpa");
  });
});
