import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(helmet());
app.use(express.json());

// ============================
// CONFIG
// ============================
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

// Required scopes for MVP
const SCOPES = [
  "read_orders",
  "write_orders",
  "read_products",
  "read_customers",
  "write_customers"
].join(",");

// ============================
// HEALTH CHECK
// ============================
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "SupportFlow backend running" });
});

// ============================
// SHOPIFY OAUTH – STEP 1
// ============================
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

// ============================
// SHOPIFY OAUTH – STEP 2
// ============================
app.get("/auth/shopify/callback", async (req, res) => {
  const { shop, code, hmac } = req.query;
  if (!shop || !code || !hmac) {
    return res.status(400).send("Missing OAuth parameters");
  }

  // Verify HMAC
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
    // Exchange code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // 🔒 TEMPORARY: log token (we'll store it properly next step)
    console.log("Installed shop:", shop);
    console.log("Access token:", accessToken);

    res.send(`
      <h2>✅ SupportFlow Installed</h2>
      <p>Store: ${shop}</p>
      <p>You can close this window.</p>
    `);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Failed to complete OAuth");
  }
});

// ============================
// START SERVER
// ============================
app.listen(PORT, () => {
  console.log(`SupportFlow backend running on port ${PORT}`);
});

