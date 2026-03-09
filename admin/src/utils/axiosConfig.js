import axios from 'axios';
import { toast } from 'react-toastify';

// Create axios instance with default configuration
const axiosInstance = axios.create({
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token and loading state
axiosInstance.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching
    config.params = {
      ...config.params,
      _t: Date.now(),
    };
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for global error handling
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle timeout errors
    if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please check your connection and try again.');
      return Promise.reject(new Error('Request timeout'));
    }
    
    // Handle network errors
    if (!error.response) {
      toast.error('Network error. Please check your connection.');
      return Promise.reject(new Error('Network error'));
    }
    
    // Handle specific HTTP status codes
    switch (error.response.status) {
      case 401:
        // Token expired or invalid - handled by StoreContext interceptor
        break;
      case 403:
        toast.error('Access denied. You do not have permission to perform this action.');
        break;
      case 404:
        toast.error('Resource not found.');
        break;
      case 429:
        toast.error('Too many requests. Please wait a moment and try again.');
        break;
      case 500:
        toast.error('Server error. Please try again later.');
        break;
      default:
        // Let component handle specific errors
        break;
    }
    
    return Promise.reject(error);
  }
);

export default axiosInstance;