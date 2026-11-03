const mongoose = require("mongoose");
const { SUPPORT_TYPES, SUPPORT_STATUSES } = require("../utils/supportInterest");

// People who filled in the public "Support us" form
const supportInterestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    organisation: { type: String, default: "", trim: true },
    supportType: { type: String, required: true, enum: SUPPORT_TYPES.map((type) => type.value) },
    message: { type: String, required: true },
    consent: { type: Boolean, required: true },
    status: { type: String, enum: SUPPORT_STATUSES, default: "new" },
    adminNote: { type: String, default: "" },
    statusChangedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

supportInterestSchema.index({ status: 1, createdAt: -1 });
supportInterestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SupportInterest", supportInterestSchema);
