import React, { useState, useEffect, useContext } from "react";
import "./Support.css";
import axios from "axios";
import { toast } from "react-toastify";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";

const Support = () => {
  const navigate = useNavigate();
  const { token, url } = useContext(StoreContext);
  const [tickets, setTickets] = useState([]);
  const [faq, setFaq] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [editFormData, setEditFormData] = useState({
    subject: "",
    category: "other",
    priority: "medium"
  });
  const [formData, setFormData] = useState({
    subject: "",
    message: "",
    category: "other",
    orderId: "",
    priority: "medium"
  });
  const [formErrors, setFormErrors] = useState({
    subject: "",
    message: "",
    orderId: ""
  });
  const [editFormErrors, setEditFormErrors] = useState({
    subject: ""
  });
  const [messageError, setMessageError] = useState("");

  useEffect(() => {
    if (!token) {
      toast.error("Please login to access support");
      navigate("/");
    } else {
      fetchTickets();
      fetchFAQ();
    }
  }, [token]);

  const fetchTickets = async () => {
    try {
      const response = await axios.get(`${url}/api/support/tickets`, {
        headers: { token }
      });
      if (response.data.success) {
        setTickets(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
    }
  };

  const fetchFAQ = async () => {
    try {
      const response = await axios.get(`${url}/api/support/faq`);
      if (response.data.success) {
        setFaq(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching FAQ:", error);
    }
  };

  // Validation functions
  const validateSubject = (subject) => {
    if (!subject || !subject.trim()) {
      return "Subject is required";
    }
    if (subject.trim().length < 5) {
      return "Subject must be at least 5 characters long";
    }
    if (subject.trim().length > 200) {
      return "Subject must not exceed 200 characters";
    }
    return "";
  };

  const validateMessage = (message) => {
    if (!message || !message.trim()) {
      return "Message is required";
    }
    if (message.trim().length < 10) {
      return "Message must be at least 10 characters long";
    }
    if (message.trim().length > 5000) {
      return "Message must not exceed 5000 characters";
    }
    return "";
  };

  const validateOrderId = (orderId) => {
    if (orderId && orderId.trim()) {
      // Check if it's a valid MongoDB ObjectId format (24 hex characters)
      const objectIdPattern = /^[0-9a-fA-F]{24}$/;
      if (!objectIdPattern.test(orderId.trim())) {
        return "Please enter a valid order ID";
      }
    }
    return "";
  };

  const validateNewMessage = (message) => {
    if (!message || !message.trim()) {
      return "Message cannot be empty";
    }
    if (message.trim().length < 3) {
      return "Message must be at least 3 characters long";
    }
    if (message.trim().length > 2000) {
      return "Message must not exceed 2000 characters";
    }
    return "";
  };

  const handleCreateTicket = async () => {
    // Reset errors
    const errors = {
      subject: validateSubject(formData.subject),
      message: validateMessage(formData.message),
      orderId: validateOrderId(formData.orderId)
    };
    
    setFormErrors(errors);

    // Check if there are any errors
    if (errors.subject || errors.message || errors.orderId) {
      const firstError = Object.values(errors).find(err => err);
      if (firstError) {
        toast.error(firstError);
      }
      return;
    }

    try {
      const response = await axios.post(
        `${url}/api/support/ticket`,
        {
          ...formData,
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          orderId: formData.orderId.trim() || undefined
        },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Support ticket created successfully");
        setShowCreateModal(false);
        setFormData({ subject: "", message: "", category: "other", orderId: "", priority: "medium" });
        setFormErrors({ subject: "", message: "", orderId: "" });
        await fetchTickets();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create ticket");
    }
  };

  const openTicketModal = async (ticket) => {
    try {
      const response = await axios.get(`${url}/api/support/ticket/${ticket._id}`, {
        headers: { token }
      });
      if (response.data.success) {
        setSelectedTicket(response.data.data);
        setShowTicketModal(true);
      }
    } catch (error) {
      toast.error("Failed to load ticket details");
    }
  };

  const handleSendMessage = async () => {
    if (!selectedTicket) return;
    
    const error = validateNewMessage(newMessage);
    setMessageError(error);
    
    if (error) {
      toast.error(error);
      return;
    }

    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/message`,
        { message: newMessage.trim() },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Message sent");
        setNewMessage("");
        setMessageError("");
        setSelectedTicket(response.data.data);
        await fetchTickets();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
    }
  };

  const handleUpdateTicket = async () => {
    if (!selectedTicket) return;
    
    const errors = {
      subject: validateSubject(editFormData.subject)
    };
    
    setEditFormErrors(errors);
    
    if (errors.subject) {
      toast.error(errors.subject);
      return;
    }

    try {
      const response = await axios.put(
        `${url}/api/support/ticket/${selectedTicket._id}`,
        {
          ...editFormData,
          subject: editFormData.subject.trim()
        },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Ticket updated successfully");
        setShowEditModal(false);
        setEditFormErrors({ subject: "" });
        await openTicketModal({ _id: selectedTicket._id });
        await fetchTickets();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update ticket");
    }
  };

  const handleDeleteTicket = async () => {
    if (!selectedTicket) return;
    if (!window.confirm("Are you sure you want to delete this ticket? This action cannot be undone.")) {
      return;
    }
    try {
      const response = await axios.delete(
        `${url}/api/support/ticket/${selectedTicket._id}`,
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Ticket deleted successfully");
        setShowTicketModal(false);
        setSelectedTicket(null);
        await fetchTickets();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete ticket");
    }
  };

  const openEditModal = (ticket) => {
    setSelectedTicket(ticket);
    setEditFormData({
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority
    });
    setShowEditModal(true);
  };

  const handleRateTicket = async (rating, feedback = "") => {
    if (!selectedTicket) return;
    try {
      const response = await axios.post(
        `${url}/api/support/ticket/${selectedTicket._id}/rate`,
        { rating, feedback },
        { headers: { token } }
      );
      if (response.data.success) {
        toast.success("Thank you for your feedback!");
        setSelectedTicket(response.data.data);
        await fetchTickets();
      }
    } catch (error) {
      toast.error("Failed to submit rating");
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      open: "#ff6b6b",
      assigned: "#4ecdc4",
      in_progress: "#45b7d1",
      waiting_customer: "#f9ca24",
      resolved: "#6c5ce7",
      closed: "#95a5a6"
    };
    return colors[status] || "#95a5a6";
  };

  return (
    <div className="support-page">
      <div className="support-header">
        <h1>Customer Support</h1>
        <button onClick={() => setShowCreateModal(true)} className="btn-create-ticket">
          Create New Ticket
        </button>
      </div>

      <div className="support-content">
        {/* FAQ Section */}
        <div className="faq-section">
          <h2>Frequently Asked Questions</h2>
          <div className="faq-list">
            {faq.map((item, idx) => (
              <div key={idx} className="faq-item">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* My Tickets Section */}
        <div className="tickets-section">
          <h2>My Support Tickets</h2>
          {tickets.length === 0 ? (
            <div className="no-tickets">
              <p>You don't have any support tickets yet.</p>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                Create Your First Ticket
              </button>
            </div>
          ) : (
            <div className="tickets-list">
              {tickets.map(ticket => (
                <div
                  key={ticket._id}
                  className="ticket-card"
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
                  </div>
                  <h3>{ticket.subject}</h3>
                  <p className="ticket-meta">
                    <span>Category: {ticket.category}</span>
                    {ticket.assignedTo && (
                      <span>Assigned to: {ticket.assignedTo.agentName}</span>
                    )}
                  </p>
                  <p className="ticket-time">
                    Created: {new Date(ticket.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Support Ticket</h2>
              <button onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Subject *</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => {
                    setFormData({ ...formData, subject: e.target.value });
                    setFormErrors({ ...formErrors, subject: validateSubject(e.target.value) });
                  }}
                  onBlur={(e) => setFormErrors({ ...formErrors, subject: validateSubject(e.target.value) })}
                  placeholder="Brief description of your issue (5-200 characters)"
                  required
                  minLength={5}
                  maxLength={200}
                  className={formErrors.subject ? "error-input" : ""}
                />
                {formErrors.subject && <span className="error-message">{formErrors.subject}</span>}
                <span className="char-count">{formData.subject.length}/200</span>
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="order">Order</option>
                  <option value="payment">Payment</option>
                  <option value="delivery">Delivery</option>
                  <option value="refund">Refund</option>
                  <option value="account">Account</option>
                  <option value="technical">Technical</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="form-group">
                <label>Order ID (Optional)</label>
                <input
                  type="text"
                  value={formData.orderId}
                  onChange={(e) => {
                    setFormData({ ...formData, orderId: e.target.value });
                    setFormErrors({ ...formErrors, orderId: validateOrderId(e.target.value) });
                  }}
                  onBlur={(e) => setFormErrors({ ...formErrors, orderId: validateOrderId(e.target.value) })}
                  placeholder="Enter order ID if related to an order"
                  className={formErrors.orderId ? "error-input" : ""}
                />
                {formErrors.orderId && <span className="error-message">{formErrors.orderId}</span>}
              </div>
              <div className="form-group">
                <label>Message *</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => {
                    setFormData({ ...formData, message: e.target.value });
                    setFormErrors({ ...formErrors, message: validateMessage(e.target.value) });
                  }}
                  onBlur={(e) => setFormErrors({ ...formErrors, message: validateMessage(e.target.value) })}
                  placeholder="Describe your issue in detail... (10-5000 characters)"
                  rows="6"
                  required
                  minLength={10}
                  maxLength={5000}
                  className={formErrors.message ? "error-input" : ""}
                />
                {formErrors.message && <span className="error-message">{formErrors.message}</span>}
                <span className="char-count">{formData.message.length}/5000</span>
              </div>
              <div className="form-actions">
                <button onClick={handleCreateTicket} className="btn-primary">
                  Submit Ticket
                </button>
                <button onClick={() => {
                  setShowCreateModal(false);
                  setFormErrors({ subject: "", message: "", orderId: "" });
                }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {showTicketModal && selectedTicket && (
        <div className="modal-overlay" onClick={() => setShowTicketModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedTicket.ticketNumber} - {selectedTicket.subject}</h2>
              <button onClick={() => setShowTicketModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="ticket-info">
                <div className="ticket-actions-header">
                  <div>
                    <p><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status) }}>
                      {selectedTicket.status.replace('_', ' ')}
                    </span></p>
                    <p><strong>Category:</strong> {selectedTicket.category}</p>
                    {selectedTicket.assignedTo && (
                      <p><strong>Assigned to:</strong> {selectedTicket.assignedTo.agentName}</p>
                    )}
                  </div>
                  {(selectedTicket.status === 'open' || selectedTicket.status === 'assigned') && (
                    <div className="ticket-action-buttons">
                      <button onClick={() => openEditModal(selectedTicket)} className="btn-edit">
                        Edit
                      </button>
                      <button onClick={handleDeleteTicket} className="btn-delete">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="conversation">
                <h3>Conversation</h3>
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
                {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                  <div className="message-input">
                    <textarea
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        setMessageError(validateNewMessage(e.target.value));
                      }}
                      onBlur={(e) => setMessageError(validateNewMessage(e.target.value))}
                      placeholder="Type your message... (3-2000 characters)"
                      rows="3"
                      minLength={3}
                      maxLength={2000}
                      className={messageError ? "error-input" : ""}
                    />
                    {messageError && <span className="error-message">{messageError}</span>}
                    <div className="message-input-footer">
                      <span className="char-count">{newMessage.length}/2000</span>
                      <button 
                        onClick={handleSendMessage} 
                        className="btn-primary"
                        disabled={!!messageError || !newMessage.trim()}
                        style={{ padding: "8px 20px", fontSize: "14px" }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && !selectedTicket.customerRating && (
                <div className="rating-section">
                  <h3>Rate Your Experience</h3>
                  <div className="rating-buttons">
                    {[1, 2, 3, 4, 5].map(rating => (
                      <button
                        key={rating}
                        onClick={() => handleRateTicket(rating)}
                        className="rating-btn"
                      >
                        ⭐ {rating}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTicket.customerRating && (
                <div className="rating-display">
                  <p>You rated this ticket: {selectedTicket.customerRating} ⭐</p>
                  {selectedTicket.customerFeedback && (
                    <p>Feedback: {selectedTicket.customerFeedback}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal */}
      {showEditModal && selectedTicket && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Support Ticket</h2>
              <button onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Subject *</label>
                <input
                  type="text"
                  value={editFormData.subject}
                  onChange={(e) => {
                    setEditFormData({ ...editFormData, subject: e.target.value });
                    setEditFormErrors({ ...editFormErrors, subject: validateSubject(e.target.value) });
                  }}
                  onBlur={(e) => setEditFormErrors({ ...editFormErrors, subject: validateSubject(e.target.value) })}
                  placeholder="Brief description of your issue (5-200 characters)"
                  required
                  minLength={5}
                  maxLength={200}
                  className={editFormErrors.subject ? "error-input" : ""}
                />
                {editFormErrors.subject && <span className="error-message">{editFormErrors.subject}</span>}
                <span className="char-count">{editFormData.subject.length}/200</span>
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={editFormData.category}
                  onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                >
                  <option value="order">Order</option>
                  <option value="payment">Payment</option>
                  <option value="delivery">Delivery</option>
                  <option value="refund">Refund</option>
                  <option value="account">Account</option>
                  <option value="technical">Technical</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select
                  value={editFormData.priority}
                  onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="form-actions">
                <button 
                  onClick={handleUpdateTicket} 
                  className="btn-primary"
                  disabled={!!editFormErrors.subject}
                >
                  Update Ticket
                </button>
                <button onClick={() => {
                  setShowEditModal(false);
                  setEditFormErrors({ subject: "" });
                }} className="btn-secondary">
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

export default Support;

