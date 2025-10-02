const User = require('../models/user.model');
const { AccessControl, unAuthorizedAccessResponse } = require('../Utils/services');
const { USER_ROLES, USER_ROLE } = require('./privilliges.controller');

// Get all users
exports.getAllUsers = async (req, res) => {
  
  try {

    // if(!AccessControl.allUsers(req.user,res,USER_ROLES)) return res.status(401).json({error:"unaothorized access"})

    const {privilege:u_role} = req.user
     
    if(AccessControl.authorizeByPrivileges(["superadmin"],req.user)){ 
      const users = await User.findAll();
      res.status(200).json(users);
    }
    else if ([USER_ROLE.PCC,USER_ROLE.CDS].includes(u_role)){
      
      const users = await User.findAll({
        where:{
            privilege:req.user.privilege
        }
      });
      res.status(200).json(users);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get single user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Create a new user
exports.createUser = async (req, res) => {
  try {
    const data = req.body;
    const user = await User.bulkCreate(data, { validate: true });
    res.status(201).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.errors[0].message });
  }
};

// Update user by ID
// exports.updateUser = async (req, res) => {
//   try {
//     const { email, firstName, lastName, privilege, status } = req.body;
//     const user = await User.findByPk(req.params.id);
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     await user.update({ email, firstName, lastName, privilege, status });
//     res.status(200).json(user);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Server Error' });
//   }
// };

exports.updateUser = async (req, res) => {
  try {
    const { email, firstName, lastName, privilege, status } = req.body;
    const { id: loggedInUserId, privilege: u_role } = req.user;

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Case 1: SUPER_ADMIN can update everything
    if (u_role === USER_ROLE.SUPER_ADMIN) {
      await user.update({ email, firstName, lastName, privilege, status });
      return res.status(200).json({ message: "User updated successfully", user });
    }

    // Case 2: Normal roles can only update their own profile (not others)
    if ([USER_ROLE.PCM, USER_ROLE.CDS, USER_ROLE.PCC, USER_ROLE.DSS].includes(u_role)) {
      if (parseInt(req.params.id) !== loggedInUserId) {
        return res.status(403).json({ message: "You can only update your own profile" });
      }

      await user.update({ email, firstName, lastName });
      return res.status(200).json({ message: "Profile updated successfully", user });
    }

    // Case 3: Unauthorized roles
    return res.status(401).json(unAuthorizedAccessResponse);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};


// Delete user by ID
exports.deleteUser = async (req, res) => {
  try {
    const {privilege:u_role}  = req.user
    if([USER_ROLE.SUPER_ADMIN].includes(u_role)){

      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      
      await user.destroy();
      res.status(200).json({ message: 'User deleted successfully' });
    }
    res.status(401).json(unAuthorizedAccessResponse)
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

//  Change Password
exports.changeUserPassword = async (req, res) => {
  try {
    const { privilege: u_role, id: loggedInUserId } = req.user;

    // Case 1: SUPER_ADMIN can reset any user password directly
    if (u_role === USER_ROLE.SUPER_ADMIN) {
      const { userId, newPassword } = req.body;

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await user.update({ password: newPassword });
      return res.status(200).json({ message: "Password updated successfully" });
    }

    // Case 2: Other roles must provide old password
    if ([USER_ROLE.PCM, USER_ROLE.CDS, USER_ROLE.PCC, USER_ROLE.DSS].includes(u_role)) {
      const { oldPassword, newPassword } = req.body;

      const user = await User.findByPk(loggedInUserId);
      if (!user) {
        return res.status(401).json({ type: "login_failed", message: "Invalid credentials" });
      }

      const isMatch = await user.comparePassword(oldPassword);
      if (!isMatch) {
        return res.status(401).json({ type: "login_failed", message: "Incorrect Password, Please try again..." });
      }

      await user.update({ password: newPassword });
      return res.status(200).json({ message: "Password updated successfully" });
    }

    // Case 3: Unauthorized role
    return res.status(401).json(unAuthorizedAccessResponse);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};