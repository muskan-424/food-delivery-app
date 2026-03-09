import React, { useState, useContext, useEffect } from "react";
import "./AddressManager.css";
import { StoreContext } from "../../context/StoreContext";
import axios from "axios";
import { toast } from "react-toastify";

const AddressManager = ({ onSelectAddress, selectedAddressId, onClose }) => {
  const { url, token } = useContext(StoreContext);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [formData, setFormData] = useState({
    type: 'home',
    name: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    country: '',
    landmark: '',
    isDefault: false
  });

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(url + "/api/address", {
        headers: { token }
      });
      if (response.data.success) {
        setAddresses(response.data.data || []);
      }
    } catch (error) {
      console.error("Error loading addresses:", error);
      toast.error("Error loading addresses");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      // Ensure email is properly trimmed
      const submitData = {
        ...formData,
        email: (formData.email && formData.email.trim()) || ''
      };

      if (editingAddress) {
        // Update existing address
        await axios.put(
          url + `/api/address/${editingAddress.addressId}`,
          submitData,
          { headers: { token } }
        );
        toast.success("Address updated successfully");
      } else {
        // Add new address
        await axios.post(
          url + "/api/address",
          submitData,
          { headers: { token } }
        );
        toast.success("Address added successfully");
      }
      
      await loadAddresses();
      setShowAddForm(false);
      setEditingAddress(null);
      resetForm();
    } catch (error) {
      console.error("Error saving address:", error);
      toast.error(error.response?.data?.message || "Error saving address");
    }
  };

  const handleDelete = async (addressId) => {
    const addressToDelete = addresses.find(addr => addr.addressId === addressId);
    if (!addressToDelete) return;

    // Check if this is the default address
    const isDefault = addressToDelete.isDefault;
    const isOnlyAddress = addresses.length === 1;

    // Prevent deleting the only address
    if (isOnlyAddress) {
      toast.error("Cannot delete the only saved address. Please add another address first.");
      return;
    }

    // Confirmation message
    const confirmMessage = isDefault 
      ? "This is your default address. Deleting it will remove it from your saved addresses. Are you sure you want to delete this address?"
      : "Are you sure you want to delete this address? This action cannot be undone.";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await axios.delete(
        url + `/api/address/${addressId}`,
        { headers: { token } }
      );
      toast.success("Address deleted successfully");
      await loadAddresses();
      if (selectedAddressId === addressId) {
        onSelectAddress(null);
      }
    } catch (error) {
      console.error("Error deleting address:", error);
      toast.error(error.response?.data?.message || "Error deleting address");
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    setFormData({
      type: address.type || 'home',
      name: address.name || '',
      email: address.email || '',
      phone: address.phone || '',
      addressLine1: address.addressLine1 || '',
      addressLine2: address.addressLine2 || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || '',
      country: address.country || '',
      landmark: address.landmark || '',
      isDefault: address.isDefault || false
    });
    setShowAddForm(true);
  };

  const handleSetDefault = async (addressId) => {
    try {
      await axios.put(
        url + `/api/address/${addressId}/default`,
        {},
        { headers: { token } }
      );
      toast.success("Default address updated");
      await loadAddresses();
    } catch (error) {
      console.error("Error setting default address:", error);
      toast.error("Error setting default address");
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'home',
      name: '',
      email: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      pincode: '',
      country: '',
      landmark: '',
      isDefault: false
    });
    setEditingAddress(null);
  };

  if (loading) {
    return (
      <div className="address-manager">
        <p>Loading addresses...</p>
      </div>
    );
  }

  return (
    <div className="address-manager">
      <div className="address-manager-header">
        <h3>Manage Addresses</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {!showAddForm ? (
        <>
          <div className="addresses-list">
            {addresses.length === 0 ? (
              <div className="no-addresses">
                <p>No saved addresses. Add your first address below.</p>
              </div>
            ) : (
              addresses.map((address) => (
                <div 
                  key={address.addressId} 
                  className={`address-card ${selectedAddressId === address.addressId ? 'selected' : ''}`}
                >
                  <div className="address-card-header">
                    <div>
                      <h4>{address.name}</h4>
                      <span className="address-type">{address.type}</span>
                      {address.isDefault && <span className="default-badge">Default</span>}
                    </div>
                    <div className="address-actions">
                      <button 
                        className="select-btn"
                        onClick={() => {
                          onSelectAddress(address.addressId);
                          onClose();
                        }}
                      >
                        {selectedAddressId === address.addressId ? '✓ Selected' : 'Select'}
                      </button>
                    </div>
                  </div>
                  <div className="address-details">
                    <p><strong>Email:</strong> {address.email || 'Not provided'}</p>
                    <p><strong>Phone:</strong> {address.phone}</p>
                    <p><strong>Address:</strong> {address.addressLine1}</p>
                    {address.addressLine2 && <p>{address.addressLine2}</p>}
                    <p>{address.city}, {address.state} {address.pincode}</p>
                    {address.country && <p><strong>Country:</strong> {address.country}</p>}
                    {address.landmark && <p><strong>Landmark:</strong> {address.landmark}</p>}
                  </div>
                  <div className="address-card-footer">
                    <button onClick={() => handleEdit(address)} className="edit-btn">✏️ Edit</button>
                    {!address.isDefault && (
                      <button onClick={() => handleSetDefault(address.addressId)} className="set-default-btn">
                        ⭐ Set as Default
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(address.addressId)} 
                      className="delete-btn"
                      disabled={addresses.length === 1}
                      title={addresses.length === 1 ? "Cannot delete the only address" : "Delete this address"}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <button className="add-address-btn" onClick={() => setShowAddForm(true)}>
            + Add New Address
          </button>
        </>
      ) : (
        <form className="address-form" onSubmit={handleSubmit}>
          <h4>{editingAddress ? 'Edit Address' : 'Add New Address'}</h4>
          
          <div className="form-group">
            <label>Address Type *</label>
            <select name="type" value={formData.type} onChange={handleInputChange} required>
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label>Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="john@example.com"
            />
          </div>

          <div className="form-group">
            <label>Phone *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="+1234567890"
              required
            />
          </div>

          <div className="form-group">
            <label>Address Line 1 *</label>
            <input
              type="text"
              name="addressLine1"
              value={formData.addressLine1}
              onChange={handleInputChange}
              placeholder="Street address"
              required
            />
          </div>

          <div className="form-group">
            <label>Address Line 2</label>
            <input
              type="text"
              name="addressLine2"
              value={formData.addressLine2}
              onChange={handleInputChange}
              placeholder="Apartment, suite, etc."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City *</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="City"
                required
              />
            </div>
            <div className="form-group">
              <label>State *</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                placeholder="State"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Pincode/Zip Code *</label>
              <input
                type="text"
                name="pincode"
                value={formData.pincode}
                onChange={handleInputChange}
                placeholder="12345"
                required
              />
            </div>
            <div className="form-group">
              <label>Country</label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                placeholder="Country"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Landmark</label>
            <input
              type="text"
              name="landmark"
              value={formData.landmark}
              onChange={handleInputChange}
              placeholder="Nearby landmark"
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                name="isDefault"
                checked={formData.isDefault}
                onChange={handleInputChange}
              />
              Set as default address
            </label>
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => {
              setShowAddForm(false);
              resetForm();
            }} className="cancel-btn">
              Cancel
            </button>
            <button type="submit" className="submit-btn">
              {editingAddress ? 'Update Address' : 'Save Address'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AddressManager;

