import React, { useContext, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import "./PartnerKyc.css";

const PartnerKyc = () => {
  const {
    token,
    url,
    partnerAccessResolved,
    partnerRestaurantManageAccess,
    partnerRestaurantId,
  } = useContext(StoreContext);
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lastUploadMeta, setLastUploadMeta] = useState(null);

  const getExtAndContentType = (file) => {
    const mime = String(file?.type || "").toLowerCase();
    if (mime === "application/pdf") return { ext: "pdf", contentType: "application/pdf" };
    if (mime === "image/png") return { ext: "png", contentType: "image/png" };
    if (mime === "image/webp") return { ext: "webp", contentType: "image/webp" };
    return { ext: "jpg", contentType: "image/jpeg" };
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please choose a file first");
      return;
    }
    if (!partnerRestaurantId) {
      toast.error("Restaurant context is missing in your account");
      return;
    }

    try {
      setUploading(true);
      const { ext, contentType } = getExtAndContentType(selectedFile);

      const uploadUrlRes = await axios.post(
        `${url}/api/restaurant/${partnerRestaurantId}/kyc/upload-url`,
        { ext, contentType },
        { headers: { token } }
      );
      if (!uploadUrlRes.data?.success) {
        toast.error(uploadUrlRes.data?.message || "Could not create KYC upload URL");
        return;
      }

      const { uploadUrl, key, publicUrl } = uploadUrlRes.data.data || {};
      await axios.put(uploadUrl, selectedFile, {
        headers: {
          "Content-Type": contentType,
        },
      });

      const finalizeRes = await axios.post(
        `${url}/api/restaurant/${partnerRestaurantId}/kyc/finalize`,
        { key },
        { headers: { token } }
      );
      if (!finalizeRes.data?.success) {
        toast.error(finalizeRes.data?.message || "Could not finalize KYC document");
        return;
      }

      const payload = finalizeRes.data?.data || {};
      setLastUploadMeta({
        key,
        kycStatus: payload.kycStatus || "submitted",
        publicUrl: payload.kycDocumentPublicUrl || publicUrl || "",
      });
      setSelectedFile(null);
      toast.success("KYC document uploaded and finalized");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to upload KYC document");
    } finally {
      setUploading(false);
    }
  };

  if (!token) {
    return null;
  }
  if (!partnerAccessResolved) {
    return <div className="partner-kyc-page"><p>Loading...</p></div>;
  }
  if (!partnerRestaurantManageAccess) {
    return (
      <div className="partner-kyc-page">
        <h1>Partner KYC</h1>
        <p>You do not have access to upload KYC documents.</p>
        <button type="button" onClick={() => navigate("/")}>Back to home</button>
      </div>
    );
  }

  return (
    <div className="partner-kyc-page">
      <h1>Partner KYC Upload</h1>
      <p className="partner-kyc-note">
        Upload your latest KYC document. The system will finalize and attach it to your restaurant.
      </p>
      <div className="partner-kyc-card">
        <input
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          disabled={uploading}
        />
        <button type="button" onClick={handleUpload} disabled={uploading || !selectedFile}>
          {uploading ? "Uploading..." : "Upload KYC document"}
        </button>
      </div>

      {lastUploadMeta ? (
        <div className="partner-kyc-result">
          <p><strong>Status:</strong> {lastUploadMeta.kycStatus}</p>
          <p><strong>Key:</strong> {lastUploadMeta.key}</p>
          {lastUploadMeta.publicUrl ? (
            <p>
              <a href={lastUploadMeta.publicUrl} target="_blank" rel="noreferrer">
                View uploaded document
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default PartnerKyc;

