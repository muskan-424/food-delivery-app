import express from "express";
import { handleKycWebhook } from "../controllers/kycWebhookController.js";

const kycWebhookRouter = express.Router();

kycWebhookRouter.post("/", handleKycWebhook);

export default kycWebhookRouter;
