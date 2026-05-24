import mongoose from 'mongoose';
import dotenv from 'dotenv';
import foodModel from './models/foodModel.js';
dotenv.config();

mongoose.connect(process.env.MONGO_URL).then(async () => {
    const foods = [
        {
            name: "Classic Cheeseburger",
            description: "A delicious classic cheeseburger with fresh ingredients.",
            price: 10,
            image: "1722865444288food_1.png",
            category: "Burgers"
        },
        {
            name: "Margherita Pizza",
            description: "Freshly baked pizza with tomatoes, mozzarella, and basil.",
            price: 15,
            image: "1722865514626food_2.png",
            category: "Pizza"
        },
        {
            name: "Caesar Salad",
            description: "Crisp romaine lettuce with parmesan, croutons, and Caesar dressing.",
            price: 8,
            image: "1722865628915food_3.png",
            category: "Salad"
        }
    ];

    try {
        await foodModel.insertMany(foods);
        console.log('Food items seeded successfully');
    } catch(err) {
        console.error('Error seeding foods:', err);
    }
    
    process.exit(0);
});
