const mongoose = require("mongoose")
const Schema = mongoose.Schema;

const notificationsSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, required: true },
    sent_by_user_id: { type: Schema.Types.ObjectId, required: true },
    msg: { type: String, required: true },
    post_id: { type: Schema.Types.ObjectId },
    isView: { type: String, default: false },
    // type: { type: String, default: "connections" },
}, { timestamps: true });

const usernotificationsDetailSchema = mongoose.model("notifications", notificationsSchema);
module.exports = usernotificationsDetailSchema;
