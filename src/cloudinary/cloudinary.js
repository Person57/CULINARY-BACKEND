const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
var nodemailer = require('nodemailer')
require('dotenv').config();


const s3 = new S3Client({
    credentials: {
        accessKeyId: process.env.accessKeyId,
        secretAccessKey: process.env.secretAccessKey
    },
    region: process.env.region
});

const uploadFileIntoS3 = async (folderName, profileId, image, uniqueName) => {
    let buf;
    if (image.buffer.type) {
        buf = Buffer.from(image.buffer);
    } else {
        buf = image.buffer;
    }
    const extension = image.originalname.split('.').slice(-1)[0];
    const key = `${folderName}/${profileId}_${uniqueName}.${extension}`;
    const command = new PutObjectCommand({
        ACL: 'public-read',
        Key: key,
        ContentType: image.mimetype,
        Bucket: "new-check-bucket",
        Body: buf,
    });
    const response = await s3.send(command);
    if (response && response['$metadata']['httpStatusCode'] === 200) {
        return { status: 200, url: `https://new-check-bucket.s3.ap-south-1.amazonaws.com/${key}` };
    } else {
        return { status: 400, url: '' };
    }
};

const deleteFileS3 = async (attachmentUrl) => {
    try {
        const url = "https://new-check-bucket.s3.ap-south-1.amazonaws.com/";
        const imageUrl = attachmentUrl.replace(url, "");
        const params = {
            Bucket: "new-check-bucket",
            Key: imageUrl,
        };
        const command = new DeleteObjectCommand(params);
        const response = await s3.send(command);
        if (response && response['$metadata']['httpStatusCode'] === 204) {
            return { status: 200, message: 'Object deleted successfully' };
        } else {
            return { status: 400, message: 'Object not deleted' };
        }
    }
    catch (error) {
        return error.message;
    }
};

const sendCulinaryEmail = async (name, email, generatedOTP) => {
    try {

        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            auth: {
                user: 'useronephilo@gmail.com',
                pass: 'nnzg wkjs mzqh xjgd'
            }
        });

        var mailOptions = {
            from: "useronephilo@gmail.com",
            to: email,
            subject: 'Password Reset OTP - Culinary.',
            html: `<p>Hello ${name},</p>
            <p>You requested to reset your password. Here is your One-Time Password (OTP): <strong>${generatedOTP}</strong></p>
            <p>If you didn't request this, please ignore this email.</p>`
        };

        const info = await transporter.sendMail(mailOptions);
        if (info.messageId) {
            return { sts: 200, msg: "sent successfully" };
        }
        else {
            return { sts: 400, msg: "error in sending" };
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
};

module.exports = { uploadFileIntoS3, deleteFileS3, sendCulinaryEmail };







