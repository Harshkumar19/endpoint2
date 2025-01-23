import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
import crypto from "crypto";

const app = express();
const {
  APP_SECRET,
  PRIVATE_KEY,
  PASSPHRASE = "",
  PORT = "3000",
  MONGODB_URI = "mongodb+srv://karanvishwakarma732:qG4teTOnH2KbT6iH@cluster0.t0bbl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
} = process.env;

// Ensure MONGODB_URI is properly defined
if (!MONGODB_URI) {
  console.error("MongoDB URI is not set in environment variables");
  process.exit(1);
}

// MongoDB Connection
const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

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
    // Parse request body (replace with your decryption logic if needed)
    const decryptedBody = JSON.parse(req.rawBody);

    // Database Logic
    if (
      decryptedBody.action === "data_exchange" &&
      decryptedBody.screen === "SCHEDULE"
    ) {
      await client.connect();
      const database = client.db("appointments");
      const appointmentsCollection = database.collection("appointments");

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

      // Prepare response
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

    // Handle other actions
    return res.send({
      screen: "SCHEDULE",
      data: {},
    });
  } catch (error) {
    console.error("Processing error:", error);
    return res.status(500).send();
  } finally {
    await client.close();
  }
});

app.get("/", (req, res) => {
  res.send("Appointment Booking Service");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
