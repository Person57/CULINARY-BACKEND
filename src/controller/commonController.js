const express = require("express");
const User = require('../schemas/userDetailSchema');
const UserPosts = require('../schemas/userpostsSchema');
const UserNotifications = require('../schemas/notificationSchema');
const FoodTypes = require('../schemas/foodTypesSchema');
const UserCart = require('../schemas/cartSchema');
const bodyParser = require("body-parser");
const uploadImage = require('../cloudinary/cloudinary');
const multer = require('multer');
const { default: mongoose } = require("mongoose");
const bcrypt = require('bcrypt');
const upload = multer();
const router = express.Router();

router.use(bodyParser.json());

router.get("/getusers", async (req, res, next) => {
    try {
        let location = req.query.location;
        let preferences = req.query.preferences;
        let user_id = req.query.user_id;
        let name = req.query.name;

        let filter = [];
        if (location || preferences || user_id || name) {
            filter.push({ $match: { $and: [] } });

            if (location !== '' && location !== undefined) {
                filter[0]["$match"]["$and"].push({ location: location });
            };

            if (preferences !== '' && preferences !== undefined) {
                filter[0]["$match"]["$and"].push({ preferences: preferences });
            };

            if (name !== '' && name !== undefined) {
                filter[0]["$match"]["$and"].push({ name: name });
            };

            if (user_id !== '' && user_id !== undefined) {
                filter[0]["$match"]["$and"].push({ _id: new mongoose.Types.ObjectId(user_id) });
            };

        };

        const posts = await User.aggregate([
            ...filter,
            {
                $project: {
                    name: 1,
                    isOnline: 1,
                    location: 1,
                    preferences: 1
                }
            }
        ]);
        if (posts.length === 0) {
            return res.status(400).send({
                code: 400,
                message: "No Users."
            });
        };
        return res.status(200).send({
            code: 200,
            message: "Users successfully retrieved",
            data: posts
        });
    } catch (e) {
        return res.json(e.message);
    }
});

router.put("/updateUsers", async (req, res, next) => {
    try {
        const data = req.body;
        const { name, email, password, location, preferences, isOnline, saved_posts, save_type, communityName } = data;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            data.password = hashedPassword;
        };
        let filter = [];
        console.log(saved_posts, save_type, "saved_posts, save_type");

        if (saved_posts) {
            if (!save_type) {
                return res.status(400).send({ code: 400, message: "Save type is mandatory." });
            };
            if (save_type === "add") {
                filter.push({
                    $push: {
                        saved_posts: saved_posts
                    }
                });
            }
            else if (save_type === "remove") {
                filter.push({
                    $pull: {
                        saved_posts: saved_posts
                    }
                });
            }
        };

        const updateResult = await User.updateOne(
            {
                $or: [
                    { _id: new mongoose.Types.ObjectId(data.user_id) },
                    { email: email },
                    { name: name }
                ]
            },
            {
                $set: {
                    name: name,
                    email: email,
                    password: password,
                    location: location,
                    preferences: preferences,
                    isOnline: isOnline,
                    communityName: communityName,
                },
                ...filter[0]
            }
        );


        return res.status(200).send({
            code: 200,
            message: "User successfully updated",
            data: updateResult
        });
    } catch (e) {
        res.status(400).json({
            code: 400,
            message: "User not updated",
            error: e.message
        });
    }
});

router.delete("/deleteusers", async (req, res, next) => {
    try {
        let id = req.query.id;

        const findUser = await User.findOne({ _id: new mongoose.Types.ObjectId(id) });
        if (findUser?.image) {
            await uploadImage.deleteFileS3(findUser?.image);
        }
        await User.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
        const getUser = await UserPosts.find({ user_id: new mongoose.Types.ObjectId(id) });
        let attachments = [];
        getUser.forEach((ele, i) => {
            attachments = [...attachments, ...ele.attachments];
        });
        console.log(attachments, "attachments");
        if (attachments.length > 0) {
            const delPromises = attachments.forEach(async (ele, i) => {
                await uploadImage.deleteFileS3(ele.img_url);
            });
            await Promise.all(delPromises);
        };
        await UserPosts.deleteMany({ user_id: new mongoose.Types.ObjectId(id) });
        await UserCart.deleteMany({ user_id: new mongoose.Types.ObjectId(id) });
        await UserNotifications.deleteMany({ user_id: new mongoose.Types.ObjectId(id) });

        return res.status(200).send({
            code: 200,
            message: "Users successfully deleted"
        });

    }
    catch (e) {
        return res.status(400).send({
            code: 400,
            message: "Users not deleted",
            error: e.message
        });
    }
});

