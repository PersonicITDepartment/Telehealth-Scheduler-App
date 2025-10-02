const { Sequelize } = require("sequelize");

// MySQL connection
const sequelize = new Sequelize("telehealth-schedule-database", "ewsjrlllwr", "ary2GAtj$xAEQud$", {
  host: "telehealth-schedule-server.mysql.database.azure.com",
  dialect: "mysql",
  dialectOptions:{
    ssl:{
      require:true
    },
  logging: false, // SQL queries ko console mein print na kare
});

// (async () => {
//   try {
//     await sequelize.authenticate();
//     console.log("✅ Database connection has been established successfully.");
//   } catch (error) {
//     console.error("❌ Unable to connect to the database:", error);
//   } finally {
//     await sequelize.close(); // connection close kar dena
//   }
// })();

module.exports = sequelize;
