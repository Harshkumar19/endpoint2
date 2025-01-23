import express from "express";
import {
  decryptRequest,
  encryptResponse,
  FlowEndpointException,
} from "./encryption.js";
import { getNextScreen } from "./flow.js";
import { MongoClient, ServerApiVersion } from "mongodb";
import crypto from "crypto";
import dotenv from "dotenv";
// import { connectToDatabase } from "./db.js";

dotenv.config();

const app = express();
const {
  APP_SECRET,
  PRIVATE_KEY,
  PASSPHRASE = "",
  PORT = "3000",
  MONGODB_URI,
} = process.env;

// MongoDB Connection
const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const connectToDatabase = async () => {
  const dbModule = await import("./db.js");
  return dbModule.connectToDatabase();
};

// Connect to MongoDB when the server starts
connectToDatabase()
  .then(() => {
    console.log("MongoDB connection established successfully.");
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1); // Exit the process if the connection fails
  });

app.use(
  express.json({
    // Store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  })
);

app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    throw new Error(
      'Private key is empty. Please check your env variable "PRIVATE_KEY".'
    );
  }

  if (!isRequestSignatureValid(req)) {
    return res.status(432).send(); // Return status code 432 if request signature does not match
  }

  let decryptedRequest = null;
  try {
    decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
  } catch (err) {
    console.error(err);
    if (err instanceof FlowEndpointException) {
      return res.status(err.statusCode).send();
    }
    return res.status(500).send();
  }

  const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
  console.log("💬 Decrypted Request:", decryptedBody);

  // try {
  //   // Database Logic
  //   if (
  //     decryptedBody.action === "data_exchange" &&
  //     decryptedBody.screen === "SCHEDULE"
  //   ) {
  //     await client.connect();
  //     const database = client.db("appointments");
  //     const appointmentsCollection = database.collection("appointments");

  //     const appointmentData = {
  //       appointment_type: decryptedBody.data.appointment_type,
  //       gender: decryptedBody.data.gender,
  //       appointment_date: decryptedBody.data.appointment_date,
  //       appointment_time: decryptedBody.data.appointment_time,
  //       notes: decryptedBody.data.notes || "No additional notes",
  //       created_at: new Date(),
  //       flow_token: decryptedBody.flow_token,
  //       status: "pending",
  //     };

  //     await appointmentsCollection.insertOne(appointmentData);
  //     console.log("Appointment saved:", appointmentData);

  //     const successResponse = {
  //       screen: "SUCCESS",
  //       data: {
  //         extension_message_response: {
  //           params: {
  //             flow_token: decryptedBody.flow_token,
  //             appointment_confirmed: true,
  //             message: `Appointment scheduled for ${appointmentData.appointment_date} at ${appointmentData.appointment_time}`,
  //           },
  //         },
  //       },
  //     };

  //     return res.send(
  //       encryptResponse(successResponse, aesKeyBuffer, initialVectorBuffer)
  //     );
  //   }

  //   // Handle other actions
  //   const fallbackResponse = {
  //     screen: "SCHEDULE",
  //     data: {},
  //   };
  //   return res.send(
  //     encryptResponse(fallbackResponse, aesKeyBuffer, initialVectorBuffer)
  //   );
  // } catch (error) {
  //   console.error("Processing error:", error);
  //   return res.status(500).send();
  // } finally {
  //   await client.close();
  // }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  // console.log(`Server is listening on port: ${PORT}`);
});

function isRequestSignatureValid(req) {
  if (!APP_SECRET) {
    // console.warn(
    //   "App Secret is not set up. Please Add your app secret in /.env file to check for request validation"
    // );
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

  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}
