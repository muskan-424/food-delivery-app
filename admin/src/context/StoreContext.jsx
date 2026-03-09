import axios from "axios";
import { createContext, useEffect, useState, useRef } from "react";
import { getToken, isTokenValid, removeToken, saveToken } from "../utils/tokenUtils";
import { toast } from "react-toastify";

export const StoreContext = createContext(null);

const StoreContextProvider = (props) => {
  const [token, setToken] = useState("");
  const [admin, setAdmin] = useState(false);
  const setTokenRef = useRef(null);

  // Custom setToken that also saves to localStorage
  const setTokenWithStorage = (newToken) => {
    if (newToken) {
      // Validate token before saving
      if (isTokenValid(newToken)) {
        setToken(newToken);
        saveToken(newToken);
      } else {
        // Token is expired, remove it
        setToken("");
        setAdmin(false);
        removeToken();
        localStorage.removeItem("admin");
        toast.error("Your session has expired. Please login again.");
      }
    } else {
      // Clearing token
      setToken("");
      setAdmin(false);
      removeToken();
      localStorage.removeItem("admin");
    }
  };

  // Store setTokenWithStorage in ref for use in axios interceptor
  setTokenRef.current = setTokenWithStorage;

  // Setup axios interceptor to handle token expiration
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          if (setTokenRef.current) {
            setTokenRef.current("");
            setAdmin(false);
            localStorage.removeItem("admin");
            toast.error("Your session has expired. Please login again.");
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  // Load token from localStorage on mount and check expiration
  useEffect(() => {
    const storedToken = getToken();
    if (storedToken && isTokenValid(storedToken)) {
      setTokenWithStorage(storedToken);
      // Check admin status from localStorage
      const isAdmin = localStorage.getItem("admin") === "true";
      setAdmin(isAdmin);
    } else if (storedToken) {
      // Token exists but is expired
      removeToken();
      localStorage.removeItem("admin");
      setTokenWithStorage("");
      setAdmin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check token expiration periodically (every 5 minutes)
  useEffect(() => {
    if (!token) return;

    const checkTokenExpiration = () => {
      if (!isTokenValid(token)) {
        setTokenWithStorage("");
        setAdmin(false);
        localStorage.removeItem("admin");
      }
    };

    // Check immediately
    checkTokenExpiration();

    // Check every 5 minutes
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token]);

  const contextValue = {
    token,
    setToken: setTokenWithStorage,
    setTokenWithStorage, // Export for SessionTimeout component
    admin,
    setAdmin,
  };
  return (
    <StoreContext.Provider value={contextValue}>
      {props.children}
    </StoreContext.Provider>
  );
};
export default StoreContextProvider;
