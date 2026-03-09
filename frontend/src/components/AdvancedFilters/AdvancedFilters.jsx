import React, { useState, useContext, useEffect } from "react";
import "./AdvancedFilters.css";
import { StoreContext } from "../../context/StoreContext";
import { formatCurrency } from "../../utils/currency";

const AdvancedFilters = () => {
  const { filters, setFilters, food_list } = useContext(StoreContext);
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });

  // Calculate price range from food list
  useEffect(() => {
    if (food_list.length > 0) {
      const prices = food_list.map(item => item.price || 0);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      setPriceRange({ min: Math.floor(minPrice), max: Math.ceil(maxPrice) });
    }
  }, [food_list]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handlePriceRangeChange = (type, value) => {
    const numValue = parseFloat(value) || 0;
    if (type === 'min') {
      handleFilterChange('minPrice', numValue);
    } else {
      handleFilterChange('maxPrice', numValue);
    }
  };

  const handleQuickPriceFilter = (range) => {
    switch(range) {
      case 'under10':
        handleFilterChange('minPrice', '');
        handleFilterChange('maxPrice', '10');
        break;
      case '10to20':
        handleFilterChange('minPrice', '10');
        handleFilterChange('maxPrice', '20');
        break;
      case '20to30':
        handleFilterChange('minPrice', '20');
        handleFilterChange('maxPrice', '30');
        break;
      case 'over30':
        handleFilterChange('minPrice', '30');
        handleFilterChange('maxPrice', '');
        break;
      default:
        handleFilterChange('minPrice', '');
        handleFilterChange('maxPrice', '');
    }
  };

  const handleReset = () => {
    setFilters({
      category: "All",
      minPrice: "",
      maxPrice: "",
      sortBy: "price",
      sortOrder: "asc"
    });
  };

  // Count active filters
  const activeFiltersCount = [
    filters.category !== "All",
    filters.minPrice !== "",
    filters.maxPrice !== "",
    filters.sortBy !== "price",
    filters.sortOrder !== "asc"
  ].filter(Boolean).length;

  const hasActiveFilters = activeFiltersCount > 0;

  return (
    <div className="advanced-filters">
      <div className="filter-header">
        <button 
          className={`filter-toggle-btn ${hasActiveFilters ? 'has-filters' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <span className="filter-icon-wrapper">
            <span className="filter-icon">🔍</span>
            {hasActiveFilters && <span className="filter-badge">{activeFiltersCount}</span>}
          </span>
          <span className="filter-text">
            {showFilters ? "Hide Filters" : "Show Filters"}
          </span>
          <span className="toggle-icon">{showFilters ? "▲" : "▼"}</span>
        </button>
        {hasActiveFilters && !showFilters && (
          <button className="clear-filters-btn" onClick={handleReset}>
            Clear All
          </button>
        )}
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filters-header">
            <h3>Filter & Sort</h3>
            {hasActiveFilters && (
              <span className="active-filters-count">{activeFiltersCount} active</span>
            )}
          </div>

          {/* Category Filter Section */}
          <div className="filter-section">
            <label className="section-label">
              <span className="label-icon">🏷️</span>
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="filter-select category-select"
            >
              <option value="All">All Categories</option>
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

          {/* Sort Section */}
          <div className="filter-section">
            <label className="section-label">
              <span className="label-icon">📊</span>
              Sort By
            </label>
            <div className="sort-controls">
              <div className="sort-option">
                <label>Sort Field</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="filter-select"
                >
                  <option value="price">💰 Price</option>
                  <option value="name">🔤 Name (A-Z)</option>
                  <option value="category">🏷️ Category</option>
                  <option value="rating">⭐ Rating</option>
                </select>
              </div>
              <div className="sort-option">
                <label>Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                  className="filter-select"
                >
                  <option value="asc">⬆️ Low to High</option>
                  <option value="desc">⬇️ High to Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Price Range Section */}
          <div className="filter-section">
            <label className="section-label">
              <span className="label-icon">💵</span>
              Price Range
            </label>
            
            {/* Quick Price Filters */}
            <div className="quick-price-filters">
              <button 
                className={`quick-filter-btn ${filters.maxPrice === '10' && !filters.minPrice ? 'active' : ''}`}
                onClick={() => handleQuickPriceFilter('under10')}
              >
                Under ₹10
              </button>
              <button 
                className={`quick-filter-btn ${filters.minPrice === '10' && filters.maxPrice === '20' ? 'active' : ''}`}
                onClick={() => handleQuickPriceFilter('10to20')}
              >
                ₹10 - ₹20
              </button>
              <button 
                className={`quick-filter-btn ${filters.minPrice === '20' && filters.maxPrice === '30' ? 'active' : ''}`}
                onClick={() => handleQuickPriceFilter('20to30')}
              >
                ₹20 - ₹30
              </button>
              <button 
                className={`quick-filter-btn ${filters.minPrice === '30' && !filters.maxPrice ? 'active' : ''}`}
                onClick={() => handleQuickPriceFilter('over30')}
              >
                Over ₹30
              </button>
            </div>

            {/* Custom Price Range */}
            <div className="price-range-custom">
              <div className="price-input-group">
                <label>Min Price</label>
                <div className="price-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="number"
                    placeholder={priceRange.min.toString()}
                    value={filters.minPrice}
                    onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                    className="filter-input price-input"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="price-separator">to</div>
              <div className="price-input-group">
                <label>Max Price</label>
                <div className="price-input-wrapper">
                  <span className="currency-symbol">₹</span>
                  <input
                    type="number"
                    placeholder={priceRange.max.toString()}
                    value={filters.maxPrice}
                    onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                    className="filter-input price-input"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="active-filters-display">
              <span className="active-filters-label">Active Filters:</span>
              <div className="active-filters-tags">
                {filters.category !== "All" && (
                  <span className="filter-tag">
                    Category: {filters.category}
                    <button onClick={() => handleFilterChange('category', 'All')}>×</button>
                  </span>
                )}
                {filters.minPrice && (
                  <span className="filter-tag">
                    Min: {formatCurrency(filters.minPrice)}
                    <button onClick={() => handleFilterChange('minPrice', '')}>×</button>
                  </span>
                )}
                {filters.maxPrice && (
                  <span className="filter-tag">
                    Max: {formatCurrency(filters.maxPrice)}
                    <button onClick={() => handleFilterChange('maxPrice', '')}>×</button>
                  </span>
                )}
                {filters.sortBy !== "price" && (
                  <span className="filter-tag">
                    Sort: {filters.sortBy}
                    <button onClick={() => handleFilterChange('sortBy', 'price')}>×</button>
                  </span>
                )}
                {filters.sortOrder !== "asc" && (
                  <span className="filter-tag">
                    Order: {filters.sortOrder === 'desc' ? 'High to Low' : 'Low to High'}
                    <button onClick={() => handleFilterChange('sortOrder', 'asc')}>×</button>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="filter-actions">
            <button className="reset-filters-btn" onClick={handleReset}>
              🔄 Reset All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedFilters;

