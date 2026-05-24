import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  countUnread,
} from "../services/notificationService.js";
import { registerSseClient } from "../realtime/sseHub.js";
import { appConfig } from "../config/appConfig.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

const getInbox = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await listNotifications(userId, { page, limit });
    const unread = await countUnread(userId);
    sendSuccess(res, req, 200, { success: true, unreadCount: unread, ...result });
  } catch (error) {
    console.error("getInbox:", error);
    sendError(res, req, 500, "Error loading notifications");
  }
};

const patchRead = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { notificationId } = req.params;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }
    const ok = await markNotificationRead(userId, notificationId);
    if (!ok) {
      return sendError(res, req, 404, "Notification not found");
    }
    sendSuccess(res, req, 200, { success: true, message: "Marked as read" });
  } catch (error) {
    console.error("patchRead:", error);
    sendError(res, req, 500, "Error updating notification");
  }
};

const postReadAll = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "Unauthorized");
    }
    await markAllNotificationsRead(userId);
    sendSuccess(res, req, 200, { success: true, message: "All notifications marked read" });
  } catch (error) {
    console.error("postReadAll:", error);
    sendError(res, req, 500, "Error updating notifications");
  }
};

const streamSse = (req, res) => {
  const userId = req.userId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const reg = registerSseClient(userId, res);
  if (!reg.ok) {
    return sendError(res, req, 429, "Too many live notification streams", {
      data: { reason: reg.reason },
    });
  }
  const { unregister } = reg;
  res.write(
    `data: ${JSON.stringify({ type: "connected", userId, at: new Date().toISOString() })}\n\n`
  );

  let lastWriteAt = Date.now();
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
      lastWriteAt = Date.now();
    } catch {
      clearInterval(heartbeat);
      clearInterval(idleTimer);
      unregister();
    }
  }, appConfig.sseHeartbeatIntervalMs);

  const idleTimer = setInterval(() => {
    if (Date.now() - lastWriteAt > appConfig.sseIdleTimeoutMs) {
      clearInterval(heartbeat);
      clearInterval(idleTimer);
      unregister();
      try {
        res.end();
      } catch {
        // ignore close errors
      }
    }
  }, Math.min(appConfig.sseHeartbeatIntervalMs, 30000));

  req.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(idleTimer);
    unregister();
  });
};

export { getInbox, patchRead, postReadAll, streamSse };
