/**
 * Safe defaults for Wave 1–8 fields on existing documents (no destructive updates).
 */
export const id = "002_wave1_field_backfills";
export const description = "Backfill chargebackFlag and notification preference defaults";

export async function up(db) {
  await db.collection("users").updateMany(
    { chargebackFlag: { $exists: false } },
    { $set: { chargebackFlag: false } }
  );

  await db.collection("orderescrows").updateMany(
    { payoutFraudOverride: { $exists: false } },
    {
      $set: {
        payoutFraudOverride: {
          allowed: false,
          reasonCode: "",
          note: "",
          adminUserId: "",
          at: null,
        },
      },
    }
  );

  await db.collection("orders").updateMany(
    { "proofOfDelivery.beforeImageUrl": { $exists: false } },
    {
      $set: {
        "proofOfDelivery.beforeImageUrl": "",
        "proofOfDelivery.afterImageUrl": "",
        "proofOfDelivery.uploadedAt": null,
        "proofOfDelivery.evidenceJson": null,
      },
    }
  );
}

export async function down(db) {
  await db.collection("users").updateMany({}, { $unset: { chargebackFlag: "" } });
  await db.collection("orderescrows").updateMany({}, { $unset: { payoutFraudOverride: "" } });
}
