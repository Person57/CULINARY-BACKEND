const mongoose = require("mongoose")
const Schema = mongoose.Schema;

const cartSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, required: true },
    orderedFromUserId: { type: Schema.Types.ObjectId, required: true },
    communityName: { type: String, required: true },
    communityImg: { type: String, required: true },
    placeOrder: { type: String, default: "No" },
    orders:
        [
            {
                item_img: { type: String },
                item_name: { type: String },
                quantity: { type: Number },
                price: { type: Number },
            }
        ],
}, { timestamps: true });

const usercartDetailSchema = mongoose.model("user_cart", cartSchema);
module.exports = usercartDetailSchema;

