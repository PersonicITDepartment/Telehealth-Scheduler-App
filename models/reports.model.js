// models/report.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./user.model");


const Report = sequelize.define("Report", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    payload: {
      type: DataTypes.JSON, // stores the full JSON payload
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    size: {
      type: DataTypes.FLOAT, // in bytes (can be optional)
      allowNull: true,
    },
    filetype: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    providerName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: "reports", // table name in DB
    timestamps: true,     // adds createdAt, updatedAt
  });


Report.belongsTo(User, { foreignKey: "userId",as:"generatedBy" });  // ✅ Each Report belongs to one User

module.exports = Report