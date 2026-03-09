import restaurantModel from "../models/restaurantModel.js";

// Get all restaurants
const getRestaurants = async (req, res) => {
  try {
    const { isActive, cuisine } = req.query;
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (cuisine) {
      query.cuisine = cuisine;
    }

    const restaurants = await restaurantModel.find(query).sort({ rating: -1 });
    
    res.status(200).json({ success: true, data: restaurants });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching restaurants" });
  }
};

// Get restaurant by ID
const getRestaurantById = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const restaurant = await restaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    
    res.status(200).json({ success: true, data: restaurant });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching restaurant" });
  }
};

// Create restaurant (Admin)
const createRestaurant = async (req, res) => {
  try {
    const {
      name,
      description,
      cuisine,
      image,
      deliveryTime,
      deliveryFee,
      minimumOrder,
      address,
      openingTime,
      closingTime
    } = req.body;

    if (!name || !cuisine || !address) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, cuisine, and address are required" 
      });
    }

    const restaurant = new restaurantModel({
      name,
      description: description || '',
      cuisine,
      image: image || '',
      deliveryTime: deliveryTime || '30-45 min',
      deliveryFee: deliveryFee || 0,
      minimumOrder: minimumOrder || 0,
      address: {
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        pincode: address.pincode || '',
        coordinates: address.coordinates || {}
      },
      openingTime: openingTime || '10:00 AM',
      closingTime: closingTime || '10:00 PM'
    });

    await restaurant.save();

    res.status(201).json({ 
      success: true, 
      message: "Restaurant created successfully",
      data: restaurant
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error creating restaurant" });
  }
};

// Update restaurant (Admin)
const updateRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const updateData = req.body;

    const restaurant = await restaurantModel.findByIdAndUpdate(
      restaurantId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Restaurant updated successfully",
      data: restaurant
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error updating restaurant" });
  }
};

// Delete restaurant (Admin)
const deleteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await restaurantModel.findByIdAndDelete(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    res.status(200).json({ success: true, message: "Restaurant deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error deleting restaurant" });
  }
};

export { getRestaurants, getRestaurantById, createRestaurant, updateRestaurant, deleteRestaurant };

