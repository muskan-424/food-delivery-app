import React from "react";
import { Link } from "react-router-dom";
import { useBeta } from "../../context/BetaContext";
import "./BetaBanner.css";

const BetaBanner = () => {
  const { config, loading } = useBeta();
  if (loading || !config.beta_enabled) return null;

  const cats = (config.categories || []).join(", ");
  const pins = (config.pin_codes || []).length
    ? `PIN: ${config.pin_codes.join(", ")}`
    : "";

  return (
    <div className="beta-banner">
      <div className="beta-banner-inner">
        <strong>Closed beta</strong>
        <span>
          {config.city_label}
          {cats ? ` · ${cats}` : ""}
          {pins ? ` · ${pins}` : ""}
        </span>
        <Link to={config.feedback_path || "/feedback"} className="beta-feedback-link">
          Send feedback
        </Link>
      </div>
    </div>
  );
};

export default BetaBanner;
