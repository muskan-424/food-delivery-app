import React, { useContext, useEffect, useState } from "react";
import "./Offers.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";
import { assets } from "../../assets/assets";

const Offers = ({ url }) => {
  const { token, admin } = useContext(StoreContext);
  const navigate = useNavigate();

  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    offerType: "payment_method_discount",
    discountType: "percentage",
    discountValue: 0,
    maxDiscount: null,
    minOrderAmount: 0,
    paymentMethod: "all",
    freeDeliveryThreshold: null,
    freeDeliveryEnabled: false,
    validFrom: "",
    validUntil: "",
    usageLimit: null,
    userUsageLimit: 1,
    priority: 0,
    isActive: true,
    bannerText: "",
    terms: "",
  });

  useEffect(() => {
    if (!token || !admin) {
      navigate("/");
    } else {
      fetchOffers();
    }
  }, [token, admin]);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${url}/api/offer/admin/all`, {
        headers: { token },
      });

      if (response.data.success) {
        setOffers(response.data.data || []);
      } else {
        toast.error(response.data.message || "Failed to fetch offers");
      }
    } catch (error) {
      console.error("Error fetching offers:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/");
      } else {
        toast.error("Error fetching offers");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : type === "number" ? (value === "" ? null : parseFloat(value)) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        ...formData,
        validFrom: new Date(formData.validFrom),
        validUntil: new Date(formData.validUntil),
      };

      if (editingOffer) {
        const response = await axios.put(
          `${url}/api/offer/admin/${editingOffer._id}`,
          submitData,
          { headers: { token } }
        );

        if (response.data.success) {
          toast.success("Offer updated successfully");
          setShowForm(false);
          setEditingOffer(null);
          resetForm();
          fetchOffers();
        } else {
          toast.error(response.data.message || "Failed to update offer");
        }
      } else {
        const response = await axios.post(
          `${url}/api/offer/admin/create`,
          submitData,
          { headers: { token } }
        );

        if (response.data.success) {
          toast.success("Offer created successfully");
          setShowForm(false);
          resetForm();
          fetchOffers();
        } else {
          toast.error(response.data.message || "Failed to create offer");
        }
      }
    } catch (error) {
      console.error("Error saving offer:", error);
      toast.error(error.response?.data?.message || "Error saving offer");
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      offerType: "payment_method_discount",
      discountType: "percentage",
      discountValue: 0,
      maxDiscount: null,
      minOrderAmount: 0,
      paymentMethod: "all",
      freeDeliveryThreshold: null,
      freeDeliveryEnabled: false,
      validFrom: "",
      validUntil: "",
      usageLimit: null,
      userUsageLimit: 1,
      priority: 0,
      isActive: true,
      bannerText: "",
      terms: "",
    });
  };

  const handleEdit = (offer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title || "",
      description: offer.description || "",
      offerType: offer.offerType || "payment_method_discount",
      discountType: offer.discountType || "percentage",
      discountValue: offer.discountValue || 0,
      maxDiscount: offer.maxDiscount || null,
      minOrderAmount: offer.minOrderAmount || 0,
      paymentMethod: offer.paymentMethod || "all",
      freeDeliveryThreshold: offer.freeDeliveryThreshold || null,
      freeDeliveryEnabled: offer.freeDeliveryEnabled || false,
      validFrom: offer.validFrom ? new Date(offer.validFrom).toISOString().slice(0, 16) : "",
      validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString().slice(0, 16) : "",
      usageLimit: offer.usageLimit || null,
      userUsageLimit: offer.userUsageLimit || 1,
      priority: offer.priority || 0,
      isActive: offer.isActive !== undefined ? offer.isActive : true,
      bannerText: offer.bannerText || "",
      terms: offer.terms || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (offerId) => {
    if (!window.confirm("Are you sure you want to delete this offer?")) {
      return;
    }

    try {
      const response = await axios.delete(
        `${url}/api/offer/admin/${offerId}`,
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success("Offer deleted successfully");
        fetchOffers();
      } else {
        toast.error(response.data.message || "Failed to delete offer");
      }
    } catch (error) {
      console.error("Error deleting offer:", error);
      toast.error("Error deleting offer");
    }
  };

  const handleToggleStatus = async (offerId) => {
    try {
      const response = await axios.put(
        `${url}/api/offer/admin/${offerId}/toggle`,
        {},
        { headers: { token } }
      );

      if (response.data.success) {
        toast.success(`Offer ${response.data.data.isActive ? "activated" : "deactivated"}`);
        fetchOffers();
      } else {
        toast.error(response.data.message || "Failed to toggle offer status");
      }
    } catch (error) {
      console.error("Error toggling offer status:", error);
      toast.error("Error toggling offer status");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOfferTypeLabel = (type) => {
    const labels = {
      payment_method_discount: "Payment Discount",
      free_delivery: "Free Delivery",
      first_order: "First Order",
      referral: "Referral",
      bulk_order: "Bulk Order",
      festival: "Festival",
      loyalty: "Loyalty",
      other: "Other",
    };
    return labels[type] || type;
  };

  if (loading && offers.length === 0) {
    return (
      <div className="offers-page">
        <div className="offers-loading">Loading offers...</div>
      </div>
    );
  }

  return (
    <div className="offers-page">
      <div className="offers-header">
        <h2>Offers & Discounts Management</h2>
        <button className="add-offer-btn" onClick={() => {
          setEditingOffer(null);
          resetForm();
          setShowForm(true);
        }}>
          + Add New Offer
        </button>
      </div>

      {showForm && (
        <div className="offer-form-modal">
          <div className="offer-form-content">
            <div className="form-header">
              <h3>{editingOffer ? "Edit Offer" : "Create New Offer"}</h3>
              <button className="close-btn" onClick={() => {
                setShowForm(false);
                setEditingOffer(null);
                resetForm();
              }}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Offer Type *</label>
                  <select
                    name="offerType"
                    value={formData.offerType}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="payment_method_discount">Payment Method Discount</option>
                    <option value="free_delivery">Free Delivery</option>
                    <option value="first_order">First Order</option>
                    <option value="referral">Referral</option>
                    <option value="bulk_order">Bulk Order</option>
                    <option value="festival">Festival</option>
                    <option value="loyalty">Loyalty</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>

              {formData.offerType === "free_delivery" ? (
                <>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        name="freeDeliveryEnabled"
                        checked={formData.freeDeliveryEnabled}
                        onChange={handleInputChange}
                      />
                      Enable Free Delivery
                    </label>
                  </div>
                  {formData.freeDeliveryEnabled && (
                    <div className="form-group">
                      <label>Free Delivery Threshold (₹) *</label>
                      <input
                        type="number"
                        name="freeDeliveryThreshold"
                        value={formData.freeDeliveryThreshold || ""}
                        onChange={handleInputChange}
                        min="0"
                        step="0.01"
                        required={formData.freeDeliveryEnabled}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Discount Type *</label>
                      <select
                        name="discountType"
                        value={formData.discountType}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed Amount</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Discount Value *</label>
                      <input
                        type="number"
                        name="discountValue"
                        value={formData.discountValue}
                        onChange={handleInputChange}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>

                  {formData.discountType === "percentage" && (
                    <div className="form-group">
                      <label>Max Discount (₹)</label>
                      <input
                        type="number"
                        name="maxDiscount"
                        value={formData.maxDiscount || ""}
                        onChange={handleInputChange}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  )}

                  {formData.offerType === "payment_method_discount" && (
                    <div className="form-group">
                      <label>Payment Method *</label>
                      <select
                        name="paymentMethod"
                        value={formData.paymentMethod}
                        onChange={handleInputChange}
                        required
                      >
                        <option value="all">All Methods</option>
                        <option value="upi">UPI</option>
                        <option value="netbanking">Net Banking</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="debit_card">Debit Card</option>
                        <option value="wallet">Wallet</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Minimum Order Amount (₹)</label>
                    <input
                      type="number"
                      name="minOrderAmount"
                      value={formData.minOrderAmount}
                      onChange={handleInputChange}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Valid From *</label>
                  <input
                    type="datetime-local"
                    name="validFrom"
                    value={formData.validFrom}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Valid Until *</label>
                  <input
                    type="datetime-local"
                    name="validUntil"
                    value={formData.validUntil}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Usage Limit (Total)</label>
                  <input
                    type="number"
                    name="usageLimit"
                    value={formData.usageLimit || ""}
                    onChange={handleInputChange}
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label>User Usage Limit</label>
                  <input
                    type="number"
                    name="userUsageLimit"
                    value={formData.userUsageLimit}
                    onChange={handleInputChange}
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <input
                    type="number"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Banner Text</label>
                <input
                  type="text"
                  name="bannerText"
                  value={formData.bannerText}
                  onChange={handleInputChange}
                  placeholder="e.g., '50% OFF on UPI'"
                />
              </div>

              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea
                  name="terms"
                  value={formData.terms}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Terms and conditions for this offer..."
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  Active
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={() => {
                  setShowForm(false);
                  setEditingOffer(null);
                  resetForm();
                }}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingOffer ? "Update Offer" : "Create Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="offers-list">
        {offers.length === 0 ? (
          <div className="no-offers">
            <p>No offers found. Create your first offer!</p>
          </div>
        ) : (
          <table className="offers-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Discount</th>
                <th>Min Order</th>
                <th>Valid Period</th>
                <th>Usage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer._id}>
                  <td>
                    <strong>{offer.title}</strong>
                    {offer.bannerText && (
                      <div className="banner-text">{offer.bannerText}</div>
                    )}
                  </td>
                  <td>{getOfferTypeLabel(offer.offerType)}</td>
                  <td>
                    {offer.offerType === "free_delivery" ? (
                      <span>Free Delivery</span>
                    ) : (
                      <>
                        {offer.discountType === "percentage"
                          ? `${offer.discountValue}%`
                          : formatCurrency(offer.discountValue)}
                        {offer.maxDiscount && offer.discountType === "percentage" && (
                          <div className="max-discount">
                            (Max: {formatCurrency(offer.maxDiscount)})
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {offer.offerType === "free_delivery"
                      ? offer.freeDeliveryThreshold
                        ? formatCurrency(offer.freeDeliveryThreshold)
                        : "N/A"
                      : formatCurrency(offer.minOrderAmount)}
                  </td>
                  <td>
                    <div>{formatDate(offer.validFrom)}</div>
                    <div>to {formatDate(offer.validUntil)}</div>
                  </td>
                  <td>
                    {offer.usageCount || 0}
                    {offer.usageLimit && ` / ${offer.usageLimit}`}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${offer.isActive ? "active" : "inactive"}`}
                    >
                      {offer.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(offer)}
                      >
                        Edit
                      </button>
                      <button
                        className="toggle-btn"
                        onClick={() => handleToggleStatus(offer._id)}
                      >
                        {offer.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(offer._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Offers;

