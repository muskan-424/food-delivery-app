import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { appConfig } from "../config/appConfig.js";
import { verifyAccessToken } from "../utils/authUtils.js";
import userModel from "../models/userModel.js";

let io = null;
let pubClient = null;
let subClient = null;
let redisAdapterEnabled = false;

function userRoom(userId) {
  return `user:${String(userId)}`;
}

export async function initWebsocketServer(httpServer) {
  if (!appConfig.enableWebsocket) {
    return null;
  }
  io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/ws",
  });

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
      subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect?.(), subClient.connect?.()].filter(Boolean));
      io.adapter(createAdapter(pubClient, subClient));
      redisAdapterEnabled = true;
    } catch (err) {
      console.error("[ws] Redis adapter init failed:", err?.message || err);
      redisAdapterEnabled = false;
    }
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("token_required"));
      const decoded = verifyAccessToken(String(token));
      const user = await userModel.findById(decoded.id).select("_id isBlocked");
      if (!user || user.isBlocked) return next(new Error("unauthorized"));
      socket.data.userId = String(user._id);
      return next();
    } catch {
      return next(new Error("invalid_token"));
    }
  });

  io.on("connection", (socket) => {
    const uid = socket.data.userId;
    socket.join(userRoom(uid));
    socket.emit("connected", { userId: uid, at: new Date().toISOString() });
  });

  return io;
}

export function broadcastWsToUser(userId, eventName, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit(eventName, payload);
}

export function getWsStats() {
  return {
    enabled: !!io,
    redisAdapterEnabled,
    sockets: io ? io.engine.clientsCount : 0,
    path: "/ws",
  };
}

