const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  event: {
    type: String,
    default: "",
    trim: true
  },
  receivedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
