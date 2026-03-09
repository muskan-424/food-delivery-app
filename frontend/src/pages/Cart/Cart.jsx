import React, { useContext, useEffect, useState } from "react";
import "./Cart.css";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";
import axios from "axios";

const Cart = () => {
  const {
    food_list,
    cartItems,
    setCartItems,
    addToCart,
    removeFromCart,
    getTotalCartAmount,
    url,
    token
  } = useContext(StoreContext);

  const navigate=useNavigate();
  const [appliedOffers, setAppliedOffers] = useState([]);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(2);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [availableOffers, setAvailableOffers] = useState([]);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const FREE_DELIVERY_THRESHOLD = 150;

  // Calculate offers and discounts automatically
  const calculateOffers = async () => {
    if (!token) {
      // Reset to defaults if not logged in
      setOfferDiscount(0);
      setAppliedOffers([]);
      setDeliveryFee(2);
      setFreeDelivery(false);
      return;
    }

    const orderAmount = getTotalCartAmount();
    
    try {
      const response = await axios.post(
        `${url}/api/offer/calculate`,
        {
          orderAmount,
          paymentMethod: 'cash_on_delivery', // Default payment method for cart display
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
      setOfferDiscount(0);
      setAppliedOffers([]);
    }
  };

  // Fetch active offers
  const fetchActiveOffers = async () => {
    if (!token) {
      setAvailableOffers([]);
      return;
    }
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
    if (!token) {
      setAvailableCoupons([]);
      return;
    }
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

  // Calculate offers when cart items or token changes
  useEffect(() => {
    calculateOffers();
    fetchActiveOffers();
    fetchAvailableCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, token, getTotalCartAmount()]);

  // Calculate total with offers
  const calculateTotal = () => {
    const subtotal = getTotalCartAmount();
    const calculatedDeliveryFee = freeDelivery ? 0 : (subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : deliveryFee);
    const total = subtotal + calculatedDeliveryFee - offerDiscount;
    return { 
      subtotal, 
      deliveryFee: calculatedDeliveryFee, 
      discount: offerDiscount,
      total: Math.max(0, total) 
    };
  };

  const totals = calculateTotal();

  return (
    <div className="cart">
      <div className="cart-items">
        <div className="cart-items-title">
          <p>Items</p>
          <p>Title</p>
          <p>Price</p>
          <p>Quantity</p>
          <p>Total</p>
          <p>Remove</p>
        </div>
        <br />
        <hr />
        {food_list.map((item, index) => {
          if (cartItems[item._id] > 0) {
            return (
              <div>
                <div className="cart-items-title cart-items-item">
                  <img 
                    src={item.image ? `${url}/images/${item.image}` : "https://via.placeholder.com/100x100?text=No+Image"} 
                    alt={item.name || "Food item"}
                    onError={(e) => {
                      e.target.src = "https://via.placeholder.com/100x100?text=Image+Not+Found";
                    }}
                  />
                  <p>{item.name}</p>
                  <p>{formatCurrency(item.price)}</p>
                  <p>{cartItems[item._id]}</p>
                  <p>{formatCurrency(item.price * cartItems[item._id])}</p>
                  <p onClick={() => removeFromCart(item._id)} className="cross">
                    x
                  </p>
                </div>
                <hr />
              </div>
            );
          }
        })}
      </div>
      <div className="cart-bottom">
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
                    {getTotalCartAmount() < FREE_DELIVERY_THRESHOLD && getTotalCartAmount() > 0 && (
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
            
            <hr />
            <div className="cart-total-details">
              <b>Total</b>
              <b>{formatCurrency(totals.total)}</b>
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
            <div className="available-coupons-section" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '16px', color: '#2e7d32' }}>🎟️ Available Coupon Codes</h3>
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
                      onClick={() => {
                        navigator.clipboard.writeText(coupon.code);
                        alert(`Coupon code "${coupon.code}" copied to clipboard! Use it at checkout.`);
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
                💡 Copy the code and use it at checkout to apply the discount
              </p>
            </div>
          )}

          <button onClick={()=>navigate('/order')}>PROCEED TO CHECKOUT</button>
        </div>
        <div className="cart-promocode">
          <div>
            <p>If you have a promocode, Enter it here</p>
            <div className="cart-promocode-input">
              <input type="text" placeholder="promo code" />
              <button>Submit</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
