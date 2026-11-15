const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const GiftPass = require("../models/GiftPass");
const { router: giftRoutes } = require("../routes/giftRoutes");

const route = giftRoutes.stack.find((layer) => layer.route?.path === "/redeem" && layer.route.methods.post);
const redeemHandler = route.route.stack[route.route.stack.length - 1].handle;

function createMockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    }
  };
}

describe("POST /api/gifts/redeem", () => {
  afterEach(() => mock.restoreAll());

  it("the buyer can't redeem their own gift", async () => {
    const buyer = new mongoose.Types.ObjectId();
    mock.method(GiftPass, "findOne", async () => ({ code: "GIFT-DSG-1", buyer, isRedeemed: false, product: new mongoose.Types.ObjectId() }));
    const claim = mock.method(GiftPass, "findOneAndUpdate", async () => null);
    const res = createMockRes();
    await redeemHandler({ body: { code: "gift-dsg-1" }, user: buyer.toString() }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.code, "GIFT_OWN_PURCHASE");
    assert.equal(claim.mock.callCount(), 0);
  });
});
