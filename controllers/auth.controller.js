const AuthUser = require("../models/user.model");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { loginAttempts, MAX_ATTEMPTS, BLOCK_DURATION, blockedIPs } = require("../middlewares/auth");
const { getFullForm, USER_ROLES, USER_ROLE } = require("./privilliges.controller");
const { AccessControl, unAuthorizedAccessResponse } = require("../Utils/services");
const { Op } = require("sequelize");

// Register a new user
exports.register = async (req, res) => {
  try {
    const { username, email, password, privilege,firstName,lastName } = req.body;

    if(![USER_ROLE.SUPER_ADMIN].includes(req.user.privilege)) return res.status(401).json(unAuthorizedAccessResponse)
    // Check if username or email already exists
    const existingUser = await AuthUser.findOne({ 
      where: { username } 
    });
    const existingEmail = await AuthUser.findOne({ 
      where: { email } 
    });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });
    if (existingEmail) return res.status(400).json({ message: 'Email already exists' });

    const user = await AuthUser.create({ username, email, password, privilege,firstName,lastName });
    res.status(201).json({ message: 'User registered successfully', user: { id: user.id, username: user.username,fullName:user.firstName+" "+user.lastName, email: user.email, privilege: user.privilege } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};



// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = await User.findAll({
        where:{
            privilege:req.user.privilege
        }
      });
    return res.status(200).json(users);
    const user = await AuthUser.findOne({ where: { email, status:"active" } });
    // if (!user) return res.status(404).json({ type:"login_failed",message: 'User not found' });
    if (!user) return res.status(200).json({ type:"login_failed",message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(200).json({ type:"login_failed", message: 'Invalid credentials' });


    
    // Update last login details
    await user.update({
      lastLoginAt: new Date(),
      lastLoginIP: req.ip || req.connection.remoteAddress || null,
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, privilege: user.privilege },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      profile: {
        id: user.id,
        profile:user.profile,
        username: user.username,
        fullName: user.firstName + " "+user.lastName,
        email: user.email,
        role: user.privilege,
        roleFullForm:getFullForm(user.privilege),        
        lastLoginAt: user.lastLoginAt,
        lastLoginIP: user.lastLoginIP,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user profile


exports.getProfile = async (req, res) => {
  try {
    const user = await AuthUser.findByPk(req.user.id, { attributes: ['id', 'username', 'email', 'privilege'] });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
exports.checkToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status:false, type:"no_token", message: 'Unauthorized: No token provided' });
    }
  
    const token = authHeader.split(' ')[1];
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
      req.user = decoded; // contains id, username, privilege
      return res.json({status:true})
    } catch (error) {
      return res.status(401).json({ status:false, type:"invalid_token", message: 'Unauthorized: Invalid token' });
    }
};




exports.getAllUsers = async (req, res) => {

  try {

    if(!AccessControl.allUsers(req.user,res,USER_ROLES)) return res.status(401).json({error:"unaothorized access"})

      if(AccessControl.authorizeByPrivileges(["superadmin"],req.user)){ 
        const users = await AuthUser.findAll();
        res.status(200).json(users);
      }
      else if (AccessControl.authorizeByPrivileges(["PCM"],req.user)){
        
       const users = await AuthUser.findAll({
  where: {
    privilege: { [Op.in]: ["PCM", "CDS", "PCC","DSS"] },
    status: "active"
  }
});
        res.status(200).json(users);
      }
      else if (AccessControl.authorizeByPrivileges(["PCC","CDS","DSS","PCM"],req.user)){
        const users = await AuthUser.findAll({
          where:{
            privilege:req.user.privilege,
            status:"active"
          }
        });
        res.status(200).json(users);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
    }
};
