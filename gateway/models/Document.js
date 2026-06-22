const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    docId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    status: { type: String, enum: ["processing", "indexed", "failed"], default: "processing" },
    entities: {
      equipment_tags: [{ type: String }],
      process_parameters: [{ type: String }],
      safety_standards: [{ type: String }],
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
