import express from "express";
import { 
  createTicket, 
  getMyTickets, 
  getTicket, 
  addMessage,
  updateTicket,
  deleteTicket,
  getAllTickets, 
  assignTicket,
  updateTicketStatus,
  escalateTicket,
  rateTicket,
  addInternalNote,
  getFAQ 
} from "../controllers/supportController.js";
import {
  createAgent,
  getAllAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  getAgentStats,
  getAgentTickets,
  getDashboardStats
} from "../controllers/supportAgentController.js";
import authMiddleware from "../middleware/auth.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import idempotencyMiddleware from "../middleware/idempotencyMiddleware.js";

const supportRouter = express.Router();

// Apply idempotency to ticket creation
const ticketIdempotency = idempotencyMiddleware({ endpoints: ['/ticket'] });
const agentIdempotency = idempotencyMiddleware({ endpoints: ['/agent'] });

// Public routes
supportRouter.get("/faq", apiLimiter, getFAQ);

// User routes
supportRouter.post("/ticket", apiLimiter, authMiddleware, ticketIdempotency, createTicket);
supportRouter.get("/tickets", apiLimiter, authMiddleware, getMyTickets);
supportRouter.get("/ticket/:ticketId", apiLimiter, authMiddleware, getTicket);
supportRouter.post("/ticket/:ticketId/message", apiLimiter, authMiddleware, addMessage);
supportRouter.put("/ticket/:ticketId", apiLimiter, authMiddleware, updateTicket);
supportRouter.delete("/ticket/:ticketId", apiLimiter, authMiddleware, deleteTicket);
supportRouter.post("/ticket/:ticketId/rate", apiLimiter, authMiddleware, rateTicket);

// Admin routes - Tickets
supportRouter.get("/all", apiLimiter, authMiddleware, adminMiddleware, getAllTickets);
supportRouter.post("/ticket/:ticketId/assign", apiLimiter, authMiddleware, adminMiddleware, assignTicket);
supportRouter.put("/ticket/:ticketId/status", apiLimiter, authMiddleware, adminMiddleware, updateTicketStatus);
supportRouter.post("/ticket/:ticketId/escalate", apiLimiter, authMiddleware, adminMiddleware, escalateTicket);
supportRouter.post("/ticket/:ticketId/note", apiLimiter, authMiddleware, adminMiddleware, addInternalNote);
supportRouter.post("/ticket/:ticketId/message", apiLimiter, authMiddleware, adminMiddleware, addMessage);

// Admin routes - Agents
supportRouter.post("/agent", apiLimiter, authMiddleware, adminMiddleware, agentIdempotency, createAgent);
supportRouter.get("/agents", apiLimiter, authMiddleware, adminMiddleware, getAllAgents);
supportRouter.get("/agent/:agentId", apiLimiter, authMiddleware, adminMiddleware, getAgent);
supportRouter.put("/agent/:agentId", apiLimiter, authMiddleware, adminMiddleware, updateAgent);
supportRouter.delete("/agent/:agentId", apiLimiter, authMiddleware, adminMiddleware, deleteAgent);
supportRouter.get("/agent/:agentId/stats", apiLimiter, authMiddleware, adminMiddleware, getAgentStats);
supportRouter.get("/agent/:agentId/tickets", apiLimiter, authMiddleware, adminMiddleware, getAgentTickets);

// Admin routes - Dashboard
supportRouter.get("/dashboard/stats", apiLimiter, authMiddleware, adminMiddleware, getDashboardStats);

export default supportRouter;
