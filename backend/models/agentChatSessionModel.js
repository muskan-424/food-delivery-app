import mongoose from "mongoose";

const agentChatSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    channel: { type: String, default: "agent", enum: ["agent"] },
    status: { type: String, enum: ["active", "closed"], default: "active", index: true },
    lastIntent: { type: String, default: "" },
    lastMessageAt: { type: Date, default: null },
    messageCount: { type: Number, default: 0, min: 0 },
    language: { type: String, default: "en" },
  },
  { timestamps: true }
);

const agentChatSessionModel =
  mongoose.models.agentChatSession ||
  mongoose.model("agentChatSession", agentChatSessionSchema);

export default agentChatSessionModel;
