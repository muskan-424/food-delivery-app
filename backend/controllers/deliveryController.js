import crypto from "crypto";
import { deliveryPersonModel, deliveryAssignmentModel } from "../models/deliveryModel.js";
import orderModel from "../models/orderModel.js";
import restaurantModel from "../models/restaurantModel.js";
import userModel from "../models/userModel.js";
import { transitionOrderById } from "../services/orderTransitionService.js";
import { buildDeliveryEtaSnapshot } from "../services/deliveryEtaService.js";
import { recordOrderEvent } from "../services/orderEventService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { sendDeliveryOtpSms } from "../utils/smsService.js";
import { appConfig } from "../config/appConfig.js";
import { haversineKm } from "../utils/geoUtils.js";
import { createSignedPutUrl, getMediaPublicUrl } from "../utils/mediaStorage.js";
import { normalizeUploadedMediaKey } from "../utils/mediaKeyValidation.js";
import bcrypt from "bcrypt";

const resolveDeliveryPersonAuthContext = async (authUserId) => {
  const uid = String(authUserId || "").trim();
  if (!uid) return null;
  const linked = await deliveryPersonModel.findOne({ linkedUserId: uid }).select("_id");
  if (linked) {
    return { deliveryPersonId: String(linked._id), authMode: "linked_user" };
  }
  const legacy = await deliveryPersonModel.findById(uid).select("_id");
  if (legacy) {
    return { deliveryPersonId: String(legacy._id), authMode: "legacy_delivery_id" };
  }
  return null;
};

const ACTIVE_BATCHABLE_STATUSES = new Set(["assigned", "accepted", "picked_up", "on_the_way"]);

// Create delivery person (Admin)
const createDeliveryPerson = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      vehicleType,
      vehicleNumber,
      licenseNumber,
      linkedUserId,
    } = req.body;

    if (!name || !email || !phone || !password) {
      return sendError(res, req, 400, "Name, email, phone, and password are required");
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const linkedId = linkedUserId ? String(linkedUserId).trim() : "";
    if (linkedId) {
      const linkedUser = await userModel.findById(linkedId).select("_id role");
      if (!linkedUser) {
        return sendError(res, req, 400, "linkedUserId does not reference a valid user");
      }
    }

    const deliveryPerson = new deliveryPersonModel({
      name,
      email,
      phone,
      password: hashedPassword,
      vehicleType: vehicleType || 'bike',
      vehicleNumber: vehicleNumber || '',
      licenseNumber: licenseNumber || '',
      linkedUserId: linkedId || null,
    });

    await deliveryPerson.save();

    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Delivery person created successfully",
      data: { ...deliveryPerson.toObject(), password: undefined }
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, req, 409, "Email already exists");
    }
    console.log(error);
    sendError(res, req, 500, "Error creating delivery person");
  }
};

