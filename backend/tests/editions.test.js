const test = require("node:test");
const assert = require("node:assert/strict");

test("editions: finds the same title's other editions, one each, never itself", async () => {
  const { otherEditions, editionOf } = await import("../../src/utils/editions.js");
  const me = { _id: "1", name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ )", isDigital: true, productType: "single" };
  const catalog = [
    me,
    { _id: "2", name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ ) -(Kindle Edition) eBook", isDigital: true },
    { _id: "3", name: "Dhaturupa Parichaya (Dhāturūpaparicayaḥ) – Digital Flipbook", isDigital: true },
    { _id: "4", name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ) – Paperback" },
    { _id: "5", name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ) – Paperback" },
    { _id: "6", name: "Dhaturupa Parichaya (Dhāturūpa-paricayaḥ) – Volume 2 – Paperback" },
    { _id: "7", name: "Dhaturupa Parichaya – Web Version", isDigital: true, hideFromListings: true },
    { _id: "8", name: "Amarakosha – Paperback" }
  ];
  assert.equal(editionOf(me).key, "web-version");
  const found = otherEditions(me, catalog).map((e) => [e.product._id, e.label]);
  assert.deepEqual(found, [["2", "Kindle"], ["3", "Flipbook"], ["4", "Paperback"]], "volume 2 is another book; hidden ones skipped");
});

test("editions: nothing for very short or unrelated titles", async () => {
  const { otherEditions } = await import("../../src/utils/editions.js");
  assert.deepEqual(otherEditions({ _id: "1", name: "Gita" }, [{ _id: "2", name: "Gita – Kindle" }]), []);
  assert.deepEqual(otherEditions(null, []), []);
});
