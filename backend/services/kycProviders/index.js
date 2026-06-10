import { appConfig } from "../../config/appConfig.js";
import { stubKycProvider } from "./stubProvider.js";
import { signzyKycProvider } from "./signzyProvider.js";

export function getKycProvider() {
  const key = String(appConfig.kycProvider || "stub").trim().toLowerCase();
  if (key === "signzy") return signzyKycProvider;
  return stubKycProvider;
}
