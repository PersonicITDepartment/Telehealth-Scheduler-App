
const dayjs = require("dayjs");
const { USER_ROLES } = require("../controllers/privilliges.controller");

// accessControl.js

const availablePrivileges = {
  PCC: "PCC",
  CDS: "CDS",
  PCM: "PCM",
  SUPER_ADMIN: "superadmin",
};

class AccessControl {
  static denyAccess(res, message = "Forbidden: Insufficient privileges") {
    return false
  }

  static allUsers(user, res, allowedPrivileges = []) {
    if (!user || !allowedPrivileges.includes(user.privilege)) {
      return this.denyAccess(res);
    }
    return true;
  }

  static pccOnly(user, res) {
    if (!user || ![availablePrivileges.PCC, availablePrivileges.SUPER_ADMIN, availablePrivileges.PCM].includes(user.privilege)) {
      return this.denyAccess(res);
    }
    return true;
  }

  static cdsOnly(user, res) {
    if (!user || user.privilege !== availablePrivileges.CDS) {
      return this.denyAccess(res);
    }
    return true;
  }

  static pcmOnly(user, res) {
    if (!user || ![availablePrivileges.PCM, availablePrivileges.SUPER_ADMIN].includes(user.privilege)) {
      return this.denyAccess(res);
    }
    return true;
  }

  static superAdminOnly(user, res) {
    if (!user || user.privilege !== availablePrivileges.SUPER_ADMIN) {
      return this.denyAccess(res);
    }
    return true;
  }

  static authorizeByPrivileges(allowedPrivileges = [], user) {

    if (!user || !allowedPrivileges.includes(user.privilege)) {
      return this.denyAccess();
    }
    return true
  }
}

const unAuthorizedAccessResponse = {
        status: false,
        type: "unauthorized_access",
        message: "Access denied: User is blocked",
        redirectTo: "/contact-admin" // frontend ko redirect karne ke liye
    }



    function maskEmail(email) {
  if (!email || typeof email !== 'string') return email;

  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;

  const local = email.slice(0, atIndex);
  const domainFull = email.slice(atIndex + 1);

  // split domain into labels and TLD
  const domainParts = domainFull.split('.'); // e.g. ['personichealth', 'com']
  if (domainParts.length < 2) {
    // weird domain, fallback
    return maskLocalOnly(local) + '@' + domainFull;
  }

  const tld = domainParts.pop(); // 'com'
  const domainName = domainParts.pop() || ''; // 'personichealth' (main domain)
  const subdomains = domainParts; // any remaining subdomains

  // mask local part: keep first and last char, replace middle with up to 6 stars
  function maskLocalOnly(l) {
    if (!l) return l;
    if (l.length === 1) return l + '***';
    if (l.length === 2) return l[0] + '*' + l[1];
    const starsCount = Math.min(6, Math.max(1, l.length - 2)); // sensible cap
    return l[0] + '*'.repeat(starsCount) + l[l.length - 1];
  }

  // mask main domain: show first 3 chars then '***' (if domain is short, keep one and add '***')
  function maskDomainName(d) {
    if (!d) return '***';
    if (d.length <= 3) return d[0] + '***';
    return d.slice(0, 3) + '***';
  }

  // mask simple subdomains (if any) to first letter + '***'
  const maskedSub = subdomains.length
    ? subdomains.map(s => (s ? s[0] + '***' : '')).join('.')
    : '';

  const maskedLocal = maskLocalOnly(local);
  const maskedDomainName = maskDomainName(domainName);

  const maskedDomain = (maskedSub ? maskedSub + '.' : '') + maskedDomainName + '.' + tld;

  return `${maskedLocal}@${maskedDomain}`;
}


const TIMEZONES = {
  EST: "America/New_York",
  CST: "America/Chicago",
};
function toUTC(localDateTime, tz) {
  return dayjs.tz(localDateTime, TIMEZONES[String(tz).toUpperCase()]).utc().format();
}
 function toLocalTz(utcDateTime, tz) {
  return dayjs.utc(utcDateTime).tz(TIMEZONES[String(tz).toUpperCase()]).format("YYYY-MM-DD HH:mm:ss");
}
module.exports = { AccessControl, availablePrivileges,unAuthorizedAccessResponse,maskEmail,toUTC,toLocalTz };