router.post("/createposts", upload.array('image', 5), async (req, res, next) => {
    try {
        const { data } = req.body;
        const files = req.files;
        const bodyData = JSON.parse(data);
        const { postedBy, dishName, descr, rating_data, price, time } = bodyData;

        if (!postedBy) {
            return res.json({
                status: "Failed",
                message: "postedBy is mandatory."
            });
        };

        let attachments = [];

        for (let i = 0; i < files.length; i++) {
            attachments.push({ img_url: "" });
        };
        bodyData.attachments = attachments;
        const createdPost = await UserPosts.create(bodyData);

        let imageIds = createdPost.attachments;
        const uploadPromises = files.map(async (file, i) => {
            const s3url = await uploadImage.uploadFileIntoS3("culinary", imageIds[i]._id, file, "logo");
            imageIds[i]["img_url"] = s3url.url;
        });

        await Promise.all(uploadPromises);


        const updatedData = await UserPosts.updateOne(
            { _id: createdPost._id },
            { attachments: imageIds }
        );

        return res.status(200).send({
            code: 200,
            message: "Post successfully created",
            data: createdPost
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Post not created",
            error: e.message
        });
    }
});

router.get("/getposts", async (req, res, next) => {
    try {
        let user_id = req.query.user_id;
        user_id = new mongoose.Types.ObjectId(user_id);
        const user = await User.findById(user_id);

        if (!user) {
            return res.status(404).send({ code: 404, message: "User not found" });
        };

        const posts = await UserPosts.aggregate(
            [
                { $match: { postType: "posts" } },
                {
                    $lookup: {
                        from: "users",
                        localField: "postedBy",
                        foreignField: "_id",
                        as: "userDetails"
                    }
                },
                {
                    $unwind: "$userDetails"
                },
                {
                    $project:
                    {
                        _id: 1,
                        postedBy: 1,
                        postedByName: "$userDetails.name",
                        preferences: "$userDetails.preferences",
                        postedByProfileImage: "$userDetails.image",
                        dishName: 1,
                        descr: 1,
                        attachments: 1,
                        aboutfood: 1,
                        rating_data: { $size: "$rating_data" },
                        rating_avg: { $avg: "$rating_data.number" },
                        likes_ttl: { $size: "$likes" },
                        postType: 1,
                        aboutfood: 1,
                        isLiked: { $in: [user_id, "$likes"] },
                        isSaved: { $in: ["$_id", user.saved_posts] },
                        connection: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: user.connections, //posted user connections
                                        as: "connection",
                                        cond: {
                                            $eq: ["$$connection.user_id", "$postedBy"]
                                        }
                                    }
                                },
                                0
                            ]
                        }
                    }
                }
            ]);

        return res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: posts
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        });
    }
});

router.put("/updateposts", async (req, res, next) => {
    try {
        const post_id = req.query.post_id;
        const { userName, dishName, descr, rating_data } = req.body;
        let sentNotificationPromise;

        const updateResult = await UserPosts.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(post_id) },
            {
                $set: {
                    dishName: dishName,
                    descr: descr,
                    price: price,
                    time: time,
                    postType: postType,
                    aboutfood: aboutfood,
                },
                $push: {
                    rating_data: rating_data
                }
            }
        );

        if (rating_data) {
            sentNotificationPromise = await UserNotifications.create({
                user_id: updateResult.user_id,
                msg: `${userName} rated your post with ${rating_data[0].number}.`,
            });
        };

        return res.status(200).json({
            code: 200,
            message: "Posts successfully updated",
            data: updateResult
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not updated",
            error: e.message
        });
    }
});

router.get("/deleteposts", async (req, res, next) => {
    try {
        const post_id = req.query.post_id;
        const getPosts = await UserPosts.find({ _id: new mongoose.Types.ObjectId(post_id) });
        if (getPosts.length > 0) {
            const delImages = getPosts[0].attachments;
            const delPromises = delImages.forEach(async (ele, i) => {
                await uploadImage.deleteFileS3(ele.img_url);
            });
            await Promise.all(delPromises);
            const updateResult = await UserPosts.deleteOne({ _id: new mongoose.Types.ObjectId(post_id) });
            return res.status(200).json({
                code: 200,
                message: "Posts successfully deleted.",
                data: updateResult
            });
        };

        return res.status(200).json({
            code: 200,
            message: "No Posts Available."
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        });
    }
});

router.delete("/cleandata", async (req, res, next) => {
    try {
        let getUserIds = await User.find({}, { _id: 1 });
        let getNonExsistingUserIds = await UserPosts.find({ user_id: { $nin: getUserIds } });
        console.log(getNonExsistingUserIds, "getNonExsistingUserIds>>>>>>>>");
        if (getNonExsistingUserIds.length > 0) {
            let attachments = [];
            getNonExsistingUserIds.forEach((ele, i) => {
                attachments = [...attachments, ...ele.attachments];
            });
            console.log(attachments, "attachments>>>>>>>>");

            // Add this logging line to check the value of attachments
            console.log(typeof attachments, attachments);

            if (attachments.length > 0) {
                const delPromises = attachments.map(async (ele, i) => {
                    await uploadImage.deleteFileS3(ele.img_url);
                });
                await Promise.all(delPromises);
            }
            await UserPosts.deleteMany({ user_id: { $nin: getUserIds } });
        }
        return res.status(200).send(getNonExsistingUserIds);
    }
    catch (e) {
        res.status(400).send(e.message);
    }
});

router.post("/resetPassword", async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).send({
                code: 400,
                message: "Email Id is mandatory."
            });
        };
        let getUserIds = await User.find({ email });

        if (getUserIds.length === 0) {
            return res.status(404).send({
                code: 404,
                message: "No user exists with the entered email.",
            });
        };

        function generateOTP() {
            const otp = Math.floor(1000 + Math.random() * 9000);
            return otp;
        };

        const generatedOTP = generateOTP();

        const sendEmail = await uploadImage.sendCulinaryEmail(getUserIds[0].name, email, generatedOTP);
        if (sendEmail.sts === 200) {
            await User.updateOne({ email: email }, { otp: generatedOTP });
            return res.status(200).send({
                code: 200,
                message: "Email sent successfully.",
                generatedOTP
            });
        };
        return res.status(200).send({
            code: 200,
            message: "Email not sent."
        });
    }
    catch (e) {
        res.status(500).send({
            code: 500,
            message: "Internal Server Error",
            error: e.message,
        });
    }
});

router.put("/removerating", async (req, res, next) => {
    try {
        const post_id = req.query.post_id;
        const user_id = req.query.user_id;

        const updateResult = await UserPosts.updateOne(
            { _id: new mongoose.Types.ObjectId(post_id) },
            { $pull: { rating_data: { user_id: new mongoose.Types.ObjectId(user_id) } } }
        );


        res.status(200).json({
            code: 200,
            message: "Posts successfully updated",
            data: updateResult
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not updated",
            error: e.message
        });
    }
});

router.put("/userconnections", async (req, res, next) => {
    try {
        const userBy = req.query.sentBy;
        const userName = req.query.name;
        const userTo = req.query.sentTo;
        const type = req.query.type;

        if (!userBy && !userName && !userTo && !type) {
            return res.status(400).send("sentBy,sentTo,name,type are mandatory in params.");
        };
        let userByUpdate, userToUpdate, sentNotificationPromise;

        if (!userName) {
            return res.status(400).send("userName is mandatory.");
        };

        if (type === "Sent") {

            let update1Promise, update2Promise, notificationPromise;

            const findSentUser = await User.findOne(
                { _id: userBy, 'connections.user_id': new mongoose.Types.ObjectId(userTo) }
            );

            if (findSentUser) {
                update1Promise = User.updateOne(
                    { _id: userBy, 'connections.user_id': new mongoose.Types.ObjectId(userTo) },
                    { $set: { 'connections.$.request_type': 'Sent' } }
                );
            }
            else {
                update1Promise = User.updateOne(
                    { _id: userBy },
                    { $push: { connections: [{ request_type: "Sent", user_id: userTo }] } }
                );
            }

            const sentByUserfind = await User.findOne(
                { _id: userTo, 'connections.user_id': new mongoose.Types.ObjectId(userBy) }
            );

            if (sentByUserfind) {
                update2Promise = User.updateOne(
                    { _id: userTo, 'connections.user_id': new mongoose.Types.ObjectId(userBy) },
                    { $set: { 'connections.$.request_type': 'Received' } }
                );
            }
            else {
                update2Promise = User.updateOne(
                    { _id: userTo },
                    { $push: { connections: [{ request_type: "Received", user_id: userBy }] } }
                );
            }


            if (!findSentUser && !sentByUserfind) {
                notificationPromise = UserNotifications.findOneAndUpdate(
                    {
                        user_id: userTo,
                        sent_by_user_id: userBy,
                    },
                    {
                        msg: `${userName} requested to connect with you.`,
                    },
                    { upsert: true, new: true }
                );
            }

            try {
                // Await all promises concurrently
                const [result1, result2, result3] = await Promise.all([update1Promise, update2Promise, notificationPromise]);
                console.log('All updates and notifications completed successfully.');
                // console.log(result1, result2, result3);
                return res.status(200).send({
                    code: 200,
                    message: 'All updates and notifications completed successfully.'
                });
            } catch (error) {
                console.error('An error occurred:', error);
            }

        }
        else if (type === "Accept") {

            const update1Promise = User.updateOne(
                { _id: userBy, 'connections.user_id': new mongoose.Types.ObjectId(userTo) },
                { $set: { 'connections.$.request_type': 'Follower' } }
            );

            const update2Promise = User.updateOne(
                { _id: userTo, 'connections.user_id': new mongoose.Types.ObjectId(userBy) },
                { $set: { 'connections.$.request_type': 'Following' } }
            );

            const notificationPromise = UserNotifications.findOneAndUpdate(
                {
                    user_id: userBy,
                    sent_by_user_id: userTo,
                },
                {
                    msg: `${userName} started following you.`,
                },
                { upsert: true, new: true }
            );

            const notificationPromise2 = UserNotifications.findOneAndUpdate(
                {
                    user_id: userTo,
                    sent_by_user_id: userBy,
                },
                {
                    msg: `${userName} accepted your following request.`,
                },
                { upsert: true, new: true }
            );

            try {
                // Await all promises concurrently
                await Promise.all([update1Promise, update2Promise, notificationPromise, notificationPromise2]);
                console.log('All updates and notifications completed successfully.');
                return res.status(200).send({
                    code: 200,
                    message: 'All updates and notifications completed successfully.'
                });
            }
            catch (error) {
                console.error('An error occurred:', error);
            };

        }
        else if (type === "Ignore") {
            const update1Promise = User.updateOne(
                { _id: userBy },
                { $pull: { connections: { user_id: new mongoose.Types.ObjectId(userTo) } } }
            );

            const update2Promise = [];
            // User.updateOne(
            //     { _id: userTo },
            //     { $pull: { connections: { user_id: new mongoose.Types.ObjectId(userBy) } } }
            // );

            const notificationPromise = UserNotifications.deleteOne(
                {
                    user_id: userBy,
                    sent_by_user_id: userTo,
                });

            const notificationPromise2 = UserNotifications.findOneAndUpdate(
                {
                    user_id: userTo,
                    sent_by_user_id: userBy,
                },
                {
                    msg: `${userName} ignored your following request.`,
                },
                { upsert: true, new: true }
            );

            try {
                // Await all promises concurrently
                await Promise.all([update1Promise, update2Promise, notificationPromise, notificationPromise2]);
                console.log('All updates and notifications completed successfully.');
                return res.status(200).send({
                    code: 200,
                    message: 'All updates and notifications completed successfully.'
                });
            } catch (error) {
                console.error('An error occurred:', error);
            }

        };

        res.status(200).json({
            code: 200,
            message: "Posts successfully updated",
            userByUpdate,
            userToUpdate,
            sentNotificationPromise
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not updated",
            error: e.message
        });
    }
});

router.get("/getUsersdetails", async (req, res, next) => {
    try {
        const user_id = req.query.user_id;
        async function getSavedPosts() {
            try {
                const posts = await User.aggregate([
                    {
                        $match: {
                            _id: new mongoose.Types.ObjectId(user_id)
                        }
                    },
                    {
                        $addFields: {
                            connections_size: {
                                $size: {
                                    $filter: {
                                        input: "$connections",
                                        as: "connection",
                                        cond: { $eq: ["$$connection.request_type", "Follower"] }
                                    }
                                }
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "users_posts",
                            localField: "saved_posts",
                            foreignField: "_id",
                            as: "saveddata",
                        }
                    },
                    {
                        $unwind: {
                            path: "$saveddata",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "saveddata.postedBy",
                            foreignField: "_id",
                            as: "postedByUser"
                        }
                    },
                    {
                        $unwind: {
                            path: "$postedByUser",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $group: {
                            _id: "$_id",
                            name: { $first: "$name" },
                            email: { $first: "$email" },
                            location: { $first: "$location" },
                            preferences: { $first: "$preferences" },
                            image: { $first: "$image" },
                            connections_size: { $first: "$connections_size" },
                            saved_posts_data: {
                                $push: {
                                    postedBy: "$saveddata.postedBy",
                                    dishName: "$saveddata.dishName",
                                    descr: "$saveddata.descr",
                                    price: "$saveddata.price",
                                    time: "$saveddata.time",
                                    attachments: "$saveddata.attachments",
                                    rating_data: "$saveddata.rating_data",
                                    likes: "$saveddata.likes",
                                    postType: "$saveddata.postType",
                                    aboutfood: "$saveddata.aboutfood",
                                    name: "$postedByUser.name",
                                    location: "$postedByUser.location",
                                    image: "$postedByUser.image",
                                    isOnline: "$postedByUser.isOnline",
                                }
                            },
                        }
                    }
                ]);
                return posts;
            }
            catch (error) {
                return res.status(400).send(error.message);
            }
        };

        async function getPostedPosts() {
            try {
                const getPostedPosts = await UserPosts.aggregate([
                    {
                        $match: {
                            postedBy: new mongoose.Types.ObjectId(user_id)
                        }
                    },
                    {
                        $facet: {
                            "posts": [
                                {
                                    $match: {
                                        postType: "posts"
                                    }
                                },
                                {
                                    $project: {
                                        dishName: 1,
                                        descr: 1,
                                        attachments: 1,
                                        rating_data: 1,
                                        postType: 1
                                    }
                                }
                            ],
                            "community": [
                                {
                                    $match: {
                                        postType: "community"
                                    }
                                },
                                {
                                    $project: {
                                        dishName: 1,
                                        descr: 1,
                                        attachments: 1,
                                        rating_data: 1,
                                        postType: 1,
                                        price: 1,
                                        time: 1,
                                    }
                                }
                            ]
                        }
                    }
                ]);
                return getPostedPosts;
            }
            catch (error) {
                return res.status(400).send(error.message);
            }
        };

        async function fetchData() {
            try {
                const [savedPostsResult, postedPostsResult] = await Promise.all([
                    getSavedPosts(),
                    getPostedPosts()
                ]);

                savedPostsResult[0].posts = postedPostsResult[0];

                return res.status(200).json({
                    code: 200,
                    message: "Users successfully retrieved",
                    data: savedPostsResult
                });
            }
            catch (error) {
                return res.status(400).send(error.message);
            }
        };

        fetchData();

    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Users not retrieved",
            error: e.message
        });
    }
});

router.get("/getnotifications", async (req, res, next) => {
    try {
        let user_id = req.query.user_id;
        const posts = await UserNotifications.aggregate([
            {
                $match: {
                    user_id: new mongoose.Types.ObjectId(user_id)
                }
            }
        ]);

        res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: posts
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        });
    }
});

