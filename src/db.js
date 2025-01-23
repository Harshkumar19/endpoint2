import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

// Ensure environment variables are loaded
dotenv.config();

// Validate MongoDB URI
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set in environment variables");
  throw new Error("MongoDB connection string is required");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let dbConnection = null;

export const connectToDatabase = async () => {
  console.log("Attempting to connect to MongoDB...");
  try {
    await client.connect();
    dbConnection = client.db("appointments");
    console.log("Successfully connected to MongoDB!");
    return dbConnection;
  } catch (error) {
    console.error("Could not connect to MongoDB:", error);
    throw new Error(
      "MongoDB connection failed. Please check your connection string and credentials."
    );
  }
};

export const getDb = () => {
  if (!dbConnection) {
    throw new Error(
      "Database connection is not established. Please connect to the database first."
    );
  }
  return dbConnection;
};

export default client;
