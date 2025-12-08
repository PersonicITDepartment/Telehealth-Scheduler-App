const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { getFullForm } = require("./privilliges.controller");
const { BASE_URL } = require("../config/URL");
const FRONTEND_URL = BASE_URL;
const axios = require("axios");
// require("dotenv").config();

const querystring = require("querystring");

const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID 
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID 
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET
const REDIRECT_URI = `${BASE_URL}/api/auth/sso/callback`;


// ---------------------------------------------------------------------------
// Step 1: Redirect user to Azure login
// ---------------------------------------------------------------------------
const startSSO = (req, res) => {
  
  const returnUrl = BASE_URL;
  const params = querystring.stringify({
    client_id: AZURE_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: "openid email profile",
    state: encodeURIComponent(returnUrl),
  });

  const azureAuthUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
  return res.redirect(azureAuthUrl);
};

// ---------------------------------------------------------------------------
// Step 2: Callback from Azure
// ---------------------------------------------------------------------------
const ssoCallback = async (req, res) => {
  const { code, state } = req.query;
  const returnUrl = decodeURIComponent(state || FRONTEND_URL);

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      querystring.stringify({
        client_id: AZURE_CLIENT_ID,
        scope: "openid email profile",
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        client_secret: AZURE_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const idToken = tokenResponse.data.id_token;
    const decoded = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64").toString("utf8")
    );

    const email = decoded.preferred_username || decoded.email;
    if (!email) return res.redirect(`${returnUrl}?sso=denied&reason=no_email`);

    // Lookup user in your DB
    const user = await User.findOne({ where: { email, status: "active" } });
    if (!user) {
      return res.redirect(`${returnUrl}/login?sso=denied&reason=user_not_found`);
    }


    if(user.accountVerificationStatus== "pending_verification"){
      user.accountVerificationStatus = "verified"
    }
    await user.update({
   lastLoginAt: new Date(),
   lastLoginIP: req.ip || req.connection.remoteAddress || null,
 });
   user.save()
    // Create your local JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, privilege: user.privilege },
      process.env.JWT_SECRET || "5e555416fe2bbb900f857d1e2edd89eb",
      { expiresIn: "8h" }
    );

    // Set cookies
    res.cookie("token", token, {
      httpOnly: false,
      secure: true,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    });

   res.cookie(
    "user",
    JSON.stringify({
      id: user.id,
      profile: user.profile,
      username: user.username,
      fullName: user.firstName + " " + user.lastName,
      email: user.email,
      role: user.privilege,
      roleFullForm: user.designation ? user.designation : getFullForm(user.privilege),
      isSetupComplete: user.isSetupComplete,
      lastLoginAt: user.lastLoginAt,
      lastLoginIP: user.lastLoginIP,
    }),
    {
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    }
  );

    return res.redirect(`${returnUrl}?sso=success`);
  } catch (error) {
    console.error("Azure SSO Error:", error.response?.data || error.message);
    return res.redirect(`${FRONTEND_URL}?sso=denied&reason=token_exchange_failed`);
  }
};

module.exports = { startSSO, ssoCallback };
