const { Sequelize } = require("sequelize");

// MySQL connection
const sequelize = new Sequelize("telehealth", "root", "", {
  host: "localhost",
  dialect: "mysql",
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
  