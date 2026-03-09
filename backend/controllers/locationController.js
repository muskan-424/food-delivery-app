// Location services controller
// Note: For production, integrate with Google Maps API, Mapbox, or similar services

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return distance;
};

// Get coordinates from address (Geocoding)
// In production, use Google Maps Geocoding API
const geocodeAddress = async (address) => {
  try {
    // Placeholder - in production, call Google Maps API
    // const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`);
    // const data = await response.json();
    // return { lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng };
    
    console.log('Geocoding address:', address);
    return { lat: null, lng: null }; // Placeholder
  } catch (error) {
    console.error('Error geocoding address:', error);
    return { lat: null, lng: null };
  }
};

// Validate address
const validateAddress = async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, message: "Address is required" });
    }

    // In production, use address validation service
    const coordinates = await geocodeAddress(address);

    res.status(200).json({
      success: true,
      data: {
        address,
        coordinates,
        isValid: coordinates.lat !== null
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error validating address" });
  }
};

// Calculate delivery fee based on distance
const calculateDeliveryFee = async (req, res) => {
  try {
    const { restaurantLocation, deliveryLocation } = req.body;

    if (!restaurantLocation || !deliveryLocation) {
      return res.status(400).json({ 
        success: false, 
        message: "Restaurant and delivery locations are required" 
      });
    }

    const distance = calculateDistance(
      restaurantLocation.lat,
      restaurantLocation.lng,
      deliveryLocation.lat,
      deliveryLocation.lng
    );

    // Calculate fee based on distance (example: $2 base + $0.5 per km)
    let deliveryFee = 2; // Base fee
    if (distance > 2) {
      deliveryFee += (distance - 2) * 0.5;
    }
    deliveryFee = Math.round(deliveryFee * 100) / 100; // Round to 2 decimals

    // Estimate delivery time (example: 30 min base + 5 min per km)
    let estimatedMinutes = 30;
    if (distance > 2) {
      estimatedMinutes += (distance - 2) * 5;
    }

    res.status(200).json({
      success: true,
      data: {
        distance: Math.round(distance * 10) / 10, // Round to 1 decimal
        deliveryFee,
        estimatedMinutes: Math.round(estimatedMinutes)
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error calculating delivery fee" });
  }
};

// Get nearby restaurants (based on coordinates)
const getNearbyRestaurants = async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // radius in km

    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude are required" 
      });
    }

    // In production, use MongoDB geospatial queries
    // For now, return all restaurants (filtering should be done in production)
    const { default: restaurantModel } = await import('../models/restaurantModel.js');
    const restaurants = await restaurantModel.find({ isActive: true });

    // Calculate distance for each restaurant
    const restaurantsWithDistance = restaurants.map(restaurant => {
      if (restaurant.address.coordinates.lat && restaurant.address.coordinates.lng) {
        const distance = calculateDistance(
          parseFloat(lat),
          parseFloat(lng),
          restaurant.address.coordinates.lat,
          restaurant.address.coordinates.lng
        );
        return {
          ...restaurant.toObject(),
          distance: Math.round(distance * 10) / 10
        };
      }
      return restaurant.toObject();
    }).filter(r => r.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    res.status(200).json({
      success: true,
      data: restaurantsWithDistance
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Error fetching nearby restaurants" });
  }
};

export { validateAddress, calculateDeliveryFee, getNearbyRestaurants, calculateDistance, geocodeAddress };

