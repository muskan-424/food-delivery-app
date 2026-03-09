import React, { useState, useEffect, useContext } from "react";
import "./UserManagement.css";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";

const UserManagement = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningReason, setWarningReason] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    isBlocked: "all",
    warnings: "all",
    role: "all"
  });
  const [userActivities, setUserActivities] = useState([]);
  const [activityFilters, setActivityFilters] = useState({
    activityType: "all",
    isSuspicious: "all",
    startDate: "",
    endDate: ""
  });

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchUsers();
      fetchStats();
    }
  }, [filters]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append("search", filters.search);
      if (filters.isBlocked !== "all") params.append("isBlocked", filters.isBlocked);
      if (filters.warnings !== "all") params.append("warnings", filters.warnings);
      if (filters.role !== "all") params.append("role", filters.role);

      const response = await axios.get(`${url}/api/admin/users/users?${params.toString()}`, {
        headers: { token }
      });
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${url}/api/admin/users/dashboard/stats`, {
        headers: { token }
      });
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const openUserModal = async (user) => {
    try {
      const response = await axios.get(`${url}/api/admin/users/user/${user._id}`, {
        headers: { token }
      });
      if (response.data.success) {
        setSelectedUser(response.data.data);
        setUserActivities(response.data.data.activities || []);
        setShowUserModal(true);
      }
    } catch (error) {
      toast.error("Failed to load user details");
    }
  };

  const handleBlockUser = async () => {
    if (!selectedUser || !blockReason.trim()) {
      toast.error("Please provide a reason for blocking");
      return;
    }
    try {
      const response = await axios.post(
        `${url}/api/admin/users/user/${selectedUser.user._id}/block`,
        { reason: blockReason },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("User blocked successfully");
        setShowUserModal(false);
        setBlockReason("");
        await fetchUsers();
        await fetchStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to block user");
    }
  };

  const handleUnblockUser = async () => {
    if (!selectedUser) return;
    try {
      const response = await axios.post(
        `${url}/api/admin/users/user/${selectedUser.user._id}/unblock`,
        {},
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("User unblocked successfully");
        setSelectedUser(response.data.data);
        await fetchUsers();
        await fetchStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to unblock user");
    }
  };

  const handleGiveWarning = async () => {
    if (!selectedUser || !warningReason.trim()) {
      toast.error("Please provide a reason for the warning");
      return;
    }
    try {
      const response = await axios.post(
        `${url}/api/admin/users/user/${selectedUser.user._id}/warning`,
        { reason: warningReason },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success(response.data.message);
        setShowWarningModal(false);
        setWarningReason("");
        await openUserModal({ _id: selectedUser.user._id });
        await fetchUsers();
        await fetchStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to give warning");
    }
  };

  const handleRemoveWarning = async () => {
    if (!selectedUser) return;
    try {
      const response = await axios.post(
        `${url}/api/admin/users/user/${selectedUser.user._id}/remove-warning`,
        {},
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Warning removed successfully");
        await openUserModal({ _id: selectedUser.user._id });
        await fetchUsers();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove warning");
    }
  };

  const fetchUserActivities = async () => {
    if (!selectedUser) return;
    try {
      const params = new URLSearchParams();
      params.append("userId", selectedUser.user._id);
      if (activityFilters.activityType !== "all") params.append("activityType", activityFilters.activityType);
      if (activityFilters.isSuspicious !== "all") params.append("isSuspicious", activityFilters.isSuspicious);
      if (activityFilters.startDate) params.append("startDate", activityFilters.startDate);
      if (activityFilters.endDate) params.append("endDate", activityFilters.endDate);

      const response = await axios.get(`${url}/api/admin/users/activities?${params.toString()}`, {
        headers: { token }
      });
      if (response.data.success) {
        setUserActivities(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  };

  useEffect(() => {
    if (selectedUser && showUserModal) {
      fetchUserActivities();
    }
  }, [activityFilters, selectedUser, showUserModal]);

  const getWarningColor = (warnings) => {
    if (warnings >= 3) return "#e74c3c";
    if (warnings === 2) return "#e67e22";
    if (warnings === 1) return "#f39c12";
    return "#27ae60";
  };

  return (
    <div className="user-management">
      <div className="um-header">
        <h2>User Management & Activity Monitoring</h2>
        <button onClick={fetchStats} className="refresh-btn">Refresh</button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="um-stats">
          <div className="stat-card">
            <h3>{stats.users.total}</h3>
            <p>Total Users</p>
          </div>
          <div className="stat-card active">
            <h3>{stats.users.active}</h3>
            <p>Active Users</p>
          </div>
          <div className="stat-card danger">
            <h3>{stats.users.blocked}</h3>
            <p>Blocked Users</p>
          </div>
          <div className="stat-card warning">
            <h3>{stats.users.withWarnings}</h3>
            <p>Users with Warnings</p>
          </div>
          <div className="stat-card">
            <h3>{stats.activities.total}</h3>
            <p>Total Activities</p>
          </div>
          <div className="stat-card danger">
            <h3>{stats.activities.suspicious}</h3>
            <p>Suspicious Activities</p>
          </div>
          <div className="stat-card">
            <h3>{stats.activities.recent24h}</h3>
            <p>Activities (24h)</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="um-filters">
        <input
          type="text"
          placeholder="Search users..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="search-input"
        />
        <select
          value={filters.isBlocked}
          onChange={(e) => setFilters({ ...filters, isBlocked: e.target.value })}
        >
          <option value="all">All Users</option>
          <option value="true">Blocked</option>
          <option value="false">Active</option>
        </select>
        <select
          value={filters.warnings}
          onChange={(e) => setFilters({ ...filters, warnings: e.target.value })}
        >
          <option value="all">All Warnings</option>
          <option value="0">No Warnings</option>
          <option value="1">1 Warning</option>
          <option value="2">2 Warnings</option>
          <option value="3">3 Warnings</option>
        </select>
        <select
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
        >
          <option value="all">All Roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Users List */}
      <div className="users-list">
        {users.length === 0 ? (
          <div className="no-users">No users found</div>
        ) : (
          users.map(user => (
            <div
              key={user._id}
              className={`user-card ${user.isBlocked ? 'blocked' : ''}`}
              onClick={() => openUserModal(user)}
            >
              <div className="user-header">
                <div className="user-info">
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                </div>
                <div className="user-badges">
                  {user.isBlocked && (
                    <span className="badge blocked-badge">BLOCKED</span>
                  )}
                  {user.warnings > 0 && (
                    <span
                      className="badge warning-badge"
                      style={{ backgroundColor: getWarningColor(user.warnings) }}
                    >
                      {user.warnings}/3 Warnings
                    </span>
                  )}
                  <span className="badge role-badge">{user.role}</span>
                </div>
              </div>
              <div className="user-stats">
                <span>Activities: {user.activityCount || 0}</span>
                {user.suspiciousActivityCount > 0 && (
                  <span className="suspicious">Suspicious: {user.suspiciousActivityCount}</span>
                )}
                {user.lastActivity && (
                  <span>Last: {new Date(user.lastActivity.date).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* User Detail Modal */}
      {showUserModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedUser.user.name} - User Details</h3>
              <button onClick={() => setShowUserModal(false)}>×</button>
            </div>

            <div className="modal-body">
              {/* User Info */}
              <div className="user-details">
                <div className="detail-row">
                  <label>Email:</label>
                  <span>{selectedUser.user.email}</span>
                </div>
                <div className="detail-row">
                  <label>Role:</label>
                  <span>{selectedUser.user.role}</span>
                </div>
                <div className="detail-row">
                  <label>Status:</label>
                  <span className={selectedUser.user.isBlocked ? "blocked" : "active"}>
                    {selectedUser.user.isBlocked ? "BLOCKED" : "ACTIVE"}
                  </span>
                </div>
                <div className="detail-row">
                  <label>Warnings:</label>
                  <span style={{ color: getWarningColor(selectedUser.user.warnings) }}>
                    {selectedUser.user.warnings}/3
                  </span>
                </div>
                {selectedUser.user.isBlocked && (
                  <div className="detail-row">
                    <label>Block Reason:</label>
                    <span>{selectedUser.user.blockReason}</span>
                  </div>
                )}
                {selectedUser.statistics && (
                  <div className="user-statistics">
                    <h4>Activity Statistics</h4>
                    <p>Total Activities: {selectedUser.statistics.totalActivities}</p>
                    <p>Suspicious: {selectedUser.statistics.suspiciousActivities}</p>
                    <p>Unauthenticated: {selectedUser.statistics.unauthenticatedActivities}</p>
                  </div>
                )}
              </div>

              {/* Warning History */}
              {selectedUser.user.warningHistory && selectedUser.user.warningHistory.length > 0 && (
                <div className="warning-history">
                  <h4>Warning History</h4>
                  {selectedUser.user.warningHistory.map((warning, idx) => (
                    <div key={idx} className="warning-item">
                      <strong>Warning {warning.warningNumber}/3:</strong> {warning.reason}
                      <small>{new Date(warning.givenAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="user-actions">
                {!selectedUser.user.isBlocked ? (
                  <>
                    {selectedUser.user.warnings < 3 && (
                      <button
                        onClick={() => setShowWarningModal(true)}
                        className="btn-warning"
                      >
                        Give Warning ({selectedUser.user.warnings}/3)
                      </button>
                    )}
                    <button
                      onClick={handleBlockUser}
                      className="btn-danger"
                      onMouseEnter={() => {
                        if (!blockReason) {
                          setBlockReason("Blocked by admin");
                        }
                      }}
                    >
                      Block User
                    </button>
                  </>
                ) : (
                  <button onClick={handleUnblockUser} className="btn-success">
                    Unblock User
                  </button>
                )}
                {selectedUser.user.warnings > 0 && (
                  <button onClick={handleRemoveWarning} className="btn-secondary">
                    Remove Warning
                  </button>
                )}
              </div>

              {/* Block Reason Input */}
              {!selectedUser.user.isBlocked && (
                <div className="block-reason-input">
                  <label>Block Reason:</label>
                  <textarea
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Enter reason for blocking..."
                    rows="2"
                  />
                </div>
              )}

              {/* Activity Filters */}
              <div className="activity-filters">
                <h4>Activity History</h4>
                <div className="filter-row">
                  <select
                    value={activityFilters.activityType}
                    onChange={(e) => setActivityFilters({ ...activityFilters, activityType: e.target.value })}
                  >
                    <option value="all">All Types</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="place_order">Place Order</option>
                    <option value="add_to_cart">Add to Cart</option>
                    <option value="update_profile">Update Profile</option>
                    <option value="other">Other</option>
                  </select>
                  <select
                    value={activityFilters.isSuspicious}
                    onChange={(e) => setActivityFilters({ ...activityFilters, isSuspicious: e.target.value })}
                  >
                    <option value="all">All Activities</option>
                    <option value="true">Suspicious Only</option>
                    <option value="false">Normal Only</option>
                  </select>
                  <input
                    type="date"
                    value={activityFilters.startDate}
                    onChange={(e) => setActivityFilters({ ...activityFilters, startDate: e.target.value })}
                    placeholder="Start Date"
                  />
                  <input
                    type="date"
                    value={activityFilters.endDate}
                    onChange={(e) => setActivityFilters({ ...activityFilters, endDate: e.target.value })}
                    placeholder="End Date"
                  />
                </div>
              </div>

              {/* Activities List */}
              <div className="activities-list">
                {userActivities.length === 0 ? (
                  <p>No activities found</p>
                ) : (
                  userActivities.map((activity, idx) => (
                    <div
                      key={idx}
                      className={`activity-item ${activity.isSuspicious ? 'suspicious' : ''}`}
                    >
                      <div className="activity-header">
                        <span className="activity-type">{activity.activityType}</span>
                        <span className="activity-time">
                          {new Date(activity.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="activity-description">{activity.activityDescription}</div>
                      {activity.isSuspicious && (
                        <div className="suspicious-reason">
                          ⚠️ {activity.suspiciousReason}
                        </div>
                      )}
                      {!activity.isAuthenticated && (
                        <div className="unauthenticated-badge">Unauthenticated</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="modal-overlay" onClick={() => setShowWarningModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Give Warning</h3>
              <button onClick={() => setShowWarningModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Warning Reason *</label>
                <textarea
                  value={warningReason}
                  onChange={(e) => setWarningReason(e.target.value)}
                  placeholder="Enter reason for warning..."
                  rows="4"
                />
                <small>
                  Current warnings: {selectedUser?.user?.warnings || 0}/3. 
                  User will be auto-blocked after 3 warnings.
                </small>
              </div>
              <div className="form-actions">
                <button onClick={handleGiveWarning} className="btn-warning">
                  Give Warning
                </button>
                <button onClick={() => setShowWarningModal(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

