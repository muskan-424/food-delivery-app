import React, { useContext, useEffect } from "react";
import "./Wishlist.css";
import { StoreContext } from "../../context/StoreContext";
import FoodItem from "../../components/FoodItem/FoodItem";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { assets } from "../../assets/frontend_assets/assets";

const Wishlist = () => {
  const { wishlistItems, token, fetchWishlist } = useContext(StoreContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      toast.error("Please login to view your wishlist");
      navigate("/");
      return;
    }
    fetchWishlist();
  }, [token]);

  if (!token) {
    return null;
  }

  return (
    <div className="wishlist">
      <div className="wishlist-header">
        <h2>My Wishlist</h2>
        <p className="wishlist-count">
          {wishlistItems.length} {wishlistItems.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {wishlistItems.length === 0 ? (
        <div className="wishlist-empty">
          <img src={assets.basket_icon} alt="Empty wishlist" className="empty-icon" />
          <h3>Your wishlist is empty</h3>
          <p>Start adding items you love to your wishlist!</p>
          <button onClick={() => navigate("/")} className="browse-btn">
            Browse Food Items
          </button>
        </div>
      ) : (
        <div className="wishlist-items">
          <div className="food-display-list">
            {wishlistItems.map((item, index) => (
              <FoodItem
                key={item._id || index}
                id={item._id}
                name={item.name}
                description={item.description}
                price={item.price}
                image={item.image}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Wishlist;

