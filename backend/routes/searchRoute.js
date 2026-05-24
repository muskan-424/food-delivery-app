import express from "express";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { unifiedSearch } from "../controllers/searchController.js";

const searchRouter = express.Router();

searchRouter.get("/", apiLimiter, unifiedSearch);

export default searchRouter;

