new flow();

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// this object is generated from Flow Builder under "..." > Endpoint > Snippets > Responses

export const getNextScreen = async (decryptedBody) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow and display APPOINTMENT screen
  if (action === "INIT") {
    return {
      ...SCREEN_RESPONSES.SCHEDULE,
    };
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
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
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
