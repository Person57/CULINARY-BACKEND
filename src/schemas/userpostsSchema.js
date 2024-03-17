const mongoose = require("mongoose")
const Schema = mongoose.Schema;

const userPostsSchema = new Schema({
    postedBy: { type: Schema.Types.ObjectId },
    dishName: { type: String },
    descr: { type: String },
    price: { type: Number },
    time: { type: Number },
    attachments:
        [{
            img_url: { type: String }
        }],
    rating_data:
        [{
            number: { type: Number },
            user_id: { type: Schema.Types.ObjectId, ref: "users" }
        }],
    likes: [{ type: Schema.Types.ObjectId, ref: "users" }],
    postType: { type: String, default: "posts" },//community, posts
    aboutfood: [{ type: String }],
}, { timestamps: true });

const userPosts = mongoose.model("users_posts", userPostsSchema);
module.exports = userPosts;
