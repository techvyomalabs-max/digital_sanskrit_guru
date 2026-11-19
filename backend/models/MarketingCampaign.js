const mongoose = require("mongoose");

// One promotional email campaign sent from the admin dashboard (through Mailmodo
// or the site's own email server), so admins can see what went out, to whom and by whom.
const statsSchema = new mongoose.Schema(
  {
    sent: { type: Number, default: null },
    delivered: { type: Number, default: null },
    opened: { type: Number, default: null },
    clicked: { type: Number, default: null },
    unsubscribed: { type: Number, default: null },
    bounced: { type: Number, default: null },
    fetchedAt: { type: Date, default: null },
    error: { type: String, default: "" }
  },
  { _id: false }
);

const marketingCampaignSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ["mailmodo", "smtp"], default: "mailmodo" },
    status: {
      type: String,
      enum: ["preparing", "sending", "sent", "failed"],
      default: "preparing"
    },
    subject: { type: String, required: true, trim: true },
    heading: { type: String, default: "", trim: true },
    body: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    buttonText: { type: String, default: "" },
    buttonLink: { type: String, default: "" },

    audience: {
      filterType: { type: String, default: "all" },
      filterValue: { type: String, default: "" },
      label: { type: String, default: "" }
    },
    recipientCount: { type: Number, default: 0 },
    addedToList: { type: Number, default: 0 },
    teamOnly: { type: Boolean, default: false },

    // Mailmodo details
    listName: { type: String, default: "" },
    listId: { type: String, default: "" },
    mailmodoCampaignId: { type: String, default: "" },
    mailmodoRef: { type: String, default: "" },
    idempotencyKey: { type: String, default: "" },

    error: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    createdBy: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "" },
      email: { type: String, default: "" }
    },
    stats: { type: statsSchema, default: () => ({}) }
  },
  { timestamps: true }
);

marketingCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MarketingCampaign", marketingCampaignSchema);
