const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ["success", "failed", "denied"], default: "success" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