router.put("/like", async (req, res, next) => {
    try {
        const data = req.body;
        const posts = await UserPosts.updateOne(
            { _id: new mongoose.Types.ObjectId(data.post_id) },
            {
                $push: {
                    likes: data.user_id
                }
            }
        );

        res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: posts
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        })
    };
});

router.put("/unlike", async (req, res, next) => {
    try {
        const data = req.body;
        const posts = await UserPosts.updateOne(
            { _id: new mongoose.Types.ObjectId(data.post_id) },
            {
                $pull: {
                    likes: data.user_id
                }
            }
        );

        res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: posts
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        })
    };
});

router.get("/foods", async (req, res, next) => {
    try {
        const posts = await FoodTypes.find({});
        return res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: posts
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        })
    };
});

router.get("/getcommunityposts", async (req, res, next) => {
    try {
        let user_id = req.query.user_id;
        user_id = new mongoose.Types.ObjectId(user_id);

        const user = User.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(user_id)
                }
            },
            {
                $unwind: {
                    path: "$connections",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $match: {
                    "connections.request_type": "Following",
                },
            },
            {
                $lookup: {
                    from: "users_posts",
                    localField: "connections.user_id",
                    foreignField: "postedBy",
                    as: "connectionsposts",
                },
            },
            {
                $lookup: {
                    from: "users",
                    localField: "connections.user_id",
                    foreignField: "_id",
                    as: "userDetails",
                },
            },
            {
                $match: {
                    $and: [
                        { connectionsposts: { $ne: [] } },
                        { userDetails: { $ne: [] } },
                    ]
                }
            },
            {
                $unwind: {
                    path: "$connectionsposts",
                    preserveNullAndEmptyArrays: true, // Unwind only if data exists
                },
            },
            {
                $unwind: {
                    path: "$userDetails",
                    preserveNullAndEmptyArrays: true, // Unwind only if data exists
                },
            },
            {
                $match: {
                    "connectionsposts.postType": "community"
                }
            },
            {
                $addFields: {
                    isLiked: { $in: [user_id, "$connectionsposts.likes"] },
                    isSaved: { $in: [user_id, "$userDetails.saved_posts"] },
                }
            },
            {
                $group: {
                    _id: "$connectionsposts._id",
                    descr: { $first: "$connectionsposts.descr" },
                    attachments: { $first: "$connectionsposts.attachments" },
                    // postType: { $first: "$connectionsposts.postType" },
                    postedBy: { $first: "$connectionsposts.postedBy" },
                    isLiked: { $first: "$isLiked" },
                    isSaved: { $first: "$isSaved" },
                    dishName: { $first: "$connectionsposts.dishName" },
                    price: { $first: "$connectionsposts.price" },
                    time: { $first: "$connectionsposts.time" },
                    createdAt: { $first: "$connectionsposts.createdAt" },
                    name: { $first: "$userDetails.name" },
                    location: { $first: "$userDetails.location" },
                    isOnline: { $first: "$userDetails.isOnline" },
                    image: { $first: "$userDetails.image" },
                }
            }
        ]);

        const getCommunityDetails = User.aggregate(
            [
                {
                    $match: {
                        _id: new mongoose.Types.ObjectId(user_id)
                    }
                },
                {
                    $unwind: {
                        path: "$connections",
                        preserveNullAndEmptyArrays: true,
                    }
                },
                {
                    $match: {
                        $or: [
                            { "connections.request_type": "Following" },
                            { "connections.request_type": "Sent" },
                            {
                                _id: new mongoose.Types.ObjectId(user_id)
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "connections.user_id",
                        foreignField: "_id",
                        as: "userDetails"
                    }
                },
                {
                    $unwind: {
                        path: "$userDetails",
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $group: {
                        _id: null,
                        communityName: { $first: "$communityName" },
                        communityuserDetails: {
                            $push: "$userDetails.name"
                        }
                    }
                },
                {
                    $project: {
                        _id: 0
                    }
                }
            ]
        );

        const [result1, result2] = await Promise.all([user, getCommunityDetails]);
        // console.log(result1, result2, "result1, result2>>>>");

        // const filterresult1 =
        result1.map((eachResult, i) => {

            const createdAtTime = new Date(eachResult.createdAt);

            const timeDifferenceInSeconds = eachResult.time * 60;
            const timeDifferenceInMilliseconds = timeDifferenceInSeconds * 1000;

            const remainingTimeInMilliseconds = createdAtTime.getTime() + timeDifferenceInMilliseconds - Date.now();

            const remainingTimeInSeconds = Math.max(0, remainingTimeInMilliseconds / 1000);

            const hours = Math.floor(remainingTimeInSeconds / 3600);
            const minutes = Math.floor((remainingTimeInSeconds % 3600) / 60);
            const seconds = Math.floor(remainingTimeInSeconds % 60);
            let timeRemaining = 0;
            if (hours < 1 && minutes < 1 && seconds < 1) {
                timeRemaining = 0;
            }
            else {
                timeRemaining = `${hours}:${minutes}:${seconds}`
            };
            eachResult.timeRemaining = timeRemaining;
        });

        return res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            communityposts: result1,
            communityDetails: result2
        });
    }
    catch (e) {
        console.log(e.message, "e.message>>>>>>>");
        return res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        });
    }
});

