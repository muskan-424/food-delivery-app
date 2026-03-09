import React, { useState, useContext, useEffect } from 'react'
import './Home.css'
import Header from '../../components/Header/Header'
import ExploreMenu from '../../components/ExploreMenu/ExploreMenu'
import FoodDisplay from '../../components/FoodDisplay/FoodDisplay'
import AdvancedFilters from '../../components/AdvancedFilters/AdvancedFilters'
import { StoreContext } from '../../context/StoreContext'

const Home = () => {
  const [category,setCategory]=useState("All");
  const { setFilters } = useContext(StoreContext);

  // Update filters when category changes
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      category: category
    }));
  }, [category, setFilters]);

  return (
    <div>
      <Header/>
      <ExploreMenu category={category} setCategory={setCategory} />
      <AdvancedFilters />
      <FoodDisplay category={category}/>
    </div>
  )
}

export default Home
