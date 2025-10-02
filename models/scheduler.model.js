const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Provider = require('./provider.model');
const State = require('./states.model');
const User = require('./user.model');
const Reservation = require('./reservation.model');


const Availability = sequelize.define('Availability', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  providerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'telehealth_providers', key: 'id' }},
  stateId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'states', key: 'id' }},
  startTime: { type: DataTypes.DATE, allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  endTime: { type: DataTypes.DATE, allowNull: false },
  timezone: { type: DataTypes.ENUM('EST', 'CST',"MST","PST","AKST","HST",""), defaultValue: '' },
  status: { type: DataTypes.ENUM('Available', 'Reserved', 'Confirmed',"Missed","Done"), defaultValue: 'Available' }
}, {
  tableName: 'availability',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['providerId', 'stateId', 'startTime', 'endTime'] // Prevent overlapping for same provider/state/time
    }
  ]
});


// Associations
// Provider.hasMany(Availability, { foreignKey: 'providerId' });
// State.hasMany(Availability, { foreignKey: 'stateId' });
// Availability.belongsTo(Provider, { foreignKey: 'providerId' });
// Availability.belongsTo(State, { foreignKey: 'stateId' });
// Provider -> Availability
Provider.hasMany(Availability, { foreignKey: 'providerId' });
Availability.belongsTo(Provider, { foreignKey: 'providerId' });

// State -> Availability
State.hasMany(Availability, { foreignKey: 'stateId' });
Availability.belongsTo(State, { foreignKey: 'stateId' });

Availability.hasMany(Reservation, { foreignKey: "availabilityId", as: "reservations" });
Reservation.belongsTo(Availability, { foreignKey: "availabilityId", as: "availability" });


module.exports = Availability;
