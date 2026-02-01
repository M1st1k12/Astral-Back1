import mongoose from "mongoose";

const ClanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    leader: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    motto: { type: String, default: "" },
    announcement: { type: String, default: "" },
    isPrivate: { type: Boolean, default: false },
    joinRequests: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model("Clan", ClanSchema);
