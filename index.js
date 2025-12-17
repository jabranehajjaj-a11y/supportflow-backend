import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

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
// ROOT PAGE (THIS FIXES "CANNOT GET")
// ============================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>SupportFlow AI</title>
      </head>
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
  res.json({
    ok: true,
    status: "SupportFlow backend running"
  });
});

// ============================
// SHOPIFY OAUTH – START
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
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code
      }
    );

    console.log("Installed shop:", shop);
    console.log("Access token:", tokenResponse.data.access_token);

    res.redirect("/");
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("OAuth failed");
  }
});

// ============================
// START SERVER
// ============================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
