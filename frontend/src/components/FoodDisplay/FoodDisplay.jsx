import React, { useContext } from "react";
import "./FoodDisplay.css";
import { StoreContext } from "../../context/StoreContext";
import FoodItem from "../FoodItem/FoodItem";

const FoodDisplay = ({ category }) => {
  const { food_list, searchQuery } = useContext(StoreContext);
  
  return (
    <div className="food-display" id="food-display">
      <h2>
        {searchQuery 
          ? `Search results for "${searchQuery}"` 
          : "Top dishes near you"}
      </h2>
      {food_list.length === 0 ? (
        <div className="food-display-empty">
          <p>No food items found. Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="food-display-list">
          {food_list.map((item, index) => (
            <FoodItem
              key={index}
              id={item._id}
              name={item.name}
              description={item.description}
              price={item.price}
              image={item.image}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FoodDisplay;
