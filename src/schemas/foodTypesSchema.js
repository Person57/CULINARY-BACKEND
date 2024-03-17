const mongoose = require("mongoose")
const Schema = mongoose.Schema;

const foodTypes = new Schema({
    name: { type: String, required: true }
}, { timestamps: true });

const foodTypesSchema = mongoose.model("foodTypes", foodTypes);
module.exports = foodTypesSchema;