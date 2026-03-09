import React, { useEffect, useState } from "react";
import "./List.css";
import axios from "axios";
import { toast } from "react-toastify";
import { useContext } from "react";
import { StoreContext } from "../../context/StoreContext";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../../utils/currency";
import { assets } from "../../assets/assets";

const List = ({ url }) => {
  const navigate = useNavigate();
  const { token, admin } = useContext(StoreContext);
  const [list, setList] = useState([]);
  const [editingFood, setEditingFood] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState({
    name: "",
    description: "",
    price: "",
    category: "Salad",
    isAvailable: true
  });
  const [editImage, setEditImage] = useState(null);

  const fetchList = async () => {
    try {
      const response = await axios.get(`${url}/api/food/list`);
      if (response.data.success) {
        setList(response.data.data);
      } else {
        console.error("Error fetching food list:", response.data.message);
        toast.error(response.data.message || "Error loading food list");
      }
    } catch (error) {
      console.error("Error fetching food list:", error);
      toast.error("Failed to load food list. Please try again.");
    }
  };

  const removeFood = async (foodId) => {
    if (!window.confirm("Are you sure you want to delete this food item?")) {
      return;
    }
    
    try {
      const response = await axios.post(
        `${url}/api/food/remove`,
        { id: foodId },
        { headers: { token } }
      );
      
      if (response.data.success) {
        toast.success(response.data.message);
        await fetchList(); // Refresh list after successful deletion
      } else {
        toast.error(response.data.message || "Failed to delete food item");
      }
    } catch (error) {
      console.error("Error removing food:", error);
      if (error.response?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/");
      } else {
        toast.error(error.response?.data?.message || "Failed to delete food item");
      }
    }
  };

  const openEditModal = async (food) => {
    try {
      const response = await axios.get(`${url}/api/food/${food._id}`);
      if (response.data.success) {
        setEditingFood(response.data.data);
        setEditData({
          name: response.data.data.name || "",
          description: response.data.data.description || "",
          price: response.data.data.price || "",
          category: response.data.data.category || "Salad",
          isAvailable: response.data.data.isAvailable !== undefined ? response.data.data.isAvailable : true
        });
        setEditImage(null);
        setShowEditModal(true);
      }
    } catch (error) {
      toast.error("Failed to load food details");
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("name", editData.name);
      formData.append("description", editData.description);
      formData.append("price", Number(editData.price));
      formData.append("category", editData.category);
      formData.append("isAvailable", editData.isAvailable);
      if (editImage) {
        formData.append("image", editImage);
      }

      const response = await axios.put(
        `${url}/api/food/${editingFood._id}`,
        formData,
        {
          headers: {
            token,
            "Content-Type": "multipart/form-data"
          }
        }
      );

      if (response.data.success) {
        toast.success("Food item updated successfully");
        setShowEditModal(false);
        setEditingFood(null);
        await fetchList();
      } else {
        toast.error(response.data.message || "Failed to update food item");
      }
    } catch (error) {
      console.error("Error updating food:", error);
      toast.error(error.response?.data?.message || "Failed to update food item");
    }
  };

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    }
    fetchList();
  }, []);

  return (
    <div className="list add flex-col">
      <p>All Food List</p>
      <div className="list-table">
        <div className="list-table-format title">
          <b>Image</b>
          <b>Name</b>
          <b>Category</b>
          <b>Price</b>
          <b>Actions</b>
        </div>
        {list.map((item, index) => {
          return (
            <div key={index} className="list-table-format">
              <img src={`${url}/images/` + item.image} alt="" />
              <p>{item.name}</p>
              <p>{item.category}</p>
              <p>{formatCurrency(item.price)}</p>
              <div className="action-buttons">
                <button onClick={() => openEditModal(item)} className="edit-btn">
                  Edit
                </button>
                <button onClick={() => removeFood(item._id)} className="delete-btn">
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingFood && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Food Item</h3>
              <button onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="edit-form">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows="4"
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={editData.category}
                    onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                    required
                  >
                    <option value="Salad">Salad</option>
                    <option value="Rolls">Rolls</option>
                    <option value="Deserts">Deserts</option>
                    <option value="Sandwich">Sandwich</option>
                    <option value="Cake">Cake</option>
                    <option value="Pure Veg">Pure Veg</option>
                    <option value="Pasta">Pasta</option>
                    <option value="Noodles">Noodles</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Price *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData.price}
                    onChange={(e) => setEditData({ ...editData, price: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Available</label>
                <input
                  type="checkbox"
                  checked={editData.isAvailable}
                  onChange={(e) => setEditData({ ...editData, isAvailable: e.target.checked })}
                />
              </div>
              <div className="form-group">
                <label>Update Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditImage(e.target.files[0])}
                />
                {!editImage && editingFood.image && (
                  <img 
                    src={`${url}/images/${editingFood.image}`} 
                    alt="Current" 
                    style={{ maxWidth: "100px", marginTop: "10px" }}
                  />
                )}
                {editImage && (
                  <img 
                    src={URL.createObjectURL(editImage)} 
                    alt="Preview" 
                    style={{ maxWidth: "100px", marginTop: "10px" }}
                  />
                )}
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">Update</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default List;
