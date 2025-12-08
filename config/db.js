const { Sequelize } = require("sequelize");

const DB_CREDENTIAL = process.env
// MySQL connection
const sequelize = new Sequelize(DB_CREDENTIAL.AZURE_MYSQL_DATABASE, DB_CREDENTIAL.AZURE_MYSQL_USER, DB_CREDENTIAL.AZURE_MYSQL_PASSWORD, {
  host: DB_CREDENTIAL.AZURE_MYSQL_HOST,
  dialect: "mysql",
  logging: false, // SQL queries ko console mein print na kare
  
   dialectOptions:{
    ssl:{
      require:true
    }
  },
});



module.exports = sequelize;
