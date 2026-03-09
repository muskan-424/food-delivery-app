import React, { useState, useEffect, useContext } from "react";
import "./SupportAgents.css";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";

const SupportAgents = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [formData, setFormData] = useState({
    userId: "",
    agentName: "",
    email: "",
    phone: "",
    department: "general",
    maxTickets: 10,
    skills: [],
    workingHours: { start: "09:00", end: "18:00" }
  });

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchAgents();
      fetchUsers();
    }
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await axios.get(`${url}/api/support/agents`, {
        headers: { token }
      });
      if (response.data.success) {
        setAgents(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      toast.error("Failed to fetch agents");
    }
  };

  const fetchUsers = async () => {
    try {
      // Fetch all users to select from when creating agent
      const response = await axios.get(`${url}/api/user/list`, {
        headers: { token }
      });
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleCreateAgent = async () => {
    try {
      const response = await axios.post(
        `${url}/api/support/agent`,
        formData,
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Agent created successfully");
        setShowModal(false);
        resetForm();
        await fetchAgents();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create agent");
    }
  };

  const handleUpdateAgent = async () => {
    if (!selectedAgent) return;
    try {
      const response = await axios.put(
        `${url}/api/support/agent/${selectedAgent._id}`,
        formData,
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Agent updated successfully");
        setShowModal(false);
        setSelectedAgent(null);
        resetForm();
        await fetchAgents();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update agent");
    }
  };

  const handleDeleteAgent = async (agentId) => {
    if (!window.confirm("Are you sure you want to delete this agent?")) return;
    try {
      const response = await axios.delete(
        `${url}/api/support/agent/${agentId}`,
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Agent deleted successfully");
        await fetchAgents();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete agent");
    }
  };

  const openEditModal = (agent) => {
    setSelectedAgent(agent);
    setFormData({
      userId: agent.userId._id || agent.userId,
      agentName: agent.agentName,
      email: agent.email,
      phone: agent.phone || "",
      department: agent.department,
      maxTickets: agent.maxTickets,
      skills: agent.skills || [],
      workingHours: agent.workingHours || { start: "09:00", end: "18:00" }
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      userId: "",
      agentName: "",
      email: "",
      phone: "",
      department: "general",
      maxTickets: 10,
      skills: [],
      workingHours: { start: "09:00", end: "18:00" }
    });
    setSelectedAgent(null);
  };

  const getStatusColor = (status) => {
    const colors = {
      active: "#27ae60",
      inactive: "#95a5a6",
      busy: "#e67e22",
      away: "#f39c12"
    };
    return colors[status] || "#95a5a6";
  };

  return (
    <div className="support-agents">
      <div className="agents-header">
        <h2>Support Agents Management</h2>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary"
        >
          + Add Agent
        </button>
      </div>

      <div className="agents-grid">
        {agents.map(agent => (
          <div key={agent._id} className="agent-card">
            <div className="agent-header">
              <h3>{agent.agentName}</h3>
              <span
                className="status-badge"
                style={{ backgroundColor: getStatusColor(agent.status) }}
              >
                {agent.status}
              </span>
            </div>
            <div className="agent-info">
              <p><strong>Email:</strong> {agent.email}</p>
              <p><strong>Department:</strong> {agent.department}</p>
              <p><strong>Current Tickets:</strong> {agent.currentTickets}/{agent.maxTickets}</p>
              <p><strong>Total Handled:</strong> {agent.totalTicketsHandled}</p>
              <p><strong>Resolved:</strong> {agent.totalResolved}</p>
              <p><strong>Rating:</strong> {agent.rating.toFixed(1)}/5.0 ({agent.totalRatings} ratings)</p>
              <p><strong>Avg Response:</strong> {Math.round(agent.averageResponseTime)} min</p>
              <p><strong>Available:</strong> {agent.isAvailable ? "Yes" : "No"}</p>
            </div>
            <div className="agent-actions">
              <button
                onClick={() => openEditModal(agent)}
                className="btn-edit"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteAgent(agent._id)}
                className="btn-delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="no-agents">No agents found. Create your first agent!</div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedAgent ? "Edit Agent" : "Create New Agent"}</h3>
              <button onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>User:</label>
                <select
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  disabled={!!selectedAgent}
                >
                  <option value="">Select User</option>
                  {users.map(user => (
                    <option key={user._id} value={user._id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Agent Name:</label>
                <input
                  type="text"
                  value={formData.agentName}
                  onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                  placeholder="Agent Name"
                />
              </div>
              <div className="form-group">
                <label>Email:</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email"
                />
              </div>
              <div className="form-group">
                <label>Phone:</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone"
                />
              </div>
              <div className="form-group">
                <label>Department:</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                >
                  <option value="general">General</option>
                  <option value="orders">Orders</option>
                  <option value="payments">Payments</option>
                  <option value="delivery">Delivery</option>
                  <option value="technical">Technical</option>
                  <option value="refunds">Refunds</option>
                </select>
              </div>
              <div className="form-group">
                <label>Max Tickets:</label>
                <input
                  type="number"
                  value={formData.maxTickets}
                  onChange={(e) => setFormData({ ...formData, maxTickets: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Working Hours:</label>
                <div className="time-inputs">
                  <input
                    type="time"
                    value={formData.workingHours.start}
                    onChange={(e) => setFormData({
                      ...formData,
                      workingHours: { ...formData.workingHours, start: e.target.value }
                    })}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={formData.workingHours.end}
                    onChange={(e) => setFormData({
                      ...formData,
                      workingHours: { ...formData.workingHours, end: e.target.value }
                    })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button
                  onClick={selectedAgent ? handleUpdateAgent : handleCreateAgent}
                  className="btn-primary"
                >
                  {selectedAgent ? "Update" : "Create"}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
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

export default SupportAgents;