// Assign delivery person to order (Admin)
const assignDelivery = async (req, res) => {
  try {
    const { orderId, deliveryPersonId } = req.body;

    if (!orderId || !deliveryPersonId) {
      return sendError(res, req, 400, "Order ID and delivery person ID are required");
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      return sendError(res, req, 400, "Cannot assign delivery to completed or cancelled order");
    }

    const deliveryPerson = await deliveryPersonModel.findById(deliveryPersonId);
    if (!deliveryPerson) {
      return sendError(res, req, 404, "Delivery person not found");
    }

    if (!deliveryPerson.isAvailable) {
      return sendError(res, req, 400, "Delivery person is not available");
    }

    // Check if already assigned
    const existingAssignment = await deliveryAssignmentModel.findOne({ orderId });
    if (existingAssignment) {
      return sendError(res, req, 409, "Order already has a delivery assignment");
    }

    const restaurant = order.restaurantId
      ? await restaurantModel.findById(order.restaurantId)
      : null;
    const etaSnap = await buildDeliveryEtaSnapshot(order, restaurant);
    const fallbackEta = new Date();
    fallbackEta.setMinutes(fallbackEta.getMinutes() + 40);
    const estimatedDeliveryTime = etaSnap.etaAt || fallbackEta;

    const otpPlain = String(crypto.randomInt(100000, 999999));
    const otpSalt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const otpHash = await bcrypt.hash(otpPlain, otpSalt);
    const otpExpiresAt = new Date(Date.now() + appConfig.deliveryOtpTtlMinutes * 60 * 1000);

    const assignment = new deliveryAssignmentModel({
      orderId,
      deliveryPersonId,
      status: 'assigned',
      estimatedDeliveryTime,
      otpHash,
      otpExpiresAt,
      otpNotification: {
        channel: "sms",
        provider: appConfig.deliveryOtpSmsProvider,
        status: "pending",
        sentAt: null,
        messageId: "",
        reason: "",
      },
      deliveryAddress: {
        type: order.address.type,
        address: `${order.address.addressLine1}, ${order.address.city}, ${order.address.state} ${order.address.pincode}`,
        coordinates: order.address.coordinates
      }
    });

    const otpSms = await sendDeliveryOtpSms({
      toPhone: order?.address?.phone,
      otp: otpPlain,
      orderNumber: order?.orderNumber,
    });
    assignment.otpNotification = {
      channel: "sms",
      provider: otpSms.provider || appConfig.deliveryOtpSmsProvider,
      status: otpSms.ok
        ? "sent"
        : otpSms.reason === "provider_disabled" || otpSms.reason === "missing_phone"
          ? "skipped"
          : "failed",
      sentAt: otpSms.ok ? new Date() : null,
      messageId: otpSms.messageId || "",
      reason: otpSms.reason || "",
    };

    await assignment.save();

    const t = await transitionOrderById(orderId, "out_for_delivery", {
      allowDeliveryAssign: true,
      updatedBy: "admin",
      message: "Delivery assigned",
    });
    if (!t.ok) {
      await deliveryAssignmentModel.findByIdAndDelete(assignment._id);
      return sendError(
        res,
        req,
        400,
        t.code === "INVALID_TRANSITION"
          ? `Cannot move order to out_for_delivery from ${t.from}`
          : "Order not found"
      );
    }

    const o = await orderModel.findById(orderId);
    o.deliveryPersonId = deliveryPersonId;
    o.estimatedDeliveryTime = estimatedDeliveryTime;
    o.deliveryEtaSnapshot = {
      etaAt: etaSnap.etaAt,
      distanceKm: etaSnap.distanceKm,
      estimatedMinutes: etaSnap.estimatedMinutes,
      source: etaSnap.source,
      computedAt: etaSnap.computedAt,
    };
    await o.save();

    await recordOrderEvent({
      orderId: o._id,
      type: "delivery.assigned",
      payload: {
        deliveryPersonId: String(deliveryPersonId),
        distanceKm: etaSnap.distanceKm,
        estimatedMinutes: etaSnap.estimatedMinutes,
        otpNotification: {
          channel: assignment.otpNotification?.channel || "sms",
          provider: assignment.otpNotification?.provider || "",
          status: assignment.otpNotification?.status || "unknown",
        },
      },
      actor: { kind: "admin", id: String(req.body.userId || "") },
    });

    // Update delivery person
    deliveryPerson.isAvailable = false;
    deliveryPerson.totalDeliveries += 1;
    await deliveryPerson.save();

    const raw = assignment.toObject();
    delete raw.otpHash;
    const payload = { ...raw };
    if (process.env.NODE_ENV === "development") {
      payload.devDeliveryOtp = otpPlain;
    }

    sendSuccess(res, req, 201, { 
      success: true, 
      message: "Delivery assigned successfully",
      data: payload
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error assigning delivery");
  }
};

// Update delivery location (Delivery Person)
const updateDeliveryLocation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;

    if (!lat || !lng) {
      return sendError(res, req, 400, "Latitude and longitude are required");
    }

    const assignment = await deliveryAssignmentModel.findOne({ 
      orderId,
      deliveryPersonId 
    });

    if (!assignment) {
      return sendError(res, req, 404, "Delivery assignment not found");
    }

    assignment.currentLocation = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      updatedAt: new Date()
    };

    await assignment.save();

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Location updated successfully",
      data: assignment.currentLocation
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating location");
  }
};

