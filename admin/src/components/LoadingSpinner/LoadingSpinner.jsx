import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', message = 'Loading...', inline = false }) => {
  if (inline) {
    return (
      <div className="admin-loading-spinner inline">
        <div className={`admin-spinner ${size}`}></div>
        {message && <span className="admin-loading-message">{message}</span>}
      </div>
    );
  }

  return (
    <div className={`admin-loading-spinner-container ${size}`}>
      <div className="admin-loading-spinner">
        <div className={`admin-spinner ${size}`}></div>
      </div>
      {message && <p className="admin-loading-message">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;