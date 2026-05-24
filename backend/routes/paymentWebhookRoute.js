import express from "express";
import { handlePaymentWebhook } from "../controllers/paymentWebhookController.js";

const paymentWebhookRouter = express.Router();

paymentWebhookRouter.post("/:provider", handlePaymentWebhook);

export default paymentWebhookRouter;