router.get("/getusersmaxlikedposts", async (req, res, next) => {
    try {
        let user_id = req.query.user_id;
        let name = req.query.name;
        let location = req.query.location;
        let preferences = req.query.preferences;
        let foodType = req.query.foodType;
        let filter = {};

        if (!name && !user_id && !location && !foodType && !preferences) {
            return res.status(200).json({
                code: 200,
                message: "User Not Found",
                data: []
            });
        };

        if (name) {
            filter["name"] = { $regex: new RegExp(name, 'i') }
        };
        if (location) {
            filter["location"] = { $regex: new RegExp(location, 'i') }
        };
        if (preferences) {
            filter["preferences"] = { $regex: new RegExp(preferences, 'i') }
        };

        const posts = await User.find(filter, { _id: 1, name: 1 });
        if (posts.length === 0) {
            return res.status(200).json({
                code: 204,
                message: "User Not Found"
            });
        };
        let getUserIds = [];
        posts.forEach((ele, i) => {
            getUserIds.push(ele._id);
        });

        let query = [];
        if (foodType) {
            query.push({
                $match: {
                    aboutfood: { $regex: new RegExp(foodType, 'i') }
                }
            });
        };

        const getMaxlikedPosts = await UserPosts.aggregate([
            {
                $match: {
                    postedBy: { $in: getUserIds }
                }
            },
            {
                $match: {
                    postType: "posts"
                }
            },
            ...query,
            {
                $project: {
                    postedBy: 1,
                    dishName: 1,
                    descr: 1,
                    likes: 1,
                    attachments: 1,
                    aboutfood: 1,
                    rating_ttl: { $sum: "$rating_data.number" },
                    likesCount: { $size: "$likes" }
                }
            },
            {
                $sort: { likesCount: -1 }
            },
            {
                $limit: 1
            },
            {
                $lookup: {
                    from: "users",
                    localField: "postedBy",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $unwind: {
                    path: "$userDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    postedBy: 1,
                    dishName: 1,
                    descr: 1,
                    attachments: 1,
                    aboutfood: 1,
                    rating_ttl: 1,
                    likesCount: 1,
                    isLiked: { $in: [user_id, "$likes"] },
                    isSaved: { $in: [user_id, "$userDetails.saved_posts"] },
                    name: "$userDetails.name",
                    location: "$userDetails.location",
                    image: "$userDetails.image",
                    preferences: "$userDetails.preferences",
                    connection: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: "$userDetails.connections",
                                    as: "connection",
                                    cond: {
                                        $eq: ["$$connection.user_id", new mongoose.Types.ObjectId(user_id)]
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            }
        ]);

        return res.status(200).json({
            code: 200,
            message: "Posts successfully retrieved",
            data: getMaxlikedPosts
        });
    }
    catch (e) {
        res.status(400).json({
            code: 400,
            message: "Posts not retrieved",
            error: e.message
        })
    };
});

router.post("/addcart", async (req, res, next) => {
    try {
        const data = req.body;
        const { orderedFromUserId, user_id, communityName, communityImg, orders, placeOrder } = data;
        let updatedCart = [];
        if (placeOrder === "Yes") {
            updatedCart = await UserCart.deleteOne(
                {
                    user_id: new mongoose.Types.ObjectId(user_id)
                }
            );
        }
        else {

            const findOrders = await UserCart.findOne(
                {
                    user_id: new mongoose.Types.ObjectId(user_id),
                }, { orderedFromUserId: 1 }
            );

            if (findOrders && findOrders?.orderedFromUserId.toString() !== orderedFromUserId) {
                return res.status(200).json({
                    code: 400,
                    message: "Please delete already existing cart."
                });
            };

            let filterorders = [];
            await Promise.all(orders.map(async (eachOrder, i) => {
                console.log(eachOrder.quantity > 0 && eachOrder._id, "eachOrder.quantity > 0 && eachOrder._id>>>>>>");
                if (eachOrder.quantity < 0 && eachOrder._id) {
                    const updatedCart = await UserCart.findOneAndUpdate(
                        {
                            user_id: user_id,
                            orderedFromUserId: orderedFromUserId,
                            "orders._id": eachOrder._id,
                        },
                        {
                            $pull: {
                                orders: { _id: eachOrder._id }
                            }
                        }
                    );
                }
                else if (eachOrder.quantity > 0 && eachOrder._id) {
                    const updatedCart = await UserCart.findOneAndUpdate(
                        {
                            user_id: user_id,
                            orderedFromUserId: orderedFromUserId,
                            "orders._id": eachOrder._id,
                        },
                        {
                            $set: {
                                "orders.$": eachOrder
                            }
                        }
                    );
                }
                else if (eachOrder.quantity > 0 && !eachOrder._id) {
                    filterorders.push(eachOrder);
                }
            }));


            // console.log(filterorders, "filterorders>>>>>>>>>>>");


            updatedCart = await UserCart.findOneAndUpdate(
                {
                    user_id: user_id,
                    orderedFromUserId: orderedFromUserId,
                },
                {
                    $set: {
                        user_id: user_id,
                        orderedFromUserId: orderedFromUserId,
                        communityName: communityName,
                        communityImg: communityImg,
                        placeOrder: placeOrder,
                    },
                    $push: {
                        orders: filterorders
                    }
                },
                { upsert: true, new: true }
            );

        }


        return res.status(200).json({
            code: 200,
            message: "Cart successfully added",
            data: updatedCart
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Cart not created",
            error: e.message
        });
    }
});

router.delete("/deletecart", async (req, res, next) => {
    try {
        const cart_id = req.query.cart_id;

        const updatedCart = await UserCart.deleteOne({ _id: cart_id });

        return res.status(200).json({
            code: 200,
            message: "Cart successfully deleted.",
            data: updatedCart
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Cart not created",
            error: e.message
        });
    }
});

router.get("/getcart", async (req, res, next) => {
    try {
        const user_id = req.query.user_id;

        const updatedCart = await UserCart.find({ user_id: user_id },
            {
                cart_id: "$_id",
                user_id: 1,
                orderedFromUserId: 1,
                communityName: 1,
                communityImg: 1,
                orders: 1,
            });

        return res.status(200).json({
            code: 200,
            message: "Cart successfully added",
            data: updatedCart
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Cart not created",
            error: e.message
        });
    }
});

router.put("/updatenotifications", async (req, res, next) => {
    try {
        const notification_id = req.query.notification_id;

        const updatedCart = await UserNotifications.updateMany(
            { _id: new mongoose.Types.ObjectId(notification_id) },
            {
                isView: true
            });

        return res.status(200).json({
            code: 200,
            message: "Cart successfully added",
            data: updatedCart
        });
    }
    catch (e) {
        return res.status(400).json({
            code: 400,
            message: "Cart not created",
            error: e.message
        });
    }
});


module.exports = router;

