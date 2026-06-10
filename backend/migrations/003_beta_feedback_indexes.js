import betaFeedbackModel from "../models/betaFeedbackModel.js";

export const id = "003_beta_feedback_indexes";
export const description = "Beta feedback collection indexes";

export async function up() {
  await betaFeedbackModel.syncIndexes();
}

export async function down() {
  /* indexes are safe to keep */
}
