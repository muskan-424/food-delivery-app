import dotenv from "dotenv";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config();

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.MONGO_URL;

describe.skipIf(!runIntegration)("payout fraud rules (integration)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("detects open dispute on order", async () => {
    const orderModel = (await import("../../models/orderModel.js")).default;
    const disputeModel = (await import("../../models/disputeModel.js")).default;
    const orderEscrowModel = (await import("../../models/orderEscrowModel.js")).default;
    const { collectPayoutFraudSignals } = await import("../../services/payoutFraudRulesService.js");

    const order = await orderModel.create({
      userId: "integration_test_user",
      orderNumber: `INT${Date.now()}`,
      amount: 100,
      finalAmount: 100,
      status: "delivered",
      items: [],
      address: { name: "T", phone: "1", addressLine1: "x", city: "y", state: "z", pincode: "110001" },
    });

    const escrow = await orderEscrowModel.create({
      orderId: order._id,
      userId: String(order.userId),
      status: "RELEASE_ELIGIBLE",
      amount: 100,
    });

    await disputeModel.create({
      disputeNumber: `DSP${Date.now()}`,
      orderId: order._id,
      userId: String(order.userId),
      category: "other",
      subject: "test",
      description: "integration test dispute open",
      status: "open",
    });

    const signals = await collectPayoutFraudSignals(order, escrow);
    expect(signals.hasOpenDispute).toBe(true);

    await disputeModel.deleteMany({ orderId: order._id });
    await orderEscrowModel.deleteOne({ _id: escrow._id });
    await orderModel.deleteOne({ _id: order._id });
  });
});
