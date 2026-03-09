import React from 'react'
import './Sidebar.css'
import { assets } from '../../assets/assets'
import { NavLink } from 'react-router-dom'

const Sidebar = () => {
  return (
    <div className='sidebar'>
      <div className="sidebar-options">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
          end
        >
          <img src={assets.order_icon} alt="" />
          <p>Dashboard</p>
        </NavLink>
        <NavLink
          to="/add"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.add_icon} alt="" />
          <p>Add Items</p>
        </NavLink>
        <NavLink
          to="/list"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>List Items</p>
        </NavLink>
        <NavLink
          to="/orders"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Orders</p>
        </NavLink>
        <NavLink
          to="/reviews"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Reviews</p>
        </NavLink>
        <NavLink
          to="/payments"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Payments</p>
        </NavLink>
        <NavLink
          to="/offers"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Offers</p>
        </NavLink>
        <NavLink
          to="/customer-service"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Customer Service</p>
        </NavLink>
        <NavLink
          to="/support-agents"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>Support Agents</p>
        </NavLink>
        <NavLink
          to="/user-management"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.order_icon} alt="" />
          <p>User Management</p>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.profile_image} alt="" />
          <p>Profile</p>
        </NavLink>
        <NavLink
          to="/create-admin"
          className={({ isActive }) =>
            `sidebar-option ${isActive ? "active" : ""}`
          }
        >
          <img src={assets.add_icon} alt="" />
          <p>Create Admin</p>
        </NavLink>
      </div>
    </div>
  )
}

export default Sidebar
