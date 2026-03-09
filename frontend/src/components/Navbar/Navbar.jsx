import React, { useContext, useState, useEffect, useRef } from "react";
import "./Navbar.css";
import { assets } from "../../assets/frontend_assets/assets";
import { Link, useNavigate } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { toast } from "react-toastify";

const Navbar = ({ setShowLogin }) => {
  const [menu, setMenu] = useState("home");
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef(null);
  const { getTotalCartAmount, token, setToken, setSearchQuery } = useContext(StoreContext);
  const navigate=useNavigate();

  const logout=()=>{
    // Clear token from memory and localStorage
    setToken("");
    toast.success("Logout Successfully")
    navigate("/");
  }

  const handleSearchClick = () => {
    setShowSearch(!showSearch);
    if (!showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    if (setSearchQuery) {
      setSearchQuery(e.target.value);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (setSearchQuery) {
      setSearchQuery(searchTerm);
    }
    // Scroll to food display section
    const foodDisplay = document.getElementById('food-display');
    if (foodDisplay) {
      foodDisplay.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    // Close search on outside click
    const handleClickOutside = (event) => {
      if (showSearch && !event.target.closest('.navbar-search-container')) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearch]);

  return (
    <div className="navbar">
      <Link to="/">
        <img src={assets.logo} alt="" className="logo" />
      </Link>
      <ul className="navbar-menu">
        <Link
          to="/"
          onClick={() => setMenu("home")}
          className={menu === "home" ? "active" : ""}
        >
          home
        </Link>
        <a
          href="#explore-menu"
          onClick={() => setMenu("menu")}
          className={menu === "menu" ? "active" : ""}
        >
          menu
        </a>
        <a
          href="#footer"
          onClick={() => setMenu("contact-us")}
          className={menu === "contact-us" ? "active" : ""}
        >
          contact us
        </a>
      </ul>
      <div className="navbar-right">
        <div className="navbar-search-container">
          {showSearch ? (
            <form onSubmit={handleSearchSubmit} className="navbar-search-form">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search food..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="navbar-search-input"
              />
              <button type="submit" className="navbar-search-submit">
                <img src={assets.search_icon} alt="Search" />
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setShowSearch(false);
                  setSearchTerm("");
                  if (setSearchQuery) setSearchQuery("");
                }}
                className="navbar-search-close"
              >
                ×
              </button>
            </form>
          ) : (
            <img 
              src={assets.search_icon} 
              alt="" 
              onClick={handleSearchClick}
              className="navbar-search-icon-clickable"
            />
          )}
        </div>
        <div className="navbar-search-icon">
          <Link to="/cart">
            <img src={assets.basket_icon} alt="" />
          </Link>
          <div className={getTotalCartAmount() === 0 ? "" : "dot"}></div>
        </div>
        {!token ? (
          <button onClick={() => setShowLogin(true)}>sign in</button>
        ) : (
          <>
            <Link to="/wishlist" className="navbar-wishlist-icon">
              <span className="wishlist-icon">🤍</span>
            </Link>
            <div className="navbar-profile">
              <img src={assets.profile_icon} alt="" />
              <ul className="nav-profile-dropdown">
                <li onClick={()=>navigate("/myorders")}><img src={assets.bag_icon} alt="" /><p>Orders</p></li>
                <li onClick={()=>navigate("/payments")}><span className="dropdown-icon">💳</span><p>Payment History</p></li>
                <li onClick={()=>navigate("/profile")}><img src={assets.profile_icon} alt="" /><p>Profile</p></li>
                <li onClick={()=>navigate("/wishlist")}><span className="dropdown-icon">🤍</span><p>Wishlist</p></li>
                <li onClick={()=>navigate("/support")}><span className="dropdown-icon">💬</span><p>Support</p></li>
                <hr />
                <li onClick={logout}><img src={assets.logout_icon} alt="" /><p>Logout</p></li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Navbar;
