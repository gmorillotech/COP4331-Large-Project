const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        UserId: { 
            type: Number, 
            required: true, 
            unique: true 
        },
        firstName: {
            type: String,
            required: true,
            trim:true,
        },
        lastName: {
            type: String,
            required: true,
            trim:true,
        },
        login: {
            type: String,
            required: true,
            unique:true,
            trim:true,
        },
        password: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Users", UserSchema);