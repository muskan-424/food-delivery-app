import React, { useContext, useState } from "react";
import "./FoodItem.css";
import { assets } from "../../assets/frontend_assets/assets";
import { StoreContext } from "../../context/StoreContext";
import FoodReviews from "../FoodReviews/FoodReviews";
import { formatCurrency } from "../../utils/currency";

const FoodItem = ({ id, name, price, description, image }) => {
  const {cartItems,addToCart,removeFromCart,url,toggleWishlist,isInWishlist}=useContext(StoreContext); 

  // Construct image URL with fallback
  const getImageUrl = () => {
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
            onClick={() => addToCart(id)}
            src={assets.add_icon_white}
            alt=""
          />
        ) : (
          <div className="food-item-counter">
            <img onClick={()=>removeFromCart(id)} src={assets.remove_icon_red} alt="" />
            <p>{cartItems[id]}</p>
            <img onClick={()=>addToCart(id)} src={assets.add_icon_green} alt="" />
          </div>
        )}
      </div>
      <div className="food-item-info">
        <div className="food-item-name-rating">
          <p>{name}</p>
          <img src={assets.rating_starts} alt="" />
        </div>
        <p className="food-item-desc">{description}</p>
        <p className="food-item-price">{formatCurrency(price)}</p>
        <FoodReviews foodId={id} />
      </div>
    </div>
  );
};

export default FoodItem;
