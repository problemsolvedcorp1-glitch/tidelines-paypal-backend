const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";

const PAYPAL_BASE =
  PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

app.use(
  cors({
    origin: [
      "https://tidelinescargo.com",
      "https://www.tidelinescargo.com"
    ]
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    service: "Tidelines Cargo Payments",
    status: "online",
    paypalMode: PAYPAL_MODE
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }

  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Unable to authenticate with PayPal");
  }

  return data.access_token;
}

app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { amount, currency = "CAD", referenceId } = req.body;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: referenceId || "TIDELINES",
              amount: {
                currency_code: currency,
                value: numericAmount.toFixed(2)
              }
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "PayPal order creation failed"
      });
    }

    res.json(data);
  } catch (error) {
    console.error("Create order error:", error.message);
    res.status(500).json({ error: "Unable to create order" });
  }
});

app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;

    if (!orderID) {
      return res.status(400).json({ error: "orderID is required" });
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "PayPal capture failed"
      });
    }

    res.json(data);
  } catch (error) {
    console.error("Capture error:", error.message);
    res.status(500).json({ error: "Unable to capture order" });
  }
});

app.post("/api/paypal/webhook", (req, res) => {
  // We'll add PayPal signature verification before using this in production.
  console.log("PayPal sandbox webhook received:", req.body?.event_type);
  res.sendStatus(200);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Tidelines payment backend listening on port ${PORT}`);
});
