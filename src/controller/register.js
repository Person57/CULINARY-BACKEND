const express = require("express")
const User = require('../schemas/userDetailSchema');
const bodyparser = require("body-parser")
const bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
const secret = "RESTAPIAUTH";
const uploadImage = require('../cloudinary/cloudinary');
const multer = require('multer');
const { default: mongoose } = require("mongoose");
const upload = multer();
const router = express.Router();
router.use(bodyparser.json());

//Register an user


router.post("/register", upload.array('image', 10),
    async (req, res) => {
        try {
            const data = req.body.data;
            const UserBodyData = JSON.parse(data);
            const { name, email, password, location, preferences } = UserBodyData;
            let user = await User.aggregate([
                {
                    $match: {
                        $or: [
                            { email: email },
                            { name: name }
                        ]
                    }
                }
            ]);

            if (user.length) {
                return res.status(409).send({
                    code: 409,
                    message: "Already existing email or username."
                });
            };
            const hashedPassword = await bcrypt.hash(password, 10);
            const files = req.files;
            await User.create({
                name: name,
                email: email,
                password: hashedPassword,
                location: location,
                preferences: preferences
            })
                .then(async (data) => {
                    console.log(data._id.toString());
                    const s3url = await uploadImage.uploadFileIntoS3("culinary", data._id.toString(), files[0], "logo");
                    console.log(s3url.url);
                    await User.updateOne(
                        { _id: data._id },
                        {
                            $set: {
                                image: s3url.url
                            }
                        });
                    return res.status(200).send({
                        code: 200,
                        message: "User successfully created",
                        data: data
                    });
                })
                .catch((e) => {
                    return res.status(400).send({
                        code: 400,
                        message: "User not created",
                        data: e.message
                    });
                });

        }
        catch (e) {
            console.log(e.message, " e.message");
            return res.status(400).send({
                status: "Failed",
                message: e.message
            })
        }
    });


/**
* First check there is an account with the given user
* user exists compare password
* if not exists throw error 
*/

router.post("/login", async (req, res) => {
    try {

        const { email, name, password } = req.body;
        if (email) {
            const validateGmail = /^[\w.+\-]+@gmail\.com$/.test(email);
            if (!validateGmail) {
                return res.status(409).json({
                    code: 409,
                    message: "Invalid Gmail."
                });
            };
        };

        let user = await User.aggregate([
            {
                $match: {
                    $or: [
                        { email: email },
                        { name: name }
                    ]
                }
            },
            {
                $project: {
                    user_id: "$_id",
                    email: 1,
                    _id: 1,
                    name: 1,
                    password: 1
                }
            }
        ]);

        if (!user.length) {
            return res.status(409).send({
                code: 409,
                message: "There is no account with the entered email or username."
            })
        };

        // Load hash from your password DB.
        bcrypt.compare(password, user[0].password).then(async function (result) {
            // result == true
            if (result) {
                //create a token after login
                token = jwt.sign(user[0], secret);

                await User.updateOne({ _id: user[0]._id }, { $set: { isOnline: 1 } });
                return res.status(200).send({
                    code: 200,
                    message: "Login Successful",
                    token,
                    userId: user[0]._id
                });
            }
            else {
                return res.status(401).send({
                    code: 401,
                    message: "Invalid Credentails"
                })
            }
        })
            .catch((e) => {
                res.status(400).send({
                    code: 400,
                    message: e.message
                })
            });
    }
    catch (e) {
        return res.status(400).send({
            code: 400,
            message: e.message
        })
    }
});

router.post("/logout", async (req, res, next) => {
    try {
        const user_id = req.query.user_id;

        const updatedCart = await User.updateOne({ _id: user_id }, { $set: { isOnline: 0 } });

        return res.status(200).json({
            code: 200,
            message: "logged out successfully.",
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
