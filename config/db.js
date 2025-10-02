// /config/sequelize.js
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const {
  MYSQL_HOST,         // e.g., myserver.mysql.database.azure.com
  MYSQL_PORT = '3306',
  MYSQL_DATABASE,     // e.g., telehealth
  MYSQL_USER,         // e.g., dbuser  (use dbuser@myserver if needed)
  MYSQL_PASSWORD,
  MYSQL_SSL_CA_PATH,  // e.g., /home/site/wwwroot/certs/azure-mysql-ca.pem
} = process.env;

// If you pass the FQDN host, we can derive the short server name (before ".mysql.database.")
function extractServerShortName(fqdn) {
  const m = (fqdn || '').match(/^([^.]+)\.mysql\.database\./i);
  return m ? m[1] : null;
}

const serverShortName = extractServerShortName(MYSQL_HOST);

// If user didn't include @servername, append it automatically (common requirement with Azure MySQL).
const usernameForAuth =
  MYSQL_USER && MYSQL_USER.includes('@') ? MYSQL_USER
  : (serverShortName ? `${MYSQL_USER}@${serverShortName}` : MYSQL_USER);

// Build TLS options. Strongly recommended: provide the CA file.
// Temporary fallback with rejectUnauthorized:false will connect, but use CA in prod.
const sslOptions = MYSQL_SSL_CA_PATH && fs.existsSync(MYSQL_SSL_CA_PATH)
  ? { ca: fs.readFileSync(path.resolve(MYSQL_SSL_CA_PATH)) }
  : { rejectUnauthorized: false }; // TEMPORARY ONLY

const sequelize = new Sequelize(MYSQL_DATABASE, usernameForAuth, MYSQL_PASSWORD, {
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  dialect: 'mysql',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    idle: 10000,
    acquire: 60000
  },
  dialectOptions: {
    ssl: { ...sslOptions, require: true } // needed for Azure MySQL TLS
  }
});

// Optional: quick connectivity log on boot
sequelize.authenticate()
  .then(() => console.log('✅ MySQL connected'))
  .catch(err => console.error('❌ MySQL connection error:', err));

module.exports = sequelize;
