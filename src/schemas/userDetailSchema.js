const mongoose = require("mongoose")
const Schema = mongoose.Schema;

const userSchema = new Schema({
    name: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    location: { type: String, required: true },
    image: { type: String },
    communityName: { type: String },
    preferences: { type: String, required: true },
    saved_posts: [{ type: Schema.Types.ObjectId }],
    connections:
        [{
            request_type: { type: String },//Follower, Ignore, Sent, Received, Following
            user_id: { type: Schema.Types.ObjectId },//user_ids
        }],
    isOnline: { type: Number }//0,1
}, { timestamps: true });

const userDetailSchema = mongoose.model("users", userSchema);
module.exports = userDetailSchema;

