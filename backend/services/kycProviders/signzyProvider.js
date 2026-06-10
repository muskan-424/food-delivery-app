import { appConfig } from "../../config/appConfig.js";
import { stubKycProvider } from "./stubProvider.js";

/**
 * Signzy provider placeholder — routes through stub until API integration is added.
 */
export const signzyKycProvider = {
  name: "signzy",
  assignReferenceAndStatus(profile) {
    profile.provider = this.name;
    profile.providerReferenceId = `signzy_${String(profile._id || profile.userId)}`
      .replace(/-/g, "")
      .slice(0, 40);
    if (appConfig.kycStubAutoVerify) {
      profile.status = "verified";
      profile.verifiedAt = new Date();
      profile.rejectedAt = null;
      profile.rejectionReason = "";
    } else {
      profile.status = "pending";
      profile.verifiedAt = null;
    }
  },
};
