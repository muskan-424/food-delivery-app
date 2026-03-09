import React, { useContext } from "react";
import Navbar from "./components/Navbar/Navbar";
import Sidebar from "./components/Sidebar/Sidebar";
import { Route, Routes } from "react-router-dom";
import Add from "./pages/Add/Add";
import List from "./pages/List/List";
import Orders from "./pages/Orders/Orders";
import Dashboard from "./pages/Dashboard/Dashboard";
import Reviews from "./pages/Reviews/Reviews";
import Profile from "./pages/Profile/Profile";
import Payments from "./pages/Payments/Payments";
import Offers from "./pages/Offers/Offers";
import CustomerService from "./pages/CustomerService/CustomerService";
import SupportAgents from "./pages/SupportAgents/SupportAgents";
import UserManagement from "./pages/UserManagement/UserManagement";
import CreateAdmin from "./pages/CreateAdmin/CreateAdmin";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Login from "./components/Login/Login";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import SessionTimeout from "./components/SessionTimeout/SessionTimeout";
import { StoreContext } from "./context/StoreContext";

const App = () => {
  const url = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const { token, admin } = useContext(StoreContext);
  
  // Show login page if not authenticated
  if (!token || !admin) {
    return (
      <ErrorBoundary>
        <div>
          <ToastContainer />
          <Login url={url} />
        </div>
      </ErrorBoundary>
    );
  }

  // Show admin interface if authenticated
  return (
    <ErrorBoundary>
      <div>
        <ToastContainer />
        <SessionTimeout />
        <Navbar />
        <hr />
        <div className="app-content">
          <Sidebar />
          <Routes>
            <Route path="/" element={<Dashboard url={url}/>} />
            <Route path="/dashboard" element={<Dashboard url={url}/>} />
            <Route path="/add" element={
              <ProtectedRoute>
                <Add url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/list" element={
              <ProtectedRoute>
                <List url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute>
                <Orders url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/reviews" element={
              <ProtectedRoute>
                <Reviews url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/payments" element={
              <ProtectedRoute>
                <Payments url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/offers" element={
              <ProtectedRoute>
                <Offers url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/customer-service" element={
              <ProtectedRoute>
                <CustomerService url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/support-agents" element={
              <ProtectedRoute>
                <SupportAgents url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/user-management" element={
              <ProtectedRoute>
                <UserManagement url={url}/>
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile url={url} />
              </ProtectedRoute>
            } />
            <Route path="/create-admin" element={
              <ProtectedRoute>
                <CreateAdmin url={url} />
              </ProtectedRoute>
            } />
            {/* Fallback route */}
            <Route path="*" element={<Dashboard url={url}/>} />
          </Routes>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
