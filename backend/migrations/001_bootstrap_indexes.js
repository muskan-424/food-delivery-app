/**
 * Idempotent indexes for Wave 1 collections (escrow, KYC, audit, chat).
 */
export const id = "001_bootstrap_indexes";
export const description = "Ensure indexes on escrow, KYC, audit, and chat collections";

async function ensureIndexes(db, collection, specs) {
  const col = db.collection(collection);
  for (const spec of specs) {
    await col.createIndex(spec.keys, spec.options || {});
  }
}

export async function up(db) {
  await ensureIndexes(db, "orderescrows", [
    { keys: { orderId: 1 }, options: { unique: true, name: "orderId_1" } },
    { keys: { status: 1, updatedAt: -1 }, options: { name: "status_updatedAt" } },
  ]);
  await ensureIndexes(db, "escrowevents", [
    { keys: { orderId: 1, createdAt: -1 }, options: { name: "orderId_createdAt" } },
    { keys: { escrowId: 1, type: 1 }, options: { name: "escrowId_type" } },
  ]);
  await ensureIndexes(db, "auditlogs", [
    { keys: { action: 1, createdAt: -1 }, options: { name: "action_createdAt" } },
    { keys: { userId: 1, createdAt: -1 }, options: { name: "userId_createdAt" } },
  ]);
  await ensureIndexes(db, "userkycprofiles", [
    { keys: { userId: 1 }, options: { unique: true, name: "userId_1" } },
    { keys: { status: 1, submittedAt: -1 }, options: { name: "status_submittedAt" } },
  ]);
  await ensureIndexes(db, "otpchallenges", [
    { keys: { userId: 1, purpose: 1 }, options: { name: "userId_purpose" } },
    { keys: { expiresAt: 1 }, options: { name: "expiresAt_1" } },
  ]);
  await ensureIndexes(db, "agentchatsessions", [
    { keys: { userId: 1, updatedAt: -1 }, options: { name: "userId_updatedAt" } },
  ]);
  await ensureIndexes(db, "orderrequestdrafts", [
    { keys: { userId: 1, status: 1 }, options: { name: "userId_status" } },
    { keys: { restaurantId: 1, status: 1, publishedAt: -1 }, options: { name: "restaurant_status_published" } },
  ]);
}

export async function down(db) {
  const drops = [
    ["orderescrows", "status_updatedAt"],
    ["escrowevents", "orderId_createdAt"],
    ["escrowevents", "escrowId_type"],
    ["auditlogs", "action_createdAt"],
    ["auditlogs", "userId_createdAt"],
    ["userkycprofiles", "status_submittedAt"],
    ["otpchallenges", "userId_purpose"],
    ["agentchatsessions", "userId_updatedAt"],
    ["orderrequestdrafts", "userId_status"],
    ["orderrequestdrafts", "restaurant_status_published"],
  ];
  for (const [collection, indexName] of drops) {
    try {
      await db.collection(collection).dropIndex(indexName);
    } catch {
      /* index may not exist */
    }
  }
}
