// server.js
import express from "express"; // Keep this import
import crypto from "crypto";
import dotenv from "dotenv";
import { getDb } from "./firebase.js";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { decryptRequest, encryptResponse } from "./encryption.js";
import { getNextScreen } from "./flow.js";

dotenv.config();

const app = express();
const { APP_SECRET, PRIVATE_KEY, PASSPHRASE, PORT = "3000" } = process.env;

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

// Endpoint to handle appointments
app.post("/appointments", async (req, res) => {
  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
      req.body,
      PRIVATE_KEY,
      PASSPHRASE
    );

    const response = await getNextScreen(decryptedBody);
    const encryptedResponse = encryptResponse(
      response,
      aesKeyBuffer,
      initialVectorBuffer
    );

    // Save appointment data to Firestore
    if (
      decryptedBody.action === "data_exchange" &&
      decryptedBody.screen === "SCHEDULE"
    ) {
      const db = getDb();
      const appointmentsRef = collection(db, "appointments");

      const appointmentData = {
        appointment_type: decryptedBody.data.appointment_type,
        gender: decryptedBody.data.gender,
        appointment_date: decryptedBody.data.appointment_date,
        appointment_time: decryptedBody.data.appointment_time,
        notes: decryptedBody.data.notes || "No additional notes provided.",
        created_at: new Date().toISOString(),
        flow_token: decryptedBody.flow_token,
        status: "pending",
      };

      await addDoc(appointmentsRef, appointmentData);
      console.log("Appointment saved to Firestore:", appointmentData);
    }

    res.json({ encrypted_response: encryptedResponse });
  } catch (error) {
    console.error("Error processing appointment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to get all appointments
app.get("/appointments", async (req, res) => {
  try {
    const db = getDb();
    const appointmentsRef = collection(db, "appointments");
    const appointmentsSnapshot = await getDocs(appointmentsRef);

    const appointments = [];
    appointmentsSnapshot.forEach((doc) => {
      appointments.push({ id: doc.id, ...doc.data() });
    });

    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Main WhatsApp Flow endpoint
app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    return res.status(500).send("Private key is missing");
  }

  if (!isRequestSignatureValid(req)) {
    return res.status(432).send();
  }

  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
      req.body,
      PRIVATE_KEY,
      PASSPHRASE
    );

    const response = await getNextScreen(decryptedBody);
    const encryptedResponse = encryptResponse(
      response,
      aesKeyBuffer,
      initialVectorBuffer
    );

    res.json({ encrypted_response: encryptedResponse });
  } catch (error) {
    console.error("Processing error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).send();
    }
    return res.status(500).send();
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const db = getDb();
    const appointmentsRef = collection(db, "appointments");
    await getDocs(
      query(appointmentsRef, where("status", "==", "pending")).limit(1)
    );
    res.json({ status: "healthy", database: "connected" });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("WhatsApp Flow Appointment Booking Service - Running");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
