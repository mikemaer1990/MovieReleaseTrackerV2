// services/sendEmail.js
const axios = require("axios");

const sendEmail = async ({ to, subject, htmlContent }) => {
  try {
    const response = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "Movie Release Tracker",
          email: "mike@moviereleasetracker.online",
        },
        to: [{ email: to }],
        subject,
        htmlContent,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (err) {
    console.error(
      `Email send error to ${to}:`,
      err.response?.data || err.message,
    );
    throw err;
  }
};

module.exports = sendEmail;
