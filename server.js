import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { app, server } from "./socket.js";
import cookieParser from "cookie-parser";

import users from "./route/users.js"
import messages from "./route/message.route.js"



dotenv.config();

// -------------------- CONFIG --------------------

const isProd = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 4000;





app.use(cors({
  origin: [
    "https://support.vizit.homes",
    "https://dashboard.vizit.homes",
    "https://www.vizit.homes",

    "https://vizithomes.vercel.app",
     "https://vizit.homes", "http://localhost:8080", "http://localhost:8081"

  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Security + logging + parsers
app.use(
  helmet({
    // Allow cross-origin resource sharing where necessary
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(morgan(":method :url :status :response-time ms - :res[content-length]"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Trust proxy for platforms like Render/Heroku (needed for secure cookies behind proxies)
if (isProd) app.set("trust proxy", 1);






// -------------------- ROUTES --------------------

app.use("/api/user", users);
app.use("/api/messages", messages)



app.get("/", (_req, res) => {
  res.send("server is on");
});



// -------------------- DATABASE CONNECT --------------------

const connectDb = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in environment");
    throw new Error("MONGODB_URI not provided");
  }

  try {
    await mongoose.connect(uri, { autoIndex: true });
    console.log("database connected successfully!!");
  } catch (err) {
    console.error("error connecting to the database:", err);
    throw err;
  }
};


// -------------------- START SERVER --------------------

connectDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server due to DB connection error:", err);
    process.exit(1);
  });

// export app/httpServer only if you intended to; this file expects socket.js to already export them.
// End of file
