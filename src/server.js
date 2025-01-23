import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import { connectToDatabase } from "./db.js";

dotenv.config();

const app = express();
const { APP_SECRET, PRIVATE_KEY, PORT = "3000" } = process.env;

// Middleware for parsing JSON and capturing raw body
app.use(
  express.json({
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  })
);

// Request Signature Validation
function isRequestSignatureValid(req) {
  if (!APP_SECRET) {
    console.warn("App Secret is not set up. Skipping signature validation.");
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader) {
    console.warn("Missing x-hub-signature-256 header.");
    return false;
  }

  const signatureBuffer = Buffer.from(
    signatureHeader.replace("sha256=", ""),
    "utf-8"
  );

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest("hex");
  const digestBuffer = Buffer.from(digestString, "utf-8");

  return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
}

// Main Request Handler
app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    return res.status(500).send("Private key is missing");
  }

  if (!isRequestSignatureValid(req)) {
    return res.status(432).send();
  }

  try {
    const decryptedBody = JSON.parse(req.rawBody);

    if (
      decryptedBody.action === "data_exchange" &&
      decryptedBody.screen === "SCHEDULE"
    ) {
      const db = await connectToDatabase(); // Ensure MongoDB is connected
      const appointmentsCollection = db.collection("appointments");

      const appointmentData = {
        appointment_type: decryptedBody.data.appointment_type,
        gender: decryptedBody.data.gender,
        appointment_date: decryptedBody.data.appointment_date,
        appointment_time: decryptedBody.data.appointment_time,
        notes: decryptedBody.data.notes || "No additional notes",
        created_at: new Date(),
        flow_token: decryptedBody.flow_token,
        status: "pending",
      };

      await appointmentsCollection.insertOne(appointmentData);
      console.log("Appointment saved:", appointmentData);

      return res.send({
        screen: "SUCCESS",
        data: {
          extension_message_response: {
            params: {
              flow_token: decryptedBody.flow_token,
              appointment_confirmed: true,
              message: `Appointment scheduled for ${appointmentData.appointment_date} at ${appointmentData.appointment_time}`,
            },
          },
        },
      });
    }

    return res.send({
      screen: "SCHEDULE",
      data: {},
    });
  } catch (error) {
    console.error("Processing error:", error);
    return res.status(500).send();
  }
});

app.get("/", async (req, res) => {
  try {
    const db = await connectToDatabase();
    const isConnected = db
      ? "Connected to MongoDB!"
      : "Not connected to MongoDB";
    res.send(`Appointment Booking Service - ${isConnected}`);
  } catch (error) {
    res.send("Appointment Booking Service - MongoDB connection failed.");
  }
});

// Connect to MongoDB and insert dummy data
connectToDatabase()
  .then(async (db) => {
    console.log("MongoDB connection established successfully.");

    // Create dummy data
    const appointmentsCollection = db.collection("appointments");
    const dummyData = {
      appointment_type: "online",
      gender: "female",
      appointment_date: "2023-10-01",
      appointment_time: "10:00 AM",
      notes: "Initial dummy appointment",
      created_at: new Date(),
      flow_token: "dummy_flow_token",
      status: "pending",
    };

    // Insert dummy data
    await appointmentsCollection.insertOne(dummyData);
    console.log("Dummy appointment data inserted:", dummyData);

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1); // Exit the process if the connection fails
  });
