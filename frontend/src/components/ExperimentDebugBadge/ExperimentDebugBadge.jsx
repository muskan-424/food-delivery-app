import React, { useContext, useMemo } from "react";
import { StoreContext } from "../../context/StoreContext";
import "./ExperimentDebugBadge.css";

const ExperimentDebugBadge = () => {
  const { experimentAssignments } = useContext(StoreContext);
  const entries = useMemo(
    () => Object.entries(experimentAssignments || {}).filter(([key]) => String(key || "").trim()),
    [experimentAssignments]
  );

  if (!import.meta.env.DEV || entries.length === 0) return null;

  return (
    <div className="exp-debug-badge">
      <p className="exp-debug-title">Experiment Variants</p>
      <ul>
        {entries.map(([key, variant]) => (
          <li key={key}>
            <span className="exp-key">{key}</span>
            <span className="exp-variant">{variant || "null"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ExperimentDebugBadge;
