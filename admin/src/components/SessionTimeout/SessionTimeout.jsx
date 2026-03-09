import React, { useState, useEffect, useContext } from 'react';
import { StoreContext } from '../../context/StoreContext';
import { getTimeUntilExpiration } from '../../utils/tokenUtils';
import { toast } from 'react-toastify';
import './SessionTimeout.css';

const SessionTimeout = () => {
  const { token, setTokenWithStorage } = useContext(StoreContext);
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!token) return;

    const checkTokenExpiration = () => {
      const timeUntilExpiration = getTimeUntilExpiration(token);
      
      if (!timeUntilExpiration) {
        // Token is expired
        setShowWarning(false);
        return;
      }

      // Show warning 5 minutes before expiration
      const warningThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
      
      if (timeUntilExpiration <= warningThreshold && timeUntilExpiration > 0) {
        setShowWarning(true);
        setTimeLeft(Math.ceil(timeUntilExpiration / 1000)); // Convert to seconds
      } else {
        setShowWarning(false);
      }
    };

    // Check immediately
    checkTokenExpiration();

    // Check every 30 seconds
    const interval = setInterval(checkTokenExpiration, 30000);

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!showWarning || timeLeft <= 0) return;

    const countdown = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setShowWarning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [showWarning, timeLeft]);

  const handleExtendSession = () => {
    // In a real app, you would refresh the token here
    toast.info('Please save your work and login again to extend your session.');
    setShowWarning(false);
  };

  const handleLogout = () => {
    setTokenWithStorage('');
    setShowWarning(false);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!showWarning) return null;

  return (
    <div className="session-timeout-overlay">
      <div className="session-timeout-modal">
        <div className="session-timeout-header">
          <h3>Session Expiring Soon</h3>
        </div>
        <div className="session-timeout-content">
          <p>Your session will expire in:</p>
          <div className="session-timeout-timer">
            {formatTime(timeLeft)}
          </div>
          <p>Please save your work and extend your session or you will be logged out automatically.</p>
        </div>
        <div className="session-timeout-actions">
          <button onClick={handleExtendSession} className="btn-primary">
            Extend Session
          </button>
          <button onClick={handleLogout} className="btn-secondary">
            Logout Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeout;