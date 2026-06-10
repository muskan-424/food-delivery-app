import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { StoreContext } from "./StoreContext";

const defaultConfig = {
  beta_enabled: false,
  city_label: "",
  pin_codes: [],
  categories: [],
  feature_flags: {
    ai_assistant: true,
    order_chat: true,
    group_orders: true,
    voice_input: true,
    disputes: true,
    notifications: true,
  },
  feedback_path: "/feedback",
  feedback_categories: ["bug", "ux", "payment", "delivery", "other"],
};

const BetaContext = createContext({ config: defaultConfig, loading: true });

export const BetaProvider = ({ children }) => {
  const { url } = useContext(StoreContext);
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${url}/api/beta/config`);
        if (!cancelled && res.data?.success) {
          setConfig({ ...defaultConfig, ...res.data.data });
        }
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <BetaContext.Provider value={{ config, loading }}>
      {children}
    </BetaContext.Provider>
  );
};

export const useBeta = () => useContext(BetaContext);
