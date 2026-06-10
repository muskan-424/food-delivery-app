import { appConfig } from "../../config/appConfig.js";

export const stubKycProvider = {
  name: "stub",
  assignReferenceAndStatus(profile) {
    profile.provider = this.name;
    profile.providerReferenceId = `stub_${String(profile._id || profile.userId)}`.replace(/-/g, "").slice(0, 40);
    const now = new Date();
    if (appConfig.kycStubAutoVerify) {
      profile.status = "verified";
      profile.verifiedAt = now;
      profile.rejectedAt = null;
      profile.rejectionReason = "";
    } else {
      profile.status = "pending";
      profile.verifiedAt = null;
    }
  },
};
