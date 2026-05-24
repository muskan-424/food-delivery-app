import { useContext, useEffect, useState } from "react";
import { StoreContext } from "../context/StoreContext";

export default function useExperiment(experimentKey) {
  const { token, getExperimentAssignment } = useContext(StoreContext);
  const [variant, setVariant] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const key = String(experimentKey || "").trim().toLowerCase();
    if (!token || !key) {
      setVariant(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const assigned = await getExperimentAssignment(key);
      if (cancelled) return;
      setVariant(assigned || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [experimentKey, token, getExperimentAssignment]);

  return { variant, loading };
}
