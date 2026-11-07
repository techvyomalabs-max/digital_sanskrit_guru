const mongoose = require("mongoose");

// A lease that lets only one server worker run a background job at a time,
// plus a summary of that job's last run.
const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String },
    owner: { type: String, default: "" },
    lockedUntil: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastResult: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model("JobLock", jobLockSchema);
