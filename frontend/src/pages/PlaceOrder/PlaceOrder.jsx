import React, { useContext, useEffect, useMemo, useState } from "react";
import "./PlaceOrder.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import { useLocation, useNavigate } from 'react-router-dom';
import AddressManager from "../../components/AddressManager/AddressManager";
import { formatCurrency } from "../../utils/currency";
import { grossFromExclusive } from "../../utils/menuTaxDisplay";
import useExperiment from "../../hooks/useExperiment";

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector("script[data-razorpay-checkout]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.setAttribute("data-razorpay-checkout", "1");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Razorpay script failed to load"));
    document.body.appendChild(s);
  });
}

function formatRetrySeconds(data) {
  const sec = Number(data?.retryAfterSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.max(1, Math.ceil(sec));
}

function buildRazorpayRetryMessage(data) {
  const retryIn = formatRetrySeconds(data);
  const attempts = Number(data?.attemptsInWindow);
  const maxAttempts = Number(data?.maxAttemptsPerHour);
  const attemptsKnown =
    Number.isFinite(attempts) &&
    attempts >= 0 &&
    Number.isFinite(maxAttempts) &&
    maxAttempts > 0;
  if (retryIn && attemptsKnown) {
    const left = Math.max(0, Math.floor(maxAttempts - attempts));
    return `Please wait ${retryIn}s before retrying payment. Attempts left this hour: ${left}/${Math.floor(
      maxAttempts
    )}.`;
  }
  if (retryIn) {
    return `Please wait ${retryIn}s before retrying payment.`;
  }
  if (attemptsKnown) {
    const left = Math.max(0, Math.floor(maxAttempts - attempts));
    return `Too many payment retries. Attempts left this hour: ${left}/${Math.floor(
      maxAttempts
    )}.`;
  }
  return null;
}

function extractRetryAttemptsMeta(data) {
  const attempts = Number(data?.attemptsInWindow);
  const maxAttempts = Number(data?.maxAttemptsPerHour);
  if (!Number.isFinite(attempts) || !Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    return null;
  }
  return {
    attemptsLeft: Math.max(0, Math.floor(maxAttempts - attempts)),
    maxAttempts: Math.floor(maxAttempts),
  };
}

const SLOT_WINDOW_DAYS = 7;
const SLOT_START_HOUR = 9;
const SLOT_END_HOUR = 22;
const SLOT_INTERVAL_MINUTES = 30;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDateLabel(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00`);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildSlotId(date, startTime, endTime) {
  return `${date}|${startTime}-${endTime}`;
}

function parseSlotId(slotId) {
  const match =
    /^(\d{4}-\d{2}-\d{2})\|(([01]\d|2[0-3]):([0-5]\d))-(([01]\d|2[0-3]):([0-5]\d))$/.exec(
      String(slotId || "")
    );
  if (!match) return null;
  return {
    date: match[1],
    startTime: match[2],
    endTime: match[5],
  };
}

function buildUpcomingDates(windowDays = SLOT_WINDOW_DAYS) {
  const today = new Date();
  const dates = [];
  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    );
  }
  return dates;
}

function buildSlotsForDate(dateStr) {
  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
  const slots = [];
  for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h += 1) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL_MINUTES) {
      const startTime = `${pad2(h)}:${pad2(m)}`;
      const endMinutes = m + SLOT_INTERVAL_MINUTES;
      const endHour = h + Math.floor(endMinutes / 60);
      const endMin = endMinutes % 60;
      if (endHour > SLOT_END_HOUR || (endHour === SLOT_END_HOUR && endMin > 0)) {
        continue;
      }
      const endTime = `${pad2(endHour)}:${pad2(endMin)}`;
      if (isToday) {
        const slotStart = new Date(`${dateStr}T${startTime}:00`);
        if (slotStart <= cutoff) continue;
      }
      const id = buildSlotId(dateStr, startTime, endTime);
      slots.push({
        id,
        date: dateStr,
        startTime,
        endTime,
        label: `${startTime} - ${endTime}`,
      });
    }
  }
  return slots;
}

const PlaceOrder = () => {
  const navigate= useNavigate();
  const location = useLocation();

  const { getTotalCartAmount, token, food_list, cartLines, url, clearCart } =
    useContext(StoreContext);
  const [data, setData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zipcode: "",
    country: "",
    phone: "",
  });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [, setUseSavedAddress] = useState(false);
  const [showAddressManager, setShowAddressManager] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [razorpayRetryMeta, setRazorpayRetryMeta] = useState(null);
  const [checkoutHints, setCheckoutHints] = useState(null);
  const [tipAmountInput, setTipAmountInput] = useState("");
  const [paymentDetails, setPaymentDetails] = useState({
    upiId: "",
    bankName: "",
    cardLast4: "",
    cardType: "",
    walletName: "",
  });
  const [availableOffers, setAvailableOffers] = useState([]);
  const [appliedOffers, setAppliedOffers] = useState([]);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(2);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [deliveryMode, setDeliveryMode] = useState("asap");
  const [scheduledDate, setScheduledDate] = useState("");
  const [selectedScheduledSlotId, setSelectedScheduledSlotId] = useState("");
  const { variant: checkoutCtaVariant } = useExperiment("checkout_cta_v1");
  const groupSessionId = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const raw = String(params.get("groupSessionId") || "").trim();
    return raw || "";
  }, [location.search]);
  const FREE_DELIVERY_THRESHOLD = 150;
  const scheduleDateOptions = useMemo(() => buildUpcomingDates(), []);
  const selectedScheduleSlot = useMemo(
    () => parseSlotId(selectedScheduledSlotId),
    [selectedScheduledSlotId]
  );
  const availableScheduleSlots = useMemo(() => {
    if (!scheduledDate) return [];
    return buildSlotsForDate(scheduledDate);
  }, [scheduledDate]);

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;
    setData((data) => ({ ...data, [name]: value }));
  };

  // Load saved addresses
  const loadSavedAddresses = async () => {
    if (!token) return;
    try {
      const response = await axios.get(url + "/api/address", {
        headers: { token }
      });
      if (response.data.success) {
        setSavedAddresses(response.data.data || []);
        // Auto-select default address if available
        const defaultAddress = response.data.data?.find(addr => addr.isDefault);
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.addressId);
          setUseSavedAddress(true);
          fillAddressFromSaved(defaultAddress);
        }
      }
    } catch (error) {
      console.error("Error loading addresses:", error);
    }
  };

  // Fill form with saved address
  const fillAddressFromSaved = (address) => {
    const nameParts = address.name.split(' ');
    setData({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: address.email || '',
      street: address.addressLine1 || '',
      city: address.city || '',
      state: address.state || '',
      zipcode: address.pincode || '',
      country: address.country || '',
      phone: address.phone || '',
    });
  };

  // Handle address selection
  const handleAddressSelect = (addressId) => {
    if (!addressId) {
      setSelectedAddressId(null);
      setUseSavedAddress(false);
      setData({
        firstName: "",
        lastName: "",
        email: "",
        street: "",
        city: "",
        state: "",
        zipcode: "",
        country: "",
        phone: "",
      });
      return;
    }
    
    setSelectedAddressId(addressId);
    const address = savedAddresses.find(addr => addr.addressId === addressId);
    if (address) {
      fillAddressFromSaved(address);
      setUseSavedAddress(true);
    }
  };

  // Handle address deletion
  const handleDeleteAddress = async (addressId, e) => {
    e.stopPropagation(); // Prevent radio button selection when clicking delete
    
    const addressToDelete = savedAddresses.find(addr => addr.addressId === addressId);
    if (!addressToDelete) return;

    // Check if this is the only address
    if (savedAddresses.length === 1) {
      toast.error("Cannot delete the only saved address. Please add another address first.");
      return;
    }

    // Confirmation message
    const confirmMessage = addressToDelete.isDefault 
      ? "This is your default address. Deleting it will remove it from your saved addresses. Are you sure you want to delete this address?"
      : "Are you sure you want to delete this address? This action cannot be undone.";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await axios.delete(
        url + `/api/address/${addressId}`,
        { headers: { token } }
      );
      toast.success("Address deleted successfully");
      
      // Reload addresses
      await loadSavedAddresses();
      
      // If deleted address was selected, clear selection
      if (selectedAddressId === addressId) {
        handleAddressSelect(null);
      }
    } catch (error) {
      console.error("Error deleting address:", error);
      toast.error(error.response?.data?.message || "Error deleting address");
    }
  };

  // Handle address manager close and refresh
  const handleAddressManagerClose = async () => {
    setShowAddressManager(false);
    await loadSavedAddresses();
  };

  // Validate and apply coupon
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const response = await axios.post(
        url + "/api/coupon/validate",
        {
          code: couponCode.trim(),
          orderAmount: getTotalCartAmount()
        },
        { headers: { token } }
      );

      if (response.data.success) {
        setCouponDiscount(response.data.data.discount);
        setCouponApplied(true);
        toast.success(`Coupon applied! Discount: ${formatCurrency(response.data.data.discount)}`);
      } else {
        toast.error(response.data.message || "Invalid coupon code");
        setCouponDiscount(0);
        setCouponApplied(false);
      }
    } catch (error) {
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Error validating coupon code");
      }
      setCouponDiscount(0);
      setCouponApplied(false);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  // Remove coupon
  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponDiscount(0);
    setCouponApplied(false);
    toast.info("Coupon removed");
  };

  useEffect(() => {
    if (!scheduledDate && scheduleDateOptions.length > 0) {
      setScheduledDate(scheduleDateOptions[0]);
    }
  }, [scheduledDate, scheduleDateOptions]);

  useEffect(() => {
    if (deliveryMode !== "scheduled") return;
    if (!scheduledDate) return;
    const slots = buildSlotsForDate(scheduledDate);
    const selectedStillValid = slots.some((slot) => slot.id === selectedScheduledSlotId);
    if (!selectedStillValid) {
      setSelectedScheduledSlotId(slots[0]?.id || "");
    }
  }, [deliveryMode, scheduledDate, selectedScheduledSlotId]);

  useEffect(() => {
    if (paymentMethod !== "razorpay") {
      setRazorpayRetryMeta(null);
    }
  }, [paymentMethod]);

  const placeOrder = async (event) => {
    event.preventDefault();
    
    // Validate that either a saved address is selected or form is filled
    if (!selectedAddressId && (!data.firstName || !data.street || !data.city || !data.state || !data.zipcode || !data.phone)) {
      toast.error("Please select a saved address or fill in all required fields");
      return;
    }
    
    // Validate UPI ID if UPI payment method is selected
    if (paymentMethod === 'upi') {
      if (!paymentDetails.upiId || !paymentDetails.upiId.trim()) {
        toast.error("Please enter your UPI ID to proceed with UPI payment");
        return;
      }
      // Validate UPI ID format (should contain @ symbol)
      const upiIdPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
      if (!upiIdPattern.test(paymentDetails.upiId.trim())) {
        toast.error("Please enter a valid UPI ID (e.g., yourname@paytm, yourname@ybl, yourname@okaxis)");
        return;
      }
    }
    
    // Validate bank name if net banking is selected
    if (paymentMethod === 'netbanking') {
      if (!paymentDetails.bankName || !paymentDetails.bankName.trim()) {
        toast.error("Please enter bank name to proceed with net banking payment");
        return;
      }
    }
    
    // Validate wallet name if wallet is selected
    if (paymentMethod === 'wallet') {
      if (!paymentDetails.walletName || !paymentDetails.walletName.trim()) {
        toast.error("Please select a wallet to proceed with wallet payment");
        return;
      }
    }
    
    // Validate card details if card payment is selected
    if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') {
      if (!paymentDetails.cardLast4 || paymentDetails.cardLast4.length !== 4) {
        toast.error("Please enter last 4 digits of your card");
        return;
      }
      if (!paymentDetails.cardType) {
        toast.error("Please select card type");
        return;
      }
    }
    
    let orderItems = [];
    Object.entries(cartLines).forEach(([lineKey, qty]) => {
      const [itemId, encodedModifiers] = lineKey.split("::");
      const item = food_list.find((x) => x._id === itemId);
      if (item && qty > 0) {
        let modifiers = [];
        try {
          modifiers = encodedModifiers ? JSON.parse(encodedModifiers) : [];
        } catch {
          modifiers = [];
        }
        let unitExclusive = Number(item.price) || 0;
        for (const mod of modifiers) {
          const group = (item.modifierGroups || []).find((g) => g.key === mod.groupKey);
          for (const optionKey of mod.optionKeys || []) {
            const opt = (group?.options || []).find((o) => o.key === optionKey);
            if (opt) unitExclusive += Number(opt.priceDelta) || 0;
          }
        }
        const unitPrice = grossFromExclusive(unitExclusive, item.restaurantMenuTax);
        let itemInfo = {
          id: item._id,
          foodId: item._id,
          name: item.name,
          price: unitPrice,
          quantity: qty,
          image: item.image,
          modifiers,
        };
        orderItems.push(itemInfo);
      }
    });
    
    // Prepare address data - use saved address if selected, otherwise use form data
    let addressData = data;
    if (selectedAddressId) {
      const selectedAddr = savedAddresses.find(addr => addr.addressId === selectedAddressId);
      if (selectedAddr) {
        // Use saved address data
        const nameParts = selectedAddr.name.split(' ');
        addressData = {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: selectedAddr.email || '',
          street: selectedAddr.addressLine1 || '',
          city: selectedAddr.city || '',
          state: selectedAddr.state || '',
          zipcode: selectedAddr.pincode || '',
          country: selectedAddr.country || '',
          phone: selectedAddr.phone || '',
        };
      }
    }
    
    // Detect UPI provider from UPI ID
    let detectedUPIProvider = 'UPI';
    if (paymentMethod === 'upi' && paymentDetails.upiId) {
      const upiId = paymentDetails.upiId.toLowerCase();
      if (upiId.includes('@paytm')) {
        detectedUPIProvider = 'Paytm';
      } else if (upiId.includes('@ybl') || upiId.includes('@phonepe')) {
        detectedUPIProvider = 'PhonePe';
      } else if (upiId.includes('@okaxis') || upiId.includes('@okhdfcbank')) {
        detectedUPIProvider = 'GPay';
      } else if (upiId.includes('@okicici')) {
        detectedUPIProvider = 'GPay';
      } else if (upiId.includes('@amazonpay')) {
        detectedUPIProvider = 'Amazon Pay';
      }
    }
    
    const tipParsed = parseFloat(String(tipAmountInput || "").trim());
    const tipForOrder =
      Number.isFinite(tipParsed) && tipParsed > 0 ? Math.round(tipParsed * 100) / 100 : 0;
    if (tipForOrder > tipAllowedMax + 1e-6) {
      toast.error(`Tip cannot exceed ${formatCurrency(tipAllowedMax)} for this order`);
      return;
    }

    let orderData = {
      address: addressData,
      items: orderItems,
      amount: getTotalCartAmount(),
      tipAmount: tipForOrder,
      couponCode: couponApplied ? couponCode.trim() : '',
      paymentMethod: paymentMethod,
      paymentProvider:
        paymentMethod === "upi"
          ? detectedUPIProvider
          : paymentMethod === "wallet"
            ? paymentDetails.walletName
            : paymentMethod === "netbanking"
              ? paymentDetails.bankName
              : paymentMethod === "razorpay"
                ? "razorpay"
                : "",
      paymentDetails: paymentDetails,
      ...(groupSessionId ? { groupSessionId } : {}),
    };
    if (deliveryMode === "scheduled") {
      if (!selectedScheduledSlotId) {
        toast.error("Please choose a delivery slot");
        return;
      }
      orderData.scheduledSlotId = selectedScheduledSlotId;
    }

    const afterOrderPlaced = async () => {
      await clearCart();
      if (!selectedAddressId && addressData.firstName && addressData.street && addressData.city) {
        try {
          await axios.post(
            url + "/api/address",
            {
              type: "home",
              name: `${addressData.firstName} ${addressData.lastName}`.trim(),
              email: (addressData.email && addressData.email.trim()) || "",
              phone: addressData.phone,
              addressLine1: addressData.street,
              city: addressData.city,
              state: addressData.state,
              pincode: addressData.zipcode,
              country: addressData.country || "",
              isDefault: savedAddresses.length === 0,
            },
            { headers: { token } }
          );
          await loadSavedAddresses();
        } catch (addrError) {
          console.error("Error saving address:", addrError);
        }
      }
    };

    try {
      let response = await axios.post(url + "/api/order/place", orderData, {
        headers: { token },
      });
      if (response.data.success) {
        if (paymentMethod === "razorpay") {
          await afterOrderPlaced();
          toast.success("Order created — complete payment in the secure window.");
          try {
            const cr = await axios.post(
              url + "/api/payment/razorpay/create-order",
              { orderId: response.data.orderId },
              { headers: { token } }
            );
            if (!cr.data.success) {
              toast.error(cr.data.message || "Could not start Razorpay checkout");
              return;
            }
            const checkoutMeta = extractRetryAttemptsMeta(cr.data.checkoutRetry);
            if (checkoutMeta) {
              setRazorpayRetryMeta(checkoutMeta);
            }
            const {
              keyId,
              razorpayOrderId,
              amountPaise,
              orderNumber: placedOrderNumber,
            } = cr.data;
            await loadRazorpayScript();
            const options = {
              key: keyId,
              amount: amountPaise,
              currency: "INR",
              name: "Food delivery",
              description: placedOrderNumber
                ? `Order ${placedOrderNumber}`
                : "Food order",
              order_id: razorpayOrderId,
              handler: async (rzResponse) => {
                try {
                  await axios.post(
                    url + "/api/payment/razorpay/verify",
                    {
                      orderId: response.data.orderId,
                      razorpay_order_id: rzResponse.razorpay_order_id,
                      razorpay_payment_id: rzResponse.razorpay_payment_id,
                      razorpay_signature: rzResponse.razorpay_signature,
                    },
                    { headers: { token } }
                  );
                  toast.success("Payment successful!");
                  setRazorpayRetryMeta(null);
                  navigate("/myorders");
                } catch (verErr) {
                  toast.error(
                    verErr.response?.data?.message || "Payment verification failed"
                  );
                }
              },
              modal: {
                ondismiss: () => {
                  toast.info("Payment window closed — your order is unpaid until you pay.");
                },
              },
            };
            const rzp = new window.Razorpay(options);
            rzp.on("payment.failed", (ev) => {
              toast.error(
                ev?.error?.description || ev?.error?.reason || "Payment failed"
              );
            });
            rzp.open();
          } catch (rzErr) {
            console.error("Razorpay checkout error:", rzErr);
            const retryMeta = extractRetryAttemptsMeta(rzErr.response?.data);
            if (retryMeta) {
              setRazorpayRetryMeta(retryMeta);
            }
            const retryMsg = buildRazorpayRetryMessage(rzErr.response?.data);
            if (rzErr.response?.status === 429 && retryMsg) {
              toast.info(retryMsg);
              return;
            }
            toast.error(
              rzErr.response?.data?.message ||
                "Could not open Razorpay. Check server keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)."
            );
          }
          return;
        }

        toast.success("Order placed successfully!");
        await afterOrderPlaced();
        navigate("/myorders");
      } else {
        toast.error("Error placing order!");
      }
    } catch (error) {
      console.error("Order placement error:", error);
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const message = error.response.data?.message || "Error placing order";
        
        if (status === 400 || status === 422) {
          // Validation error - show detailed errors if available
          if (error.response.data?.errors && Array.isArray(error.response.data.errors)) {
            const firstError = error.response.data.errors[0];
            toast.error(firstError.msg || message);
          } else {
            toast.error(message);
          }
        } else if (status === 401) {
          toast.error("Please login again");
          navigate("/");
        } else {
          toast.error(message);
        }
      } else if (error.request) {
        toast.error("Cannot connect to server. Please check if backend is running.");
      } else {
        toast.error("An error occurred: " + error.message);
      }
    }
  };

  useEffect(() => {
    axios
      .get(`${url}/api/order/checkout-hints`)
      .then((res) => {
        if (res.data?.success && res.data?.data) {
          setCheckoutHints(res.data.data);
        }
      })
      .catch(() => {});
  }, [url]);

  useEffect(() => {
    if (!token) {
      toast.error("Please Login first");
      navigate("/cart");
    } else if (getTotalCartAmount() === 0) {
      toast.error("Please Add Items to Cart");
      navigate("/cart");
    } else {
      loadSavedAddresses();
      fetchActiveOffers();
      fetchAvailableCoupons();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      calculateOffers();
      fetchAvailableCoupons();
    }
  }, [paymentMethod, getTotalCartAmount()]);

  const checkoutCtaLabel = checkoutCtaVariant === "treatment" ? "SECURE CHECKOUT" : "PLACE ORDER";

  // Fetch active offers
  const fetchActiveOffers = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${url}/api/offer/active`, {
        headers: { token }
      });
      if (response.data.success) {
        setAvailableOffers(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching offers:", error);
    }
  };

  // Fetch available coupon codes
  const fetchAvailableCoupons = async () => {
    if (!token) return;
    const orderAmount = getTotalCartAmount();
    try {
      const response = await axios.get(`${url}/api/coupon/available?orderAmount=${orderAmount}`, {
        headers: { token }
      });
      if (response.data.success) {
        setAvailableCoupons(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching available coupons:", error);
    }
  };

  // Calculate offers and discounts
  const calculateOffers = async () => {
    if (!token) return;
    const orderAmount = getTotalCartAmount();
    
    try {
      const response = await axios.post(
        `${url}/api/offer/calculate`,
        {
          orderAmount,
          paymentMethod
        },
        { headers: { token } }
      );

      if (response.data.success) {
        const { totalDiscount, deliveryFee: calculatedFee, freeDelivery: isFree, appliedOffers: offers } = response.data.data;
        setOfferDiscount(totalDiscount);
        setAppliedOffers(offers || []);
        
        // Check default free delivery threshold
        if (!isFree && orderAmount >= FREE_DELIVERY_THRESHOLD) {
          setDeliveryFee(0);
          setFreeDelivery(true);
        } else {
          setDeliveryFee(calculatedFee);
          setFreeDelivery(isFree);
        }
      }
    } catch (error) {
      console.error("Error calculating offers:", error);
      // Fallback to default
      const orderAmount = getTotalCartAmount();
      if (orderAmount >= FREE_DELIVERY_THRESHOLD) {
        setDeliveryFee(0);
        setFreeDelivery(true);
      } else {
        setDeliveryFee(2);
        setFreeDelivery(false);
      }
    }
  };

  const calculateTotal = () => {
    const subtotal = getTotalCartAmount();
    const calculatedDeliveryFee = freeDelivery ? 0 : (subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : deliveryFee);
    const total = subtotal + calculatedDeliveryFee - couponDiscount - offerDiscount;
    return { 
      subtotal, 
      deliveryFee: calculatedDeliveryFee, 
      discount: couponDiscount + offerDiscount,
      total: Math.max(0, total) 
    };
  };

  const totals = calculateTotal();
  const netItemsAfterDiscount = Math.max(0, totals.subtotal - totals.discount);
  const serviceFeePercent = Number(checkoutHints?.serviceFeePercent) || 0;
  const serviceFeeMaxInr = Number(checkoutHints?.serviceFeeMaxInr);
  const serviceFeeCap = Number.isFinite(serviceFeeMaxInr) ? serviceFeeMaxInr : 50;
  const estimatedServiceFee =
    serviceFeePercent > 0
      ? Math.min(
          serviceFeeCap,
          Math.round((netItemsAfterDiscount * serviceFeePercent) / 100 * 100) / 100
        )
      : 0;
  const tipMaxFixed = Number(checkoutHints?.tipMaxFixedInr);
  const tipPctCap = Number(checkoutHints?.tipMaxPercentOfSubtotal);
  const tipMaxByPct =
    Number.isFinite(tipPctCap) && tipPctCap > 0
      ? Math.round(totals.subtotal * (tipPctCap / 100) * 100) / 100
      : Math.round(totals.subtotal * 0.25 * 100) / 100;
  const tipAllowedMax = Math.min(
    Number.isFinite(tipMaxFixed) ? tipMaxFixed : 500,
    tipMaxByPct
  );
  const tipParsedDisplay = parseFloat(String(tipAmountInput || "").trim());
  const tipAmountNum =
    Number.isFinite(tipParsedDisplay) && tipParsedDisplay > 0
      ? Math.round(tipParsedDisplay * 100) / 100
      : 0;
  const grandTotalWithExtras = Math.max(
    0,
    totals.total + estimatedServiceFee + tipAmountNum
  );

  return (
    <form className="place-order" onSubmit={placeOrder}>
      <div className="place-order-left">
        <p className="title">Delivery Information</p>
        
        {/* Saved Addresses Section */}
        <div className="saved-addresses-section">
          <div className="address-section-header">
            <h4>Delivery Address</h4>
            <button 
              type="button"
              className="manage-addresses-btn"
              onClick={() => setShowAddressManager(true)}
            >
              {savedAddresses.length > 0 ? 'Manage Addresses' : 'Add Address'}
            </button>
          </div>
          
          {savedAddresses.length > 0 ? (
            <>
              <div className="address-radio-group">
                {savedAddresses.map((addr) => (
                  <label 
                    key={addr.addressId} 
                    className={`address-radio-option ${selectedAddressId === addr.addressId ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="selectedAddress"
                      value={addr.addressId}
                      checked={selectedAddressId === addr.addressId}
                      onChange={(e) => handleAddressSelect(e.target.value)}
                    />
                    <div className="address-radio-content">
                      <div className="address-radio-header">
                        <div>
                          <strong>{addr.name}</strong>
                          <span className="address-type-badge">{addr.type}</span>
                          {addr.isDefault && <span className="default-badge-small">Default</span>}
                        </div>
                        <button
                          type="button"
                          className="delete-address-btn-small"
                          onClick={(e) => handleDeleteAddress(addr.addressId, e)}
                          disabled={savedAddresses.length === 1}
                          title={savedAddresses.length === 1 ? "Cannot delete the only address" : "Delete this address"}
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="address-radio-details">
                        <p>{addr.addressLine1}, {addr.city}, {addr.state} {addr.pincode}</p>
                        {addr.country && <p>Country: {addr.country}</p>}
                        <p>Phone: {addr.phone}</p>
                        {addr.email && <p>Email: {addr.email}</p>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <label className="use-new-address-option">
                <input
                  type="radio"
                  name="selectedAddress"
                  value=""
                  checked={!selectedAddressId}
                  onChange={() => handleAddressSelect(null)}
                />
                <span>Use a new address</span>
              </label>
            </>
          ) : (
            <div className="no-addresses-message">
              <p>No saved addresses. Click "Add Address" to save one for faster checkout.</p>
            </div>
          )}
        </div>

        {/* Address Form - Only show if no saved address selected */}
        {!selectedAddressId && (
          <>
            <p className="form-section-title">Enter Delivery Details</p>
            <div className="multi-fields">
              <input
                required={!selectedAddressId}
                name="firstName"
                value={data.firstName}
                onChange={onChangeHandler}
                type="text"
                placeholder="First name"
                disabled={!!selectedAddressId}
              />
              <input
                required={!selectedAddressId}
                name="lastName"
                value={data.lastName}
                onChange={onChangeHandler}
                type="text"
                placeholder="Last name"
                disabled={!!selectedAddressId}
              />
            </div>
            <input
              required={!selectedAddressId}
              name="email"
              value={data.email}
              onChange={onChangeHandler}
              type="email"
              placeholder="Email Address"
              disabled={!!selectedAddressId}
            />
            <input
              required={!selectedAddressId}
              name="street"
              value={data.street}
              onChange={onChangeHandler}
              type="text"
              placeholder="Street"
              disabled={!!selectedAddressId}
            />
            <div className="multi-fields">
              <input
                required={!selectedAddressId}
                name="city"
                value={data.city}
                onChange={onChangeHandler}
                type="text"
                placeholder="City"
                disabled={!!selectedAddressId}
              />
              <input
                required={!selectedAddressId}
                name="state"
                value={data.state}
                onChange={onChangeHandler}
                type="text"
                placeholder="State"
                disabled={!!selectedAddressId}
              />
            </div>
            <div className="multi-fields">
              <input
                required={!selectedAddressId}
                name="zipcode"
                value={data.zipcode}
                onChange={onChangeHandler}
                type="text"
                placeholder="Zip Code"
                disabled={!!selectedAddressId}
              />
              <input
                required={!selectedAddressId}
                name="country"
                value={data.country}
                onChange={onChangeHandler}
                type="text"
                placeholder="Country"
                disabled={!!selectedAddressId}
              />
            </div>
            <input
              required={!selectedAddressId}
              name="phone"
              value={data.phone}
              onChange={onChangeHandler}
              type="tel"
              placeholder="Phone"
              disabled={!!selectedAddressId}
            />
          </>
        )}

        {/* Show selected address details if using saved address */}
        {selectedAddressId && (
          <div className="selected-address-display">
            <p className="form-section-title">Selected Address</p>
            {(() => {
              const selectedAddr = savedAddresses.find(addr => addr.addressId === selectedAddressId);
              return selectedAddr ? (
                <div className="selected-address-card">
                  <div className="selected-address-header">
                    <strong>{selectedAddr.name}</strong>
                    <span className="address-type-badge">{selectedAddr.type}</span>
                    {selectedAddr.isDefault && <span className="default-badge-small">Default</span>}
                  </div>
                  <div className="selected-address-details">
                    <p><strong>Email:</strong> {selectedAddr.email || 'Not provided'}</p>
                    <p><strong>Phone:</strong> {selectedAddr.phone}</p>
                    <p><strong>Address:</strong> {selectedAddr.addressLine1}</p>
                    {selectedAddr.addressLine2 && <p>{selectedAddr.addressLine2}</p>}
                    <p>{selectedAddr.city}, {selectedAddr.state} {selectedAddr.pincode}</p>
                    {selectedAddr.country && <p><strong>Country:</strong> {selectedAddr.country}</p>}
                    {selectedAddr.landmark && <p><strong>Landmark:</strong> {selectedAddr.landmark}</p>}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}

        <div className="schedule-section">
          <p className="form-section-title">Delivery Time</p>
          <div className="schedule-mode-options">
            <label className={`schedule-mode-option ${deliveryMode === "asap" ? "selected" : ""}`}>
              <input
                type="radio"
                name="deliveryMode"
                value="asap"
                checked={deliveryMode === "asap"}
                onChange={() => setDeliveryMode("asap")}
              />
              <span>As soon as possible</span>
            </label>
            <label className={`schedule-mode-option ${deliveryMode === "scheduled" ? "selected" : ""}`}>
              <input
                type="radio"
                name="deliveryMode"
                value="scheduled"
                checked={deliveryMode === "scheduled"}
                onChange={() => setDeliveryMode("scheduled")}
              />
              <span>Schedule for later</span>
            </label>
          </div>

          {deliveryMode === "scheduled" && (
            <div className="schedule-picker-grid">
              <div>
                <label htmlFor="scheduledDate">Date</label>
                <select
                  id="scheduledDate"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                >
                  {scheduleDateOptions.map((dateValue) => (
                    <option key={dateValue} value={dateValue}>
                      {buildDateLabel(dateValue)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="scheduledSlotId">Time slot</label>
                <select
                  id="scheduledSlotId"
                  value={selectedScheduledSlotId}
                  onChange={(e) => setSelectedScheduledSlotId(e.target.value)}
                  disabled={!availableScheduleSlots.length}
                >
                  {availableScheduleSlots.length === 0 ? (
                    <option value="">No slots available</option>
                  ) : (
                    availableScheduleSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {selectedScheduleSlot && (
                <p className="schedule-selection-preview">
                  Scheduled for {buildDateLabel(selectedScheduleSlot.date)} at{" "}
                  {selectedScheduleSlot.startTime} - {selectedScheduleSlot.endTime}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="place-order-right">
        <div className="cart-total">
          <h2>Cart Totals</h2>
          <div>
            <div className="cart-total-details">
              <p>Subtotals</p>
              <p>{formatCurrency(totals.subtotal)}</p>
            </div>
            <hr />
            <div className="cart-total-details">
              <p>Delivery Fee</p>
              <p>
                {freeDelivery || totals.deliveryFee === 0 ? (
                  <span style={{ color: 'green', textDecoration: 'line-through' }}>
                    {formatCurrency(2)} <span style={{ color: 'green', textDecoration: 'none' }}>FREE</span>
                  </span>
                ) : (
                  <>
                    {formatCurrency(totals.deliveryFee)}
                    {getTotalCartAmount() < FREE_DELIVERY_THRESHOLD && (
                      <span style={{ fontSize: '12px', color: '#666', display: 'block', marginTop: '5px' }}>
                        Add {formatCurrency(FREE_DELIVERY_THRESHOLD - getTotalCartAmount())} more for free delivery!
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            
            {/* Applied Offers */}
            {appliedOffers.length > 0 && (
              <>
                <hr />
                <div className="applied-offers-section">
                  <p style={{ fontWeight: '600', marginBottom: '10px' }}>Applied Offers:</p>
                  {appliedOffers.map((offer, index) => (
                    <div key={index} className="applied-offer-item">
                      <span style={{ color: 'green' }}>✓ {offer.title}</span>
                      <span style={{ color: 'green' }}>-{formatCurrency(offer.discount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Offer Discount */}
            {offerDiscount > 0 && (
              <>
                <hr />
                <div className="cart-total-details">
                  <p>Offer Discount</p>
                  <p style={{ color: 'green' }}>-{formatCurrency(offerDiscount)}</p>
                </div>
              </>
            )}
            
            {/* Coupon Code Section */}
            <div className="coupon-section">
              <div className="coupon-input-group">
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    if (couponApplied) {
                      setCouponApplied(false);
                      setCouponDiscount(0);
                    }
                  }}
                  disabled={isValidatingCoupon}
                />
                {!couponApplied ? (
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={isValidatingCoupon || !couponCode.trim()}
                    className="apply-coupon-btn"
                  >
                    {isValidatingCoupon ? "Applying..." : "Apply"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="remove-coupon-btn"
                  >
                    Remove
                  </button>
                )}
              </div>
              {couponApplied && couponDiscount > 0 && (
                <div className="coupon-applied">
                  <p>Coupon Applied: {formatCurrency(-couponDiscount)}</p>
                </div>
              )}
            </div>
            
            {couponDiscount > 0 && (
              <>
                <hr />
                <div className="cart-total-details">
                  <p>Discount</p>
                  <p style={{ color: 'green' }}>{formatCurrency(-couponDiscount)}</p>
                </div>
              </>
            )}

            {estimatedServiceFee > 0 && (
              <>
                <hr />
                <div className="cart-total-details">
                  <p>Service fee</p>
                  <p>{formatCurrency(estimatedServiceFee)}</p>
                </div>
              </>
            )}

            <hr />
            <div className="checkout-tip-row">
              <label htmlFor="tipAmount">Tip (optional)</label>
              <input
                id="tipAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={tipAmountInput}
                onChange={(e) => setTipAmountInput(e.target.value)}
              />
              {checkoutHints ? (
                <small className="checkout-tip-hint">
                  Max {formatCurrency(tipAllowedMax)} for this order
                </small>
              ) : null}
            </div>
            
            <hr />
            <div className="cart-total-details">
              <b>Total</b>
              <b>{formatCurrency(grandTotalWithExtras)}</b>
            </div>
          </div>

          {/* Available Offers Display */}
          {availableOffers.length > 0 && (
            <div className="available-offers-section">
              <h3>Available Offers</h3>
              <div className="offers-list">
                {availableOffers.slice(0, 3).map((offer) => (
                  <div key={offer._id} className="offer-card">
                    <div className="offer-icon">
                      {offer.offerType === 'free_delivery' ? '🚚' :
                       offer.offerType === 'first_order' ? '🎁' :
                       offer.offerType === 'payment_method_discount' ? '💳' : '🎉'}
                    </div>
                    <div className="offer-content">
                      <strong>{offer.bannerText || offer.title}</strong>
                      <p>{offer.description || 'Special offer available'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Coupon Codes Display */}
          {availableCoupons.length > 0 && (
            <div className="available-coupons-section" style={{ marginTop: '25px', padding: '20px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '18px', color: '#2e7d32' }}>🎟️ Available Coupon Codes</h3>
              <div className="coupons-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {availableCoupons.map((coupon) => (
                  <div key={coupon.code} className="coupon-card" style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '12px', 
                    backgroundColor: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #c8e6c9'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <strong style={{ fontSize: '14px', color: '#2e7d32' }}>{coupon.code}</strong>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '2px 6px', 
                          backgroundColor: '#4caf50', 
                          color: 'white', 
                          borderRadius: '4px' 
                        }}>
                          {coupon.discountType === 'percentage' 
                            ? `${coupon.discountValue}% OFF` 
                            : `${formatCurrency(coupon.discountValue)} OFF`}
                        </span>
                      </div>
                      {coupon.description && (
                        <p style={{ fontSize: '12px', color: '#666', margin: '4px 0' }}>{coupon.description}</p>
                      )}
                      <p style={{ fontSize: '11px', color: '#4caf50', margin: '4px 0' }}>
                        Save up to {formatCurrency(coupon.potentialDiscount)}
                        {coupon.minOrderAmount > 0 && ` • Min order: ${formatCurrency(coupon.minOrderAmount)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCouponCode(coupon.code);
                        handleApplyCoupon();
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#4caf50'}
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
                💡 Click "Apply" to automatically use the coupon code
              </p>
            </div>
          )}

          {/* Payment Method Selection */}
          <div className="payment-section">
            <h3>Payment Method</h3>
            <div className="payment-methods">
              <label className={`payment-option ${paymentMethod === 'cash_on_delivery' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash_on_delivery"
                  checked={paymentMethod === 'cash_on_delivery'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>💵 Cash on Delivery</span>
              </label>
              
              <label className={`payment-option ${paymentMethod === 'upi' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="upi"
                  checked={paymentMethod === 'upi'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>📱 UPI (PhonePe, GPay, Paytm)</span>
              </label>
              
              <label className={`payment-option ${paymentMethod === 'netbanking' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="netbanking"
                  checked={paymentMethod === 'netbanking'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>🏦 Net Banking</span>
              </label>
              
              <label className={`payment-option ${paymentMethod === 'credit_card' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="credit_card"
                  checked={paymentMethod === 'credit_card'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>💳 Credit Card</span>
              </label>
              
              <label className={`payment-option ${paymentMethod === 'debit_card' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="debit_card"
                  checked={paymentMethod === 'debit_card'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>💳 Debit Card</span>
              </label>
              
              <label className={`payment-option ${paymentMethod === 'wallet' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="wallet"
                  checked={paymentMethod === 'wallet'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>👛 Wallet (Paytm, PhonePe, etc.)</span>
              </label>

              <label className={`payment-option ${paymentMethod === "razorpay" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="razorpay"
                  checked={paymentMethod === "razorpay"}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>Razorpay (card, UPI, netbanking)</span>
              </label>
              {paymentMethod === "razorpay" && razorpayRetryMeta ? (
                <p className="payment-retry-meta" role="status">
                  Attempts left this hour: {razorpayRetryMeta.attemptsLeft}/
                  {razorpayRetryMeta.maxAttempts}
                </p>
              ) : null}
            </div>

            {/* Payment Details Input */}
            {paymentMethod === 'upi' && (
              <div className="payment-details-input">
                <input
                  type="text"
                  placeholder="Enter UPI ID (e.g., yourname@paytm, yourname@ybl, yourname@okaxis)"
                  value={paymentDetails.upiId}
                  onChange={(e) => setPaymentDetails({...paymentDetails, upiId: e.target.value})}
                  required
                />
                <small style={{ color: '#666', fontSize: '12px', display: 'block', marginTop: '5px' }}>
                  Format: yourname@paytm, yourname@ybl (PhonePe), yourname@okaxis (GPay), etc.
                </small>
              </div>
            )}

            {paymentMethod === 'netbanking' && (
              <div className="payment-details-input">
                <input
                  type="text"
                  placeholder="Bank Name"
                  value={paymentDetails.bankName}
                  onChange={(e) => setPaymentDetails({...paymentDetails, bankName: e.target.value})}
                />
              </div>
            )}

            {paymentMethod === 'credit_card' || paymentMethod === 'debit_card' ? (
              <div className="payment-details-input">
                <input
                  type="text"
                  placeholder="Last 4 digits of card"
                  maxLength="4"
                  value={paymentDetails.cardLast4}
                  onChange={(e) => setPaymentDetails({...paymentDetails, cardLast4: e.target.value.replace(/\D/g, '')})}
                />
                <select
                  value={paymentDetails.cardType}
                  onChange={(e) => setPaymentDetails({...paymentDetails, cardType: e.target.value})}
                >
                  <option value="">Select Card Type</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="RuPay">RuPay</option>
                </select>
              </div>
            ) : null}

            {paymentMethod === 'wallet' && (
              <div className="payment-details-input">
                <select
                  value={paymentDetails.walletName}
                  onChange={(e) => setPaymentDetails({...paymentDetails, walletName: e.target.value})}
                >
                  <option value="">Select Wallet</option>
                  <option value="Paytm">Paytm</option>
                  <option value="PhonePe">PhonePe</option>
                  <option value="Google Pay">Google Pay</option>
                  <option value="Amazon Pay">Amazon Pay</option>
                </select>
              </div>
            )}
          </div>

          <button type="submit">{checkoutCtaLabel}</button>
        </div>
      </div>

      {/* Address Manager Modal */}
      {showAddressManager && (
        <div className="address-manager-overlay" onClick={() => setShowAddressManager(false)}>
          <div className="address-manager-modal" onClick={(e) => e.stopPropagation()}>
            <AddressManager
              onSelectAddress={handleAddressSelect}
              selectedAddressId={selectedAddressId}
              onClose={handleAddressManagerClose}
            />
          </div>
        </div>
      )}
    </form>
  );
};

export default PlaceOrder;
