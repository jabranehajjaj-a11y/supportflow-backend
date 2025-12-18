import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ============================
// SUPABASE SETUP
// ============================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================
// BASIC APP SETUP
// ============================

app.use(cors());

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false
  })
);

app.use(express.json());

// ============================
// ROOT PAGE
// ============================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>SupportFlow AI</title></head>
      <body style="font-family: Arial; padding: 40px;">
        <h1>✅ SupportFlow AI</h1>
        <p>The app is installed and running.</p>
        <p>You can now close this window.</p>
      </body>
    </html>
  `);
});

// ============================
// HEALTH CHECK
// ============================

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ============================
// SHOPIFY OAUTH
// ============================

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

const SCOPES = [
  "read_orders",
  "write_orders",
  "read_products",
  "read_customers",
  "write_customers"
].join(",");

// Start install
app.get("/auth/shopify", (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Missing shop parameter");

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${APP_URL}/auth/shopify/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_CLIENT_ID}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(installUrl);
});

// OAuth callback
app.get("/auth/shopify/callback", async (req, res) => {
  const { shop, code, hmac } = req.query;
  if (!shop || !code || !hmac) {
    return res.status(400).send("Missing OAuth parameters");
  }

  const map = { ...req.query };
  delete map.hmac;
  delete map.signature;

  const message = new URLSearchParams(map).toString();
  const generatedHash = crypto
    .createHmac("sha256", SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest("hex");

  if (generatedHash !== hmac) {
    return res.status(401).send("HMAC validation failed");
  }

  try {
    // Exchange code for token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // ✅ SAVE TO SUPABASE
    const { error } = await supabase
      .from("stores")
      .upsert({
        shop_domain: shop,
        access_token: accessToken
      });

    if (error) {
      console.error("Supabase error:", error.message);
      return res.status(500).send("Failed to save store");
    }

    console.log("Store saved:", shop);

    res.redirect("/");
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("OAuth failed");
  }
});
// ============================
// ORDER LOOKUP (FIRST REAL FEATURE)
// ============================

app.post("/api/orders/lookup", async (req, res) => {
  const { shop, orderName } = req.body;

  if (!shop || !orderName) {
    return res.status(400).json({
      error: "Missing shop or orderName"
    });
  }

  try {
    // Get access token from Supabase
    const { data, error } = await supabase
      .from("stores")
      .select("access_token")
      .eq("shop_domain", shop)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Store not found" });
    }

    const accessToken = data.access_token;

    // Call Shopify Orders API
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/orders.json?name=${orderName}`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken
        }
      }
    );

    const order = response.data.orders[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Return safe order info
    res.json({
      order: {
        id: order.id,
        name: order.name,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        total_price: order.total_price,
        created_at: order.created_at
      }
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// ============================
// START SERVER
// ============================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
