import React, { useState, useEffect, useContext } from "react";
import "./CreateAdmin.css";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/LoadingSpinner/LoadingSpinner";

const CreateAdmin = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [loading, setLoading] = useState(false);
  const [adminInfo, setAdminInfo] = useState({
    adminCount: 0,
    maxAdmins: 2,
    canCreateMore: false,
    admins: []
  });
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchAdminInfo();
    }
  }, [admin, token, navigate]);

  const fetchAdminInfo = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/auth/admin/info`, {
        headers: { token }
      });
      
      if (response.data.success) {
        setAdminInfo(response.data);
      } else {
        toast.error(response.data.message || "Failed to fetch admin information");
      }
    } catch (error) {
      console.error("Error fetching admin info:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/");
      } else {
        toast.error("Failed to fetch admin information");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return false;
    }
    
    if (!formData.email.trim()) {
      toast.error("Email is required");
      return false;
    }
    
    if (!formData.password) {
      toast.error("Password is required");
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return false;
    }
    
    // Password strength validation
    const password = formData.password;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return false;
    }
    
    if (!/[a-z]/.test(password)) {
      toast.error("Password must contain at least one lowercase letter");
      return false;
    }
    
    if (!/[A-Z]/.test(password)) {
      toast.error("Password must contain at least one uppercase letter");
      return false;
    }
    
    if (!/[0-9]/.test(password)) {
      toast.error("Password must contain at least one number");
      return false;
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      toast.error("Password must contain at least one special character");
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    if (!adminInfo.canCreateMore) {
      toast.error("Maximum limit of 2 admins reached");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${url}/api/auth/admin/create`, {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password
      }, {
        headers: { token }
      });
      
      if (response.data.success) {
        toast.success(response.data.message);
        setFormData({
          name: "",
          email: "",
          password: "",
          confirmPassword: ""
        });
        // Refresh admin info
        await fetchAdminInfo();
      } else {
        toast.error(response.data.message || "Failed to create admin");
      }
    } catch (error) {
      console.error("Error creating admin:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to create admin account");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading && adminInfo.admins.length === 0) {
    return <LoadingSpinner size="large" message="Loading admin information..." />;
  }

  return (
    <div className="create-admin">
      <div className="create-admin-header">
        <h2>Admin Management</h2>
        <p>Manage administrator accounts (Maximum: {adminInfo.maxAdmins})</p>
      </div>

      {/* Admin Statistics */}
      <div className="admin-stats">
        <div className="stat-card">
          <h3>{adminInfo.adminCount}</h3>
          <p>Current Admins</p>
        </div>
        <div className="stat-card">
          <h3>{adminInfo.maxAdmins - adminInfo.adminCount}</h3>
          <p>Available Slots</p>
        </div>
        <div className={`stat-card ${adminInfo.canCreateMore ? 'success' : 'warning'}`}>
          <h3>{adminInfo.canCreateMore ? 'Yes' : 'No'}</h3>
          <p>Can Create More</p>
        </div>
      </div>

      {/* Current Admins List */}
      <div className="current-admins">
        <h3>Current Administrators</h3>
        <div className="admins-table">
          <div className="table-header">
            <span>Name</span>
            <span>Email</span>
            <span>Created</span>
            <span>Last Login</span>
            <span>Status</span>
          </div>
          {adminInfo.admins.map((adminUser) => (
            <div key={adminUser.id} className={`table-row ${adminUser.isCurrentUser ? 'current-user' : ''}`}>
              <span className="admin-name">
                {adminUser.name}
                {adminUser.isCurrentUser && <span className="current-badge">You</span>}
              </span>
              <span>{adminUser.email}</span>
              <span>{formatDate(adminUser.createdAt)}</span>
              <span>{formatDate(adminUser.lastLoginAt)}</span>
              <span className={`status ${adminUser.isBlocked ? 'blocked' : 'active'}`}>
                {adminUser.isBlocked ? 'Blocked' : 'Active'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Create New Admin Form */}
      {adminInfo.canCreateMore ? (
        <div className="create-admin-form">
          <h3>Create New Administrator</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter full name"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter email address"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="password-requirements">
                <p>Password must contain:</p>
                <ul>
                  <li>At least 8 characters</li>
                  <li>One uppercase letter</li>
                  <li>One lowercase letter</li>
                  <li>One number</li>
                  <li>One special character</li>
                </ul>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <div className="password-input">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className={`create-btn ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="small" inline />
                    Creating Admin...
                  </>
                ) : (
                  'Create Administrator'
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="limit-reached">
          <div className="limit-message">
            <h3>Admin Limit Reached</h3>
            <p>The maximum limit of {adminInfo.maxAdmins} administrators has been reached.</p>
            <p>To create a new admin account, you would need to remove an existing admin first.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateAdmin;