import axios from "axios";
import { createContext, useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import { getToken, isTokenValid, removeToken, saveToken } from "../utils/tokenUtils";
import { grossFromExclusive } from "../utils/menuTaxDisplay";

export const StoreContext = createContext(null);

const EMPTY_OBJ = {};

function normalizeModifiers(modifiers) {
  if (!Array.isArray(modifiers)) return [];
  return modifiers
    .map((row) => {
      const groupKey = row?.groupKey ? String(row.groupKey) : "";
      const optionKeys = Array.isArray(row?.optionKeys)
        ? [...new Set(row.optionKeys.map((x) => String(x)).filter(Boolean))]
        : row?.optionKey
          ? [String(row.optionKey)]
          : [];
      if (!groupKey || optionKeys.length === 0) return null;
      return { groupKey, optionKeys };
    })
    .filter(Boolean)
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

function buildCartLineKey(itemId, modifiers = []) {
  const norm = normalizeModifiers(modifiers);
  return `${String(itemId)}::${JSON.stringify(norm)}`;
}

function parseCartLineKey(lineKey) {
  const [itemId, raw] = String(lineKey).split("::");
  try {
    const modifiers = raw ? JSON.parse(raw) : [];
    return { itemId, modifiers: Array.isArray(modifiers) ? modifiers : [] };
  } catch {
    return { itemId, modifiers: [] };
  }
}

const StoreContextProvider = (props) => {
  const [cartItems, setCartItems] = useState({});
  const [cartLines, setCartLines] = useState({});
  const [wishlistItems, setWishlistItems] = useState([]);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const url = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const [token, setToken] = useState(() => {
    const storedToken = getToken();
    return storedToken && isTokenValid(storedToken) ? storedToken : "";
  });
  const [partnerPayoutAccess, setPartnerPayoutAccess] = useState(false);
  const [partnerRestaurantManageAccess, setPartnerRestaurantManageAccess] = useState(false);
  const [partnerRestaurantId, setPartnerRestaurantId] = useState("");
  const [partnerAccessResolved, setPartnerAccessResolved] = useState(false);
  const [experimentAssignments, setExperimentAssignments] = useState({});
  const [food_list, setFoodList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    category: "All",
    minPrice: "",
    maxPrice: "",
    sortBy: "price",
    sortOrder: "asc"
  });
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
        removeToken();
        toast.error("Your session has expired. Please login again.");
      }
    } else {
      // Clearing token
      setToken("");
      removeToken();
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

  const addToCart = async (itemId, modifiers = []) => {
    const lineKey = buildCartLineKey(itemId, modifiers);
    setCartLines((prev) => ({ ...prev, [lineKey]: (prev[lineKey] || 0) + 1 }));
    setCartItems((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
    if (token && normalizeModifiers(modifiers).length === 0) {
      const response=await axios.post(
        url + "/api/cart/add",
        { itemId },
        { headers: { token } }
      );
      if(response.data.success){
        toast.success("item Added to Cart")
      }else{
        toast.error("Something went wrong")
      }
    }
  };

  const removeFromCart = async (itemId, modifiers = null) => {
    let lineKey = "";
    if (modifiers) {
      lineKey = buildCartLineKey(itemId, modifiers);
    } else {
      lineKey = Object.keys(cartLines).find((k) => parseCartLineKey(k).itemId === String(itemId)) || "";
    }
    if (!lineKey) return;

    setCartLines((prev) => {
      const qty = prev[lineKey] || 0;
      if (qty <= 1) {
        const next = { ...prev };
        delete next[lineKey];
        return next;
      }
      return { ...prev, [lineKey]: qty - 1 };
    });
    setCartItems((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 0) - 1) }));

    const parsed = parseCartLineKey(lineKey);
    if (token && parsed.modifiers.length === 0) {
      const response= await axios.post(
        url + "/api/cart/remove",
        { itemId },
        { headers: { token } }
      );
      if(response.data.success){
        toast.success("item Removed from Cart")
      }else{
        toast.error("Something went wrong")
      }
    }
  };

  const getTotalCartAmount = () => {
    let totalAmount = 0;
    for (const lineKey in cartLines) {
      const qty = cartLines[lineKey];
      if (qty > 0) {
        const { itemId, modifiers } = parseCartLineKey(lineKey);
        const itemInfo = food_list.find((product) => product._id === itemId);
        if (!itemInfo) continue;
        let unitExclusive = Number(itemInfo.price) || 0;
        if (Array.isArray(itemInfo.modifierGroups) && modifiers.length > 0) {
          for (const g of modifiers) {
            const group = itemInfo.modifierGroups.find((mg) => mg.key === g.groupKey);
            if (!group) continue;
            for (const ok of g.optionKeys || []) {
              const opt = (group.options || []).find((o) => o.key === ok);
              if (opt) unitExclusive += Number(opt.priceDelta) || 0;
            }
          }
        }
        const unitCharge = grossFromExclusive(unitExclusive, itemInfo.restaurantMenuTax);
        totalAmount += unitCharge * qty;
      }
    }
    return totalAmount;
  };

  const fetchFoodList = async (searchParams = {}) => {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (searchParams.search || searchQuery) {
        params.append('search', searchParams.search || searchQuery);
      }
      
      if (searchParams.category || filters.category) {
        const category = searchParams.category || filters.category;
        if (category !== 'All') {
          params.append('category', category);
        }
      }
      
      if (searchParams.minPrice || filters.minPrice) {
        params.append('minPrice', searchParams.minPrice || filters.minPrice);
      }
      
      if (searchParams.maxPrice || filters.maxPrice) {
        params.append('maxPrice', searchParams.maxPrice || filters.maxPrice);
      }
      
      if (searchParams.sortBy || filters.sortBy) {
        params.append('sortBy', searchParams.sortBy || filters.sortBy);
      }
      
      if (searchParams.sortOrder || filters.sortOrder) {
        params.append('sortOrder', searchParams.sortOrder || filters.sortOrder);
      }

      const queryString = params.toString();
      const apiUrl = queryString 
        ? `${url}/api/food/list?${queryString}`
        : `${url}/api/food/list`;

      const response = await axios.get(apiUrl);
      if (response.data.success) {
        setFoodList(response.data.data);
      } else {
        console.error("Error fetching food list:", response.data.message);
        toast.error("Error loading products. Please try again.");
      }
    } catch (error) {
      console.error("Error fetching food list:", error);
      toast.error("Error loading products. Please check your connection.");
    }
  };

  const loadCardData = async (token) => {
    try {
      const response = await axios.post(
        url + "/api/cart/get",
        {},
        { headers: { token } }
      );
      if (response.data.success) {
        const backendCart = response.data.cartData || EMPTY_OBJ;
        setCartItems(backendCart);
        const lines = {};
        for (const itemId of Object.keys(backendCart)) {
          const qty = Number(backendCart[itemId]) || 0;
          if (qty > 0) lines[buildCartLineKey(itemId, [])] = qty;
        }
        setCartLines(lines);
      } else {
        console.error("Error loading cart:", response.data.message);
        toast.error("Error loading cart data");
      }
    } catch (error) {
      console.error("Error loading cart:", error);
      toast.error("Error loading cart. Please try again.");
    }
  };

  // Clear cart (both local state and backend)
  const clearCart = async () => {
    // Clear local state immediately for instant UI update
    setCartItems({});
    setCartLines({});
    
    // Reload cart data from backend to ensure sync
    // The backend already clears cart on order placement, so this will sync the empty cart
    if (token) {
      try {
        await loadCardData(token);
      } catch (error) {
        console.error("Error syncing cart:", error);
        // Even if backend call fails, local state is already cleared
        // This ensures the UI updates immediately
      }
    }
  };

  // Wishlist functions
  const fetchWishlist = async () => {
    if (!token) {
      setWishlistItems([]);
      setWishlistIds(new Set());
      return;
    }
    try {
      const response = await axios.get(url + "/api/wishlist", {
        headers: { token }
      });
      if (response.data.success) {
        const items = response.data.data || [];
        setWishlistItems(items);
        setWishlistIds(new Set(items.map(item => item._id || item)));
      }
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      setWishlistItems([]);
      setWishlistIds(new Set());
    }
  };

  const addToWishlist = async (foodId) => {
    if (!token) {
      toast.error("Please login to add items to wishlist");
      return;
    }
    try {
      const response = await axios.post(
        url + "/api/wishlist",
        { foodId },
        { headers: { token } }
      );
      if (response.data.success) {
        setWishlistIds(prev => new Set([...prev, foodId]));
        toast.success("Added to wishlist");
        await fetchWishlist(); // Refresh wishlist
      } else {
        toast.error(response.data.message || "Failed to add to wishlist");
      }
    } catch (error) {
      if (error.response?.status === 409) {
        toast.info("Item already in wishlist");
      } else {
        toast.error("Failed to add to wishlist");
      }
    }
  };

  const removeFromWishlist = async (foodId) => {
    if (!token) return;
    try {
      const response = await axios.delete(
        url + `/api/wishlist/${foodId}`,
        { headers: { token } }
      );
      if (response.data.success) {
        setWishlistIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(foodId);
          return newSet;
        });
        toast.success("Removed from wishlist");
        await fetchWishlist(); // Refresh wishlist
      } else {
        toast.error(response.data.message || "Failed to remove from wishlist");
      }
    } catch (error) {
      toast.error("Failed to remove from wishlist");
    }
  };

  const toggleWishlist = async (foodId) => {
    if (wishlistIds.has(foodId)) {
      await removeFromWishlist(foodId);
    } else {
      await addToWishlist(foodId);
    }
  };

  const isInWishlist = (foodId) => {
    return wishlistIds.has(foodId);
  };

  const getExperimentAssignment = async (experimentKey) => {
    const key = String(experimentKey || "").trim().toLowerCase();
    if (!key || !token) return null;
    if (Object.prototype.hasOwnProperty.call(experimentAssignments, key)) {
      return experimentAssignments[key];
    }
    try {
      const response = await axios.get(`${url}/api/user/experiments/${encodeURIComponent(key)}/assignment`, {
        headers: { token },
      });
      if (response.data?.success) {
        const variant = response.data?.data?.variant || null;
        setExperimentAssignments((prev) => ({ ...prev, [key]: variant }));
        return variant;
      }
    } catch {
      // keep silent; experiments should not block core UX
    }
    setExperimentAssignments((prev) => ({ ...prev, [key]: null }));
    return null;
  };

  // Fetch food list when search or filters change
  useEffect(() => {
    // Only fetch if component has mounted (skip initial mount)
    const hasMounted = food_list.length > 0 || searchQuery || filters.category !== "All" || filters.minPrice || filters.maxPrice || filters.sortBy !== "price" || filters.sortOrder !== "asc";
    if (hasMounted) {
      fetchFoodList();
    }
  }, [searchQuery, filters]);

  // Load token from localStorage on mount and check expiration
  useEffect(() => {
    const storedToken = getToken();
    if (storedToken && isTokenValid(storedToken)) {
      setTokenWithStorage(storedToken);
    } else if (storedToken) {
      // Token exists but is expired
      removeToken();
      setTokenWithStorage("");
    }
  }, []);

  // Check token expiration periodically (every 5 minutes)
  useEffect(() => {
    if (!token) return;

    const checkTokenExpiration = () => {
      if (!isTokenValid(token)) {
        setTokenWithStorage("");
        toast.error("Your session has expired. Please login again.");
      }
    };

    // Check immediately
    checkTokenExpiration();

    // Check every 5 minutes
    const interval = setInterval(checkTokenExpiration, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    async function loadData() {
      await fetchFoodList();
    }
    loadData();
  }, []);

  // Load cart data and wishlist when user logs in (token changes)
  useEffect(() => {
    if (token) {
      loadCardData(token);
      fetchWishlist();
    } else {
      // Clear cart and wishlist when user logs out
      setCartItems({});
      setCartLines({});
      setWishlistItems([]);
      setWishlistIds(new Set());
      setExperimentAssignments({});
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setPartnerPayoutAccess(false);
      setPartnerRestaurantManageAccess(false);
      setPartnerRestaurantId("");
      setPartnerAccessResolved(true);
      return;
    }
    setPartnerAccessResolved(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${url}/api/profile`, { headers: { token } });
        if (cancelled) return;
        if (res.data.success) {
          const u = res.data.data;
          const staff = u?.restaurantStaff;
          const perms = Array.isArray(staff?.permissions) ? staff.permissions : [];
          const active = staff?.active !== false;
          setPartnerPayoutAccess(active && perms.includes("finance.read"));
          setPartnerRestaurantManageAccess(active && perms.includes("restaurant.manage"));
          setPartnerRestaurantId(String(staff?.restaurantId || ""));
        } else {
          setPartnerPayoutAccess(false);
          setPartnerRestaurantManageAccess(false);
          setPartnerRestaurantId("");
        }
      } catch {
        if (!cancelled) {
          setPartnerPayoutAccess(false);
          setPartnerRestaurantManageAccess(false);
          setPartnerRestaurantId("");
        }
      } finally {
        if (!cancelled) setPartnerAccessResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, url]);

  const contextValue = {
    food_list,
    cartItems,
    cartLines,
    setCartItems,
    addToCart,
    removeFromCart,
    getTotalCartAmount,
    clearCart,
    loadCardData,
    url,
    token,
    setToken: setTokenWithStorage,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    fetchFoodList,
    wishlistItems,
    wishlistIds,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    isInWishlist,
    fetchWishlist,
    partnerPayoutAccess,
    partnerRestaurantManageAccess,
    partnerRestaurantId,
    partnerAccessResolved,
    getExperimentAssignment,
    experimentAssignments,
  };
  return (
    <StoreContext.Provider value={contextValue}>
      {props.children}
    </StoreContext.Provider>
  );
};
export default StoreContextProvider;
