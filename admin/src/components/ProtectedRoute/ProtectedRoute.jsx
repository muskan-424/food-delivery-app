import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { StoreContext } from '../../context/StoreContext';

const ProtectedRoute = ({ children }) => {
  const { token, admin } = useContext(StoreContext);

  // If not authenticated or not admin, redirect to login
  if (!token || !admin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;