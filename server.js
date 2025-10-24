// index.js
const express = require("express");
const app = express();
const http = require("http")
require('dotenv').config();
const db = require("./models");
const path = require("path");
// Default port
const PORT = 8080;
const stateRoute = require('./routes/state.route');
const providerRoute = require('./routes/provider.route');
const userRoute = require('./routes/user.route');
const privilligesRoute = require('./routes/privilliges.route');
const authRoute = require('./routes/auth.route');
const scheduleRoute = require('./routes/scheduler.route');
const reservationRoutes = require("./routes/reservation.routes");
const statsRoutes = require('./routes/stats.route');
const commentRoutes = require('./routes/comments.route');
const exportRoute = require('./routes/export.route');
const scimRoutes = require("./routes/scim.route");
const apiKeyRoutes = require("./routes/apiKey.routes");
const settingsRoutes = require("./routes/setting.routes");

const server = http.createServer(app);
// Middleware to parse JSON bodies
const cors = require('cors');
const { initSocket } = require("./socket");



app.use(cors({
  // origin:"http://localhost:3000/",
   allowedHeaders: ["Content-Type", "Authorization"],
  credentials:true}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware (Request logger)
initSocket(server);




app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth/", authRoute);
app.use("/api/state/", stateRoute);
app.use("/api/provider/", providerRoute);
app.use("/api/users/", userRoute);
app.use("/api/privilliges/", privilligesRoute);
app.use("/api/schedule/", scheduleRoute);
app.use("/api/reservations", reservationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/reports', exportRoute);
app.use("/scim/v2", scimRoutes);
app.use("/api/keys", apiKeyRoutes);
app.use("/api/settings", settingsRoutes);



// React build folder ka path 
const buildPath = path.join(__dirname, "dist");

// Static files serve karo
app.use(express.static(buildPath));

// React app ke liye fallback route
app.get("/{*dist}", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});


const host = '0.0.0.0';
// Start server
server.listen(PORT, host, async() => {
    await db.sync(); // Ensure all models are synced with the database
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});



