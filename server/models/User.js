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
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        favorites : [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "StudyLocation",
            },
        ],
        lastLocation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudyLocation",
            default: null,
        },
        lastLocTime: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Users", UserSchema);