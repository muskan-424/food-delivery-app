import userModel from "../models/userModel.js";
import crypto from "crypto";

// Get all addresses
const getAddresses = async (req, res) => {
  try {
    const user = await userModel.findById(req.body.userId).select('addresses');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Addresses are automatically decrypted by model hooks
    res.status(200).json({ success: true, data: user.addresses || [] });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching addresses" });
  }
};

// Add new address
const addAddress = async (req, res) => {
  try {
    const {
      type,
      name,
      email,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      landmark,
      isDefault,
      coordinates
    } = req.body;

    // Validation
    if (!name || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, phone, address line 1, city, state, and pincode are required" 
      });
    }

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const addressId = crypto.randomUUID();
    const newAddress = {
      addressId,
      type: type || 'home',
      name: name.trim(),
      email: (email && email.trim()) || '',
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || '',
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country?.trim() || '',
      landmark: landmark?.trim() || '',
      isDefault: isDefault === true,
      coordinates: coordinates || {}
    };

    // If this is set as default, unset other defaults
    if (newAddress.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({ 
      success: true, 
      message: "Address added successfully",
      data: newAddress
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error adding address" });
  }
};

// Update address
const updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const updateData = req.body;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.addressId === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    // Update address fields
    Object.keys(updateData).forEach(key => {
      if (key !== 'addressId' && key !== '_id') {
        if (updateData[key] !== undefined) {
          // Special handling for email to ensure it's properly saved
          if (key === 'email') {
            user.addresses[addressIndex][key] = (updateData[key] && updateData[key].trim()) || '';
          } else {
            user.addresses[addressIndex][key] = typeof updateData[key] === 'string' 
              ? updateData[key].trim() 
              : updateData[key];
          }
        }
      }
    });

    // If setting as default, unset other defaults
    if (updateData.isDefault === true) {
      user.addresses.forEach((addr, index) => {
        if (index !== addressIndex) {
          addr.isDefault = false;
        }
      });
    }

    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Address updated successfully",
      data: user.addresses[addressIndex]
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating address" });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.addressId === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    user.addresses.splice(addressIndex, 1);
    await user.save();

    res.status(200).json({ success: true, message: "Address deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting address" });
  }
};

// Set default address
const setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const user = await userModel.findById(req.body.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const addressIndex = user.addresses.findIndex(addr => addr.addressId === addressId);
    if (addressIndex === -1) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    // Unset all defaults
    user.addresses.forEach(addr => {
      addr.isDefault = false;
    });

    // Set this as default
    user.addresses[addressIndex].isDefault = true;
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: "Default address updated successfully",
      data: user.addresses[addressIndex]
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error setting default address" });
  }
};

export { getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress };

