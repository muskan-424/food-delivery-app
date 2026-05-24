import React, { useContext, useMemo, useState } from "react";
import "./FoodItem.css";
import { assets } from "../../assets/frontend_assets/assets";
import { StoreContext } from "../../context/StoreContext";
import FoodReviews from "../FoodReviews/FoodReviews";
import { formatCurrency } from "../../utils/currency";
import { grossFromExclusive } from "../../utils/menuTaxDisplay";

const FoodItem = ({ id, name, price, description, image, imageUrl, modifierGroups = [], restaurantMenuTax }) => {
  const {cartItems,addToCart,removeFromCart,url,toggleWishlist,isInWishlist}=useContext(StoreContext);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [selected, setSelected] = useState({});
  const hasModifiers = Array.isArray(modifierGroups) && modifierGroups.length > 0;

  const selectedModifierExclusiveTotal = useMemo(() => {
    let total = 0;
    for (const group of modifierGroups) {
      const keys = selected[group.key] || [];
      for (const key of keys) {
        const opt = (group.options || []).find((o) => o.key === key);
        total += Number(opt?.priceDelta) || 0;
      }
    }
    return total;
  }, [modifierGroups, selected]);

  const getModifiersPayload = () =>
    modifierGroups
      .map((g) => ({
        groupKey: g.key,
        optionKeys: (selected[g.key] || []).filter(Boolean),
      }))
      .filter((x) => x.optionKeys.length > 0);

  const toggleOption = (group, optionKey) => {
    const current = selected[group.key] || [];
    const maxSelect = Number(group.maxSelect);
    const isAlready = current.includes(optionKey);
    let next = current;
    if (isAlready) {
      next = current.filter((x) => x !== optionKey);
    } else if (Number.isFinite(maxSelect) && maxSelect > 0 && current.length >= maxSelect) {
      next = [...current.slice(1), optionKey];
    } else {
      next = [...current, optionKey];
    }
    setSelected((prev) => ({ ...prev, [group.key]: next }));
  };

  const handleAddWithModifiers = () => {
    addToCart(id, getModifiersPayload());
    setShowCustomizer(false);
  };

  // Construct image URL with fallback
  const getImageUrl = () => {
    if (imageUrl) return imageUrl;
    if (!image) {
      // Return placeholder if no image
      return "https://via.placeholder.com/300x200?text=No+Image";
    }
    // Ensure proper URL construction
    const imagePath = image.startsWith('http') ? image : `${url}/images/${image}`;
    return imagePath;
  };

  return (
    <div className="food-item">
      <div className="food-item-img-container">
        <img 
          src={getImageUrl()} 
          alt={name || "Food item"} 
          className="food-item-image"
          onError={(e) => {
            // Fallback to placeholder if image fails to load
            e.target.src = "https://via.placeholder.com/300x200?text=Image+Not+Found";
          }}
        />
        <button 
          className={`wishlist-btn ${isInWishlist(id) ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleWishlist(id);
          }}
          title={isInWishlist(id) ? "Remove from wishlist" : "Add to wishlist"}
        >
          {isInWishlist(id) ? '❤️' : '🤍'}
        </button>
        {!cartItems[id] ? (
          <img
            className="add"
            onClick={() => (hasModifiers ? setShowCustomizer(true) : addToCart(id))}
            src={assets.add_icon_white}
            alt=""
          />
        ) : (
          <div className="food-item-counter">
            <img onClick={()=>removeFromCart(id)} src={assets.remove_icon_red} alt="" />
            <p>{cartItems[id]}</p>
            <img onClick={()=> (hasModifiers ? setShowCustomizer(true) : addToCart(id))} src={assets.add_icon_green} alt="" />
          </div>
        )}
      </div>
      <div className="food-item-info">
        <div className="food-item-name-rating">
          <p>{name}</p>
          <img src={assets.rating_starts} alt="" />
        </div>
        <p className="food-item-desc">{description}</p>
        <p className="food-item-price">
          {formatCurrency(grossFromExclusive(Number(price) || 0, restaurantMenuTax))}
        </p>
        <FoodReviews foodId={id} />
      </div>
      {showCustomizer && (
        <div style={{ padding: "12px", borderTop: "1px solid #eee" }}>
          <p style={{ marginBottom: "8px", fontWeight: 600 }}>Customize</p>
          {modifierGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: "8px" }}>
              <p style={{ marginBottom: "4px", fontSize: "13px" }}>{group.name}</p>
              {(group.options || []).map((opt) => {
                const checked = (selected[group.key] || []).includes(opt.key);
                return (
                  <label key={opt.key} style={{ display: "block", fontSize: "12px" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(group, opt.key)}
                    />{" "}
                    {opt.name} (
                    {formatCurrency(grossFromExclusive(Number(opt.priceDelta) || 0, restaurantMenuTax))})
                  </label>
                );
              })}
            </div>
          ))}
          <p style={{ fontSize: "12px", marginBottom: "8px" }}>
            Item total:{" "}
            {formatCurrency(
              grossFromExclusive(
                (Number(price) || 0) + selectedModifierExclusiveTotal,
                restaurantMenuTax
              )
            )}
          </p>
          <button type="button" onClick={handleAddWithModifiers}>Add Customized Item</button>
          <button type="button" onClick={() => setShowCustomizer(false)} style={{ marginLeft: "8px" }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default FoodItem;
