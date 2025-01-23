// flow.js
import { getDb } from "./db.js";

const SCREEN_RESPONSES = {
  SCHEDULE: {
    screen: "SCHEDULE",
    data: {},
  },
  SUCCESS: {
    screen: "SUCCESS",
    data: {
      extension_message_response: {
        params: {
          flow_token: "REPLACE_FLOW_TOKEN",
          some_param_name: "PASS_CUSTOM_VALUE",
        },
      },
    },
  },
};

export const getNextScreen = async (decryptedBody) => {
  const { screen, data, action, flow_token, version } = decryptedBody;

  console.log("Incoming request:", {
    screen,
    data,
    action,
    flow_token,
    version,
  });

  // Handle health check
  if (action === "health_check") {
    return {
      data: {
        status: "healthy",
      },
    };
  }

  // Handle INIT action
  if (action === "INIT" && version === "3.0") {
    console.log("Initializing flow with SCHEDULE screen");
    return SCREEN_RESPONSES.SCHEDULE;
  }

  // Handle BACK action
  if (action === "BACK" && version === "3.0") {
    console.log("Handling back navigation");
    return SCREEN_RESPONSES.SCHEDULE;
  }

  // Handle data exchange
  if (action === "data_exchange" && version === "3.0") {
    console.log("Processing data exchange for screen:", screen);

    switch (screen) {
      case "SCHEDULE":
        try {
          const db = getDb();
          const appointmentsCollection = db.collection("appointments");

          const appointmentData = {
            appointment_type: data.appointment_type,
            gender: data.gender,
            appointment_date: data.appointment_date,
            appointment_time: data.appointment_time,
            notes: data.notes || "No additional notes provided.",
            created_at: new Date(),
            flow_token: flow_token,
            status: "pending",
          };

          await appointmentsCollection.insertOne(appointmentData);
          console.log("Appointment saved to database:", appointmentData);

          const locationText =
            data.appointment_type === "online"
              ? "We'll send you the meeting link before the appointment."
              : "We look forward to seeing you at our store!";

          return {
            screen: "SUCCESS",
            data: {
              extension_message_response: {
                params: {
                  flow_token,
                  appointment_confirmed: true,
                  message: `Your ${data.appointment_type} appointment has been scheduled for ${data.appointment_date} at ${data.appointment_time}. ${locationText}`,
                },
              },
            },
          };
        } catch (error) {
          console.error("Error saving appointment:", error);
          throw error;
        }

      default:
        console.error("Unhandled screen:", screen);
        throw new Error(`Unhandled screen type: ${screen}`);
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error("Unhandled endpoint request");
};
