const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const secret = "RESTAPIAUTH";
const app = express();
const registerRoute = require('./src/controller/register');
const commonRoute = require('./src/controller/commonController');
const port = 4111;

app.use(cors({ origin: true }));
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
})
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use('/v1', (req, res, next) => {
    console.log(req.headers.authorization);
    const token = req.headers.authorization;

    if (token) {
        jwt.verify(token, secret, function (err, decoded) {
            if (err) {
                return res.status(403).json({
                    status: "Failed",
                    code: 403,
                    message: "Not a valid token"
                });
            }
            req.user = decoded.data;
            console.log(decoded.data); // bar
            next();
        });
    } else {
        return res.json({
            status: "Failed",
            code: 400,
            message: "Token mismatch"
        });
    }
});

app.get("/", async (req, res) => {
    res.send("Welcome to Culinary Onboard accessed...");
});

app.use("/users", registerRoute);
app.use("/api", commonRoute);




mongoose.connect(process.env.mongodburl);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

