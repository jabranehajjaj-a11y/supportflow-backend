import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Health check (VERY IMPORTANT)
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "SupportFlow backend is running",
    time: new Date().toISOString()
  });
});

// Temporary test endpoint
app.post("/api/test", (req, res) => {
  res.json({
    received: req.body,
    message: "API is working 🎉"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
