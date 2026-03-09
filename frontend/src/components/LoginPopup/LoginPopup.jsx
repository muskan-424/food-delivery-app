import React, { useContext, useState } from "react";
import "./LoginPopup.css";
import { assets } from "../../assets/frontend_assets/assets";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";

const LoginPopup = ({ setShowLogin }) => {
  const {url, setToken } = useContext(StoreContext);
  const [currentState, setCurrentState] = useState("Login");
  const [data, setData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;
    setData((data) => ({ ...data, [name]: value }));
  };

  const onLogin = async (event) => {
    event.preventDefault();
    try {
      let newUrl = url;
      if (currentState === "Login") {
        newUrl += "/api/user/login";
      } else {
        newUrl += "/api/user/register";
      }
      
      const response = await axios.post(newUrl, data);
      
      if (response.data.success) {
        setToken(response.data.token);
        // Token is automatically saved to localStorage by setTokenWithStorage
        toast.success(currentState === "Login" ? "Login Successfully" : "Account Created Successfully");
        setShowLogin(false);
        // Reset form
        setData({
          name: "",
          email: "",
          password: "",
        });
      } else {
        toast.error(response.data.message || "Something went wrong");
      }
    } catch (error) {
      console.error("Login/Signup error:", error);
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const message = error.response.data?.message || "Server error occurred";
        
        if (status === 429) {
          // Rate limit exceeded
          toast.error("Too many attempts! Please wait a few minutes and try again.");
        } else if (status === 400 || status === 422) {
          // Validation error - show detailed errors if available
          if (error.response.data?.errors && Array.isArray(error.response.data.errors)) {
            // Show first validation error
            const firstError = error.response.data.errors[0];
            toast.error(firstError.msg || message);
          } else {
            toast.error(message);
          }
        } else if (status === 401 || status === 404) {
          // Authentication error
          toast.error(message);
        } else if (status === 409) {
          // Conflict (user already exists)
          toast.error(message);
        } else {
          toast.error(message);
        }
      } else if (error.request) {
        // Request was made but no response received
        toast.error("Cannot connect to server. Please check if backend is running on " + url);
        console.error("Backend URL:", url);
      } else {
        // Something else happened
        toast.error("An error occurred: " + error.message);
      }
    }
  };
  return (
    <div className="login-popup">
      <form onSubmit={onLogin} className="login-popup-container">
        <div className="login-popup-title">
          <h2>{currentState}</h2>
          <img
            onClick={() => setShowLogin(false)}
            src={assets.cross_icon}
            alt=""
          />
        </div>
        <div className="login-popup-inputs">
          {currentState === "Login" ? (
            <></>
          ) : (
            <input
              name="name"
              onChange={onChangeHandler}
              value={data.name}
              type="text"
              placeholder="Your name"
              required
            />
          )}
          <input
            name="email"
            onChange={onChangeHandler}
            value={data.email}
            type="email"
            placeholder="Your email"
            required
          />
          <input
            name="password"
            onChange={onChangeHandler}
            value={data.password}
            type="password"
            placeholder={currentState === "Sign Up" ? "Password (min 6 characters)" : "Your password"}
            required
            minLength={currentState === "Sign Up" ? 6 : undefined}
          />
        </div>
        <button type="submit">
          {currentState === "Sign Up" ? "Create Account" : "Login"}
        </button>
        <div className="login-popup-condition">
          <input type="checkbox" required />
          <p>By continuing, i agree to the terms of use & privacy policy.</p>
        </div>
        {currentState === "Login" ? (
          <p>
            Create a new account?{" "}
            <span onClick={() => setCurrentState("Sign Up")}>Click here</span>
          </p>
        ) : (
          <p>
            Already have an account?{" "}
            <span onClick={() => setCurrentState("Login")}>Login here</span>
          </p>
        )}
      </form>
    </div>
  );
};

export default LoginPopup;
