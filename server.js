// index.js
const express = require("express");
const app = express();
// require('dotenv').config();
const sequelize = require("./config/db");
const db = require("./models");
const path = require("path");

// Default port
const stateRoute = require('./routes/state.route');
const providerRoute = require('./routes/provider.route');
const userRoute = require('./routes/user.route');
const privilligesRoute = require('./routes/privilliges.route');
const authRoute = require('./routes/auth.route');
const scheduleRoute = require('./routes/scheduler.route');
const reservationRoutes = require("./routes/reservation.routes");
const statsRoutes = require('./routes/stats.route');
const commentRoutes = require('./routes/comments.route');

// Middleware to parse JSON bodies
const cors = require('cors');
// const { blockedIPs } = require("./middlewares/auth");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware (Request logger)




// Middleware to block IPs
// app.use((req, res, next) => {
//   const ip = req.ip;
//     if (blockedIPs[ip] && blockedIPs[ip] > Date.now()) {
//         return res.status(403).json({ message: "Your IP is temporarily blocked" });
//     }
//     next();
// });
app.use("/api/auth/", authRoute);
app.use("/api/state/", stateRoute);
app.use("/api/provider/", providerRoute);
app.use("/api/users/", userRoute);
app.use("/api/privilliges/", privilligesRoute);
app.use("/api/schedule/", scheduleRoute);
app.use("/api/reservations", reservationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/comments', commentRoutes);


// Home route
// app.get("/", (req, res) => {
//   res.send("Hello, Express.js! 🚀");
// });

// About route
app.get("/about", (req, res) => {
  res.send("This is a basic Express.js app example.");
});


// React build folder ka path 
const buildPath = path.join(__dirname, "dist");

// Static files serve karo
app.use(express.static(buildPath));

// React app ke liye fallback route
app.get("/{*dist}", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// Start server


const port = process.env.PORT || 3000;
const host = '0.0.0.0';
app.listen(port, host, async () => {
  await db.sync();
  console.log(`Listening on ${host}:${port}`);
});




