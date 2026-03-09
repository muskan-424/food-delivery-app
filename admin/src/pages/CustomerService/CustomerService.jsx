import React, { useState, useEffect, useContext } from "react";
import "./CustomerService.css";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";

const CustomerService = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [tickets, setTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    category: "all",
    priority: "all",
    assignedTo: "all",
    search: ""
  });
  const [newMessage, setNewMessage] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPriority, setTicketPriority] = useState("");
  const [internalNote, setInternalNote] = useState("");

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchTickets();
      fetchAgents();
      fetchStats();
    }
  }, [filters]);

  const fetchTickets = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.category !== "all") params.append("category", filters.category);
      if (filters.priority !== "all") params.append("priority", filters.priority);
      if (filters.assignedTo !== "all") params.append("assignedTo", filters.assignedTo);
      if (filters.search) params.append("search", filters.search);

      const response = await axios.get(`${url}/api/support/all?${params.toString()}`, {
        headers: { token }
      });
      if (response.data.success) {
        setTickets(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Failed to fetch tickets");
    }
  };

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
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${url}/api/support/dashboard/stats`, {
        headers: { token }
      });
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const openTicketModal = async (ticket) => {
    try {
      const response = await axios.get(`${url}/api/support/ticket/${ticket._id}`, {
        headers: { token }
      });
      if (response.data.success) {
        setSelectedTicket(response.data.data);
        setTicketStatus(response.data.data.status);
        setTicketPriority(response.data.data.priority);
        setAssignAgentId(response.data.data.assignedTo?._id || "");
        setShowTicketModal(true);
      }
    } catch (error) {
      toast.error("Failed to load ticket details");
    }
  };

  const handleAssignTicket = async () => {
    if (!selectedTicket) return;
    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/assign`,
        { agentId: assignAgentId || null },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Ticket assigned successfully");
        await fetchTickets();
        await fetchStats();
        if (showTicketModal) {
          setSelectedTicket(response.data.data);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to assign ticket");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/message`,
        { message: newMessage },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Message sent");
        setNewMessage("");
        setSelectedTicket(response.data.data);
        await fetchTickets();
      }
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;
    try {
      const response = await axios.put(
        `${url}/api/support/ticket/${selectedTicket._id}/status`,
        { status: ticketStatus, priority: ticketPriority },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Ticket updated");
        setSelectedTicket(response.data.data);
        await fetchTickets();
        await fetchStats();
      }
    } catch (error) {
      toast.error("Failed to update ticket");
    }
  };

  const handleEscalate = async () => {
    if (!selectedTicket) return;
    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/escalate`,
        { agentId: assignAgentId || null, reason: "Escalated by admin" },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Ticket escalated");
        setSelectedTicket(response.data.data);
        await fetchTickets();
      }
    } catch (error) {
      toast.error("Failed to escalate ticket");
    }
  };

  const handleAddNote = async () => {
    if (!internalNote.trim() || !selectedTicket) return;
    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/note`,
        { note: internalNote },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Note added");
        setInternalNote("");
        setSelectedTicket(response.data.data);
      }
    } catch (error) {
      toast.error("Failed to add note");
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      open: "#ff6b6b",
      assigned: "#4ecdc4",
      in_progress: "#45b7d1",
      waiting_customer: "#f9ca24",
      resolved: "#6c5ce7",
      closed: "#95a5a6",
      escalated: "#e74c3c"
    };
    return colors[status] || "#95a5a6";
  };

  const getPriorityColor = (priority) => {
    const colors = {
      urgent: "#e74c3c",
      high: "#e67e22",
      medium: "#f39c12",
      low: "#95a5a6"
    };
    return colors[priority] || "#95a5a6";
  };

  return (
    <div className="customer-service">
      <div className="cs-header">
        <h2>Customer Service Management</h2>
        <button onClick={fetchStats} className="refresh-btn">Refresh</button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="cs-stats">
          <div className="stat-card">
            <h3>{stats.tickets.total}</h3>
            <p>Total Tickets</p>
          </div>
          <div className="stat-card urgent">
            <h3>{stats.tickets.open}</h3>
            <p>Open</p>
          </div>
          <div className="stat-card">
            <h3>{stats.tickets.inProgress}</h3>
            <p>In Progress</p>
          </div>
          <div className="stat-card">
            <h3>{stats.tickets.resolved}</h3>
            <p>Resolved</p>
          </div>
          <div className="stat-card warning">
            <h3>{stats.tickets.escalated}</h3>
            <p>Escalated</p>
          </div>
          <div className="stat-card danger">
            <h3>{stats.tickets.slaBreached}</h3>
            <p>SLA Breached</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="cs-filters">
        <input
          type="text"
          placeholder="Search tickets..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="search-input"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting_customer">Waiting Customer</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="escalated">Escalated</option>
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
        >
          <option value="all">All Categories</option>
          <option value="order">Order</option>
          <option value="payment">Payment</option>
          <option value="delivery">Delivery</option>
          <option value="refund">Refund</option>
          <option value="account">Account</option>
          <option value="technical">Technical</option>
          <option value="other">Other</option>
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.assignedTo}
          onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })}
        >
          <option value="all">All Agents</option>
          {agents.map(agent => (
            <option key={agent._id} value={agent._id}>{agent.agentName}</option>
          ))}
        </select>
      </div>

      {/* Tickets List */}
      <div className="tickets-list">
        {tickets.length === 0 ? (
          <div className="no-tickets">No tickets found</div>
        ) : (
          tickets.map(ticket => (
            <div
              key={ticket._id}
              className={`ticket-card ${ticket.slaBreached ? 'sla-breached' : ''}`}
              onClick={() => openTicketModal(ticket)}
            >
              <div className="ticket-header">
                <span className="ticket-number">{ticket.ticketNumber}</span>
                <span
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(ticket.status) }}
                >
                  {ticket.status.replace('_', ' ')}
                </span>
                <span
                  className="priority-badge"
                  style={{ backgroundColor: getPriorityColor(ticket.priority) }}
                >
                  {ticket.priority}
                </span>
              </div>
              <div className="ticket-body">
                <h4>{ticket.subject}</h4>
                <p className="ticket-meta">
                  <span>{ticket.userName}</span>
                  <span>{ticket.category}</span>
                  {ticket.assignedTo && (
                    <span>Assigned to: {ticket.assignedTo.agentName}</span>
                  )}
                </p>
                <p className="ticket-time">
                  Created: {new Date(ticket.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ticket Detail Modal */}
      {showTicketModal && selectedTicket && (
        <div className="modal-overlay" onClick={() => setShowTicketModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedTicket.ticketNumber} - {selectedTicket.subject}</h3>
              <button onClick={() => setShowTicketModal(false)}>×</button>
            </div>

            <div className="modal-body">
              {/* Ticket Info */}
              <div className="ticket-info">
                <div className="info-row">
                  <label>Status:</label>
                  <select value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_customer">Waiting Customer</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                    <option value="escalated">Escalated</option>
                  </select>
                </div>
                <div className="info-row">
                  <label>Priority:</label>
                  <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="info-row">
                  <label>Assign to Agent:</label>
                  <select value={assignAgentId} onChange={(e) => setAssignAgentId(e.target.value)}>
                    <option value="">Unassign</option>
                    {agents.map(agent => (
                      <option key={agent._id} value={agent._id}>
                        {agent.agentName} ({agent.currentTickets}/{agent.maxTickets})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="button-group">
                  <button onClick={handleUpdateStatus} className="btn-primary">Update Status</button>
                  <button onClick={handleAssignTicket} className="btn-primary">Assign</button>
                  <button onClick={handleEscalate} className="btn-danger">Escalate</button>
                </div>
              </div>

              {/* Conversation */}
              <div className="conversation">
                <h4>Conversation</h4>
                <div className="messages">
                  {selectedTicket.messages?.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.senderType}`}>
                      <div className="message-header">
                        <strong>{msg.senderName}</strong>
                        <span>{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="message-body">{msg.message}</div>
                    </div>
                  ))}
                </div>
                <div className="message-input">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    rows="3"
                  />
                  <button onClick={handleSendMessage} className="btn-primary">Send</button>
                </div>
              </div>

              {/* Internal Notes */}
              <div className="internal-notes">
                <h4>Internal Notes</h4>
                {selectedTicket.internalNotes?.map((note, idx) => (
                  <div key={idx} className="note">
                    <p>{note.note}</p>
                    <small>{new Date(note.addedAt).toLocaleString()}</small>
                  </div>
                ))}
                <div className="note-input">
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Add internal note..."
                    rows="2"
                  />
                  <button onClick={handleAddNote} className="btn-secondary">Add Note</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerService;