// Get delivery assignments for delivery person
const getMyDeliveries = async (req, res) => {
  try {
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;
    const status = req.query.status;

    const query = { deliveryPersonId };
    if (status) {
      query.status = status;
    }

    const assignments = await deliveryAssignmentModel
      .find(query)
      .populate('orderId')
      .sort({ assignedAt: -1 });

    if (req.query.grouped === "true") {
      const groups = new Map();
      for (const a of assignments) {
        const key = a.batchId ? `batch:${a.batchId}` : `single:${String(a._id)}`;
        if (!groups.has(key)) {
          groups.set(key, {
            batchId: a.batchId || null,
            deliveryPersonId,
            status: a.batchId ? "batched" : "single",
            stops: [],
          });
        }
        groups.get(key).stops.push(a);
      }
      const data = Array.from(groups.values()).map((g) => ({
        ...g,
        stopCount: g.stops.length,
        stops: g.stops.sort(
          (x, y) => (Number(x.batchSequence) || 9999) - (Number(y.batchSequence) || 9999)
        ),
      }));
      return sendSuccess(res, req, 200, { success: true, data, grouped: true });
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      data: assignments
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error fetching deliveries");
  }
};

const groupAssignmentsIntoBatch = async (req, res) => {
  try {
    const { deliveryPersonId, assignmentIds } = req.body;
    if (!deliveryPersonId || !Array.isArray(assignmentIds) || assignmentIds.length < 2) {
      return sendError(
        res,
        req,
        400,
        "deliveryPersonId and assignmentIds (min 2) are required"
      );
    }
    if (assignmentIds.length > 12) {
      return sendError(res, req, 400, "Batching supports at most 12 assignments");
    }
    const uniqueIds = Array.from(new Set(assignmentIds.map((x) => String(x).trim()).filter(Boolean)));
    const assignments = await deliveryAssignmentModel
      .find({ _id: { $in: uniqueIds }, deliveryPersonId })
      .sort({ assignedAt: 1 });
    if (assignments.length !== uniqueIds.length) {
      return sendError(res, req, 400, "Some assignments were not found for this delivery person");
    }
    const bad = assignments.find((a) => !ACTIVE_BATCHABLE_STATUSES.has(String(a.status)));
    if (bad) {
      return sendError(
        res,
        req,
        409,
        `Assignment ${bad._id} with status ${bad.status} cannot be batched`
      );
    }
    const batchId = `BAT${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    const now = new Date();
    for (let i = 0; i < assignments.length; i += 1) {
      assignments[i].batchId = batchId;
      assignments[i].batchSequence = i + 1;
      assignments[i].batchGroupedAt = now;
      await assignments[i].save();
    }
    sendSuccess(res, req, 200, {
      success: true,
      message: "Assignments grouped into batch",
      data: {
        batchId,
        stopCount: assignments.length,
        assignments: assignments.map((a) => ({
          assignmentId: a._id,
          orderId: a.orderId,
          batchSequence: a.batchSequence,
        })),
      },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error grouping assignments into batch");
  }
};

const resequenceBatchAssignments = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { assignmentIds } = req.body;
    if (!batchId || !Array.isArray(assignmentIds) || assignmentIds.length < 1) {
      return sendError(res, req, 400, "batchId and assignmentIds are required");
    }
    const ids = Array.from(new Set(assignmentIds.map((x) => String(x).trim()).filter(Boolean)));
    const rows = await deliveryAssignmentModel.find({ batchId, _id: { $in: ids } });
    if (rows.length !== ids.length) {
      return sendError(res, req, 400, "Some assignments were not found in this batch");
    }
    const rowById = new Map(rows.map((r) => [String(r._id), r]));
    for (let i = 0; i < ids.length; i += 1) {
      const row = rowById.get(ids[i]);
      row.batchSequence = i + 1;
      await row.save();
    }
    sendSuccess(res, req, 200, {
      success: true,
      message: "Batch sequence updated",
      data: { batchId, assignmentCount: ids.length },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error resequencing batch");
  }
};

const ungroupBatchAssignments = async (req, res) => {
  try {
    const { batchId } = req.params;
    const result = await deliveryAssignmentModel.updateMany(
      { batchId: String(batchId || "").trim() },
      { $set: { batchId: "", batchSequence: null, batchGroupedAt: null } }
    );
    if (!result.matchedCount) {
      return sendError(res, req, 404, "Batch not found");
    }
    sendSuccess(res, req, 200, {
      success: true,
      message: "Batch ungrouped",
      data: { batchId, assignmentCount: result.modifiedCount || 0 },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error ungrouping batch");
  }
};

const getBatchDetails = async (req, res) => {
  try {
    const { batchId } = req.params;
    const key = String(batchId || "").trim();
    if (!key) {
      return sendError(res, req, 400, "batchId is required");
    }
    const rows = await deliveryAssignmentModel
      .find({ batchId: key })
      .sort({ batchSequence: 1, assignedAt: 1 })
      .populate("orderId")
      .populate("deliveryPersonId", "name phone vehicleType vehicleNumber");
    if (!rows.length) {
      return sendError(res, req, 404, "Batch not found");
    }
    const driver = rows[0]?.deliveryPersonId || null;
    const stops = rows.map((r) => ({
      assignmentId: r._id,
      batchSequence: r.batchSequence,
      status: r.status,
      assignedAt: r.assignedAt,
      acceptedAt: r.acceptedAt,
      pickedUpAt: r.pickedUpAt,
      deliveredAt: r.deliveredAt,
      estimatedDeliveryTime: r.estimatedDeliveryTime,
      order: r.orderId
        ? {
            orderId: r.orderId._id,
            orderNumber: r.orderId.orderNumber,
            finalAmount: r.orderId.finalAmount,
            status: r.orderId.status,
            customerAddress: r.orderId.address || null,
          }
        : null,
    }));
    sendSuccess(res, req, 200, {
      success: true,
      data: {
        batchId: key,
        stopCount: stops.length,
        deliveryPerson: driver,
        groupedAt: rows[0]?.batchGroupedAt || null,
        stops,
      },
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error loading batch details");
  }
};

const optimizeBatchRoute = async (req, res) => {
  try {
    const { batchId } = req.params;
    const key = String(batchId || "").trim();
    if (!key) {
      return sendError(res, req, 400, "batchId is required");
    }
    const rows = await deliveryAssignmentModel
      .find({ batchId: key })
      .populate("orderId", "address")
      .populate("deliveryPersonId", "currentLocation");
    if (rows.length < 2) {
      return sendError(res, req, 400, "Batch requires at least 2 assignments to optimize");
    }
    const unresolved = rows.filter((r) => !ACTIVE_BATCHABLE_STATUSES.has(String(r.status)));
    if (unresolved.length) {
      return sendError(res, req, 409, "Only active assignments can be optimized");
    }
    const d = rows[0]?.deliveryPersonId;
    let curLat = Number(d?.currentLocation?.lat);
    let curLng = Number(d?.currentLocation?.lng);
    const hasDriverPoint = Number.isFinite(curLat) && Number.isFinite(curLng);
    if (!hasDriverPoint) {
      const first = rows.find(
        (r) =>
          Number.isFinite(Number(r?.orderId?.address?.coordinates?.lat)) &&
          Number.isFinite(Number(r?.orderId?.address?.coordinates?.lng))
      );
      curLat = Number(first?.orderId?.address?.coordinates?.lat);
      curLng = Number(first?.orderId?.address?.coordinates?.lng);
    }
    const pending = [...rows];
    const ordered = [];
    while (pending.length) {
      let pickIdx = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pending.length; i += 1) {
        const lat = Number(pending[i]?.orderId?.address?.coordinates?.lat);
        const lng = Number(pending[i]?.orderId?.address?.coordinates?.lng);
        const dKm = haversineKm(curLat, curLng, lat, lng);
        const score = dKm == null ? Number.POSITIVE_INFINITY : dKm;
        if (score < best) {
          best = score;
          pickIdx = i;
        }
      }
      const next = pending.splice(pickIdx, 1)[0];
      ordered.push(next);
      const nLat = Number(next?.orderId?.address?.coordinates?.lat);
      const nLng = Number(next?.orderId?.address?.coordinates?.lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
        curLat = nLat;
        curLng = nLng;
      }
    }
    for (let i = 0; i < ordered.length; i += 1) {
      ordered[i].batchSequence = i + 1;
      await ordered[i].save();
    }
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Batch route optimized",
      data: {
        batchId: key,
        algorithm: "nearest_next_haversine",
        orderedAssignmentIds: ordered.map((r) => String(r._id)),
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error optimizing batch route");
  }
};

// Phase 9: object-storage ready upload URL for POD media
const createPodEvidenceUploadUrl = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId: authCtx.deliveryPersonId,
    }).select("_id");
    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found");
    }
    const extRaw = String(req.body.ext || req.query.ext || "jpg")
      .trim()
      .toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp"].includes(extRaw) ? extRaw : "jpg";
    const contentTypeRaw = String(req.body.contentType || req.query.contentType || "image/jpeg")
      .trim()
      .toLowerCase();
    const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const contentType = allowedContentTypes.has(contentTypeRaw)
      ? contentTypeRaw
      : "image/jpeg";
    const key = `pod_${String(assignmentId)}_${Date.now()}.${safeExt}`;
    const uploadUrl = await createSignedPutUrl({ key, contentType });
    if (!uploadUrl) {
      return sendError(
        res,
        req,
        400,
        "Signed upload URL unavailable (object storage provider not configured)"
      );
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        key,
        uploadUrl,
        publicUrl: getMediaPublicUrl(key),
        contentType,
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error creating POD upload URL");
  }
};

// Phase 9: finalize direct-uploaded POD evidence key
const finalizePodEvidenceUpload = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const key = normalizeUploadedMediaKey(req.body.key);
    if (!key) {
      return sendError(res, req, 400, "Valid key is required");
    }
    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId: authCtx.deliveryPersonId,
    });
    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found");
    }
    assignment.pendingPodEvidence = {
      key,
      uploadedAt: new Date(),
    };
    await assignment.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "POD evidence key finalized",
      data: {
        assignmentId: String(assignment._id),
        podEvidenceKey: key,
        podEvidenceUrl: getMediaPublicUrl(key),
      },
    });
  } catch (error) {
    console.log(error);
    return sendError(res, req, 500, "Error finalizing POD evidence key");
  }
};

// Delivery person: Accept delivery
const acceptDelivery = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId,
      status: 'assigned'
    });

    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found or already processed");
    }

    assignment.status = 'accepted';
    assignment.acceptedAt = new Date();
    await assignment.save();

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Delivery accepted successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error accepting delivery");
  }
};

// Delivery person: Mark as picked up
const markPickedUp = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId
    });

    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found");
    }

    assignment.status = 'picked_up';
    assignment.pickedUpAt = new Date();
    await assignment.save();

    await transitionOrderById(assignment.orderId, "out_for_delivery", {
      updatedBy: "delivery_person",
      actorUserId: deliveryPersonId,
      message: "Picked up",
    });

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Marked as picked up successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating status");
  }
};

// Delivery person: Mark as delivered
const markDelivered = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;
    const { otp } = req.body;
    const podInput = req.body?.pod && typeof req.body.pod === "object" ? req.body.pod : {};
    const requestedMethod = String(podInput.method || "otp").toLowerCase();
    const podMethod = ["otp", "photo", "signature"].includes(requestedMethod)
      ? requestedMethod
      : "otp";
    const podNote = String(podInput.note || "").slice(0, 1000);
    const podEvidenceUrl = String(podInput.evidenceUrl || "").slice(0, 2000);
    const podSignatureName = String(podInput.signatureName || "").slice(0, 120);

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId
    });

    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found");
    }
    const pendingPodEvidenceUrl = assignment?.pendingPodEvidence?.key
      ? getMediaPublicUrl(assignment.pendingPodEvidence.key)
      : "";
    const resolvedPodEvidenceUrl = podEvidenceUrl || pendingPodEvidenceUrl;

    if (podMethod === "otp" && assignment.otpHash) {
      if (!otp || String(otp).length < 4) {
        return sendError(res, req, 400, "Delivery OTP is required to complete delivery");
      }
      if (assignment.otpExpiresAt && new Date() > assignment.otpExpiresAt) {
        return sendError(res, req, 400, "Delivery OTP has expired; contact support");
      }
      const match = await bcrypt.compare(String(otp), assignment.otpHash);
      if (!match) {
        return sendError(res, req, 400, "Invalid delivery OTP");
      }
    }
    if (podMethod === "photo" && !resolvedPodEvidenceUrl) {
      return sendError(res, req, 400, "pod.evidenceUrl is required for photo proof");
    }
    if (podMethod === "signature" && !podSignatureName && !resolvedPodEvidenceUrl) {
      return sendError(
        res,
        req,
        400,
        "Provide pod.signatureName or pod.evidenceUrl for signature proof"
      );
    }

    const orderForPod = await orderModel.findById(assignment.orderId);
    if (orderForPod) {
      orderForPod.proofOfDelivery = {
        method: podMethod,
        verifiedAt: new Date(),
        note: podNote,
        evidenceUrl: resolvedPodEvidenceUrl,
        signatureName: podSignatureName,
      };
      await orderForPod.save();

      await recordOrderEvent({
        orderId: orderForPod._id,
        type: "order.pod_verified",
        payload: {
          method: podMethod,
          hasEvidenceUrl: !!resolvedPodEvidenceUrl,
          signatureName: podSignatureName || "",
        },
        actor: { kind: "delivery_person", id: String(deliveryPersonId) },
      });
    }

    const t = await transitionOrderById(assignment.orderId, "delivered", {
      updatedBy: "delivery_person",
      actorUserId: deliveryPersonId,
      message: "Delivered",
    });
    if (!t.ok) {
      if (t.code === "INVALID_TRANSITION") {
        return sendError(res, req, 400, `Cannot mark delivered from status ${t.from}`);
      }
      return sendError(res, req, 404, "Order not found");
    }

    assignment.status = 'delivered';
    assignment.deliveredAt = new Date();
    assignment.pendingPodEvidence = { key: "", uploadedAt: null };
    await assignment.save();

    // Mark delivery person as available
    const deliveryPerson = await deliveryPersonModel.findById(deliveryPersonId);
    if (deliveryPerson) {
      deliveryPerson.isAvailable = true;
      await deliveryPerson.save();
    }

    sendSuccess(res, req, 200, { 
      success: true, 
      message: "Marked as delivered successfully",
      data: assignment
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error updating status");
  }
};

const rejectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { reason } = req.body;
    const authCtx = await resolveDeliveryPersonAuthContext(req.body.userId);
    if (!authCtx) {
      return sendError(res, req, 403, "Delivery account not linked");
    }
    const deliveryPersonId = authCtx.deliveryPersonId;

    const assignment = await deliveryAssignmentModel.findOne({
      _id: assignmentId,
      deliveryPersonId,
    });

    if (!assignment) {
      return sendError(res, req, 404, "Assignment not found");
    }

    if (["delivered", "cancelled"].includes(assignment.status)) {
      return sendError(res, req, 400, "Cannot reject this assignment");
    }

    const order = await orderModel.findById(assignment.orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    const t = await transitionOrderById(order._id, "ready", {
      allowReturnToReady: true,
      updatedBy: "delivery_person",
      actorUserId: deliveryPersonId,
      message: (reason && String(reason).slice(0, 200)) || "Driver rejected assignment",
    });

    if (!t.ok) {
      return sendError(
        res,
        req,
        400,
        t.code === "INVALID_TRANSITION"
          ? `Cannot return order to ready from ${t.from}`
          : "Order update failed"
      );
    }

    assignment.status = "cancelled";
    assignment.rejectionReason = (reason && String(reason).slice(0, 500)) || "";
    await assignment.save();

    await orderModel.updateOne(
      { _id: order._id },
      {
        $set: {
          deliveryPersonId: null,
          estimatedDeliveryTime: null,
        },
        $unset: { deliveryEtaSnapshot: 1 },
      }
    );

    const deliveryPerson = await deliveryPersonModel.findById(deliveryPersonId);
    if (deliveryPerson) {
      deliveryPerson.isAvailable = true;
      await deliveryPerson.save();
    }

    await recordOrderEvent({
      orderId: order._id,
      type: "delivery.rejected",
      payload: { reason: assignment.rejectionReason },
      actor: { kind: "delivery_person", id: String(deliveryPersonId) },
    });

    sendSuccess(res, req, 200, {
      success: true,
      message: "Assignment rejected; order returned to ready for reassignment",
      data: assignment,
    });
  } catch (error) {
    console.log(error);
    sendError(res, req, 500, "Error rejecting assignment");
  }
};

export { 
  createDeliveryPerson, 
  assignDelivery, 
  groupAssignmentsIntoBatch,
  resequenceBatchAssignments,
  ungroupBatchAssignments,
  getBatchDetails,
  optimizeBatchRoute,
  createPodEvidenceUploadUrl,
  finalizePodEvidenceUpload,
  updateDeliveryLocation, 
  getMyDeliveries,
  acceptDelivery,
  markPickedUp,
  markDelivered,
  rejectAssignment,
};

