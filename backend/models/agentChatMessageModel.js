import mongoose from "mongoose";

const agentChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "agentChatSession",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    body: { type: String, required: true, maxlength: 8000 },
    intent: { type: String, default: "" },
    confidence: { type: Number, default: null },
    replySource: { type: String, default: "rule" },
    tools: { type: mongoose.Schema.Types.Mixed, default: null },
    ragSources: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

agentChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

const agentChatMessageModel =
  mongoose.models.agentChatMessage ||
  mongoose.model("agentChatMessage", agentChatMessageSchema);

export default agentChatMessageModel;
