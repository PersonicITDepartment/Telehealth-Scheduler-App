const { Op } = require("sequelize");
const { State } = require("../models");
const TelehealthProvider = require("../models/provider.model");
const { AccessControl, unAuthorizedAccessResponse } = require("../Utils/services");
const { USER_ROLES, USER_ROLE } = require("./privilliges.controller");

// ✅ Create provider(s)
const addProvider = async (req, res) => {
  try {
    // Protect route - only allow users with specific privileges
    // The Superadmin and PCM can update provider details
    AccessControl.authorizeByPrivileges(['PCM', 'superadmin'], req.user, res);
    
    
    const data = req.body;

    if (Array.isArray(data)) {
      const providers = await TelehealthProvider.bulkCreate(data, { validate: true, ignoreDuplicates: true });
      return res.status(201).json({ message: "Providers created successfully", providers });
    }

    const provider = await TelehealthProvider.create(data);
  return  res.status(201).json({ message: "Provider created successfully", provider });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// ✅ Get all providers
// const getAllProviders = async (req, res) => {
//   try {
//     const providers = await TelehealthProvider.findAll();
//     res.json(providers);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
const getAllProviders = async (req, res) => {


  try {
    // Protect route - only allow users with specific privileges
    // AccessControl.allUsers(req.user, res, USER_ROLES);
    const providers = await TelehealthProvider.findAll({ raw: true });

    // Fetch states for each provider
    const providersWithStates = await Promise.all(
      providers.map(async (provider) => {
        const states = await State.findAll({
          where: { stateCode: provider.stateLicenses }, // Sequelize will match array of codes
          attributes: ["stateCode", "stateName", "id"],
        });
        return { ...provider, licensedStates: states };
      })
    );

    res.json(providersWithStates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Get provider by ID
const getProviderById = async (req, res) => {
  try {
    // Protect route - only allow users with specific privileges
    AccessControl.allUsers(req.user, res, USER_ROLES);
    const provider = await TelehealthProvider.findByPk(req.params.id);
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const search = async (req, res) => {


  try {
    // ✅ Protect route - privilege check
    // const hasAccess = AccessControl.allUsers(req.user, USER_ROLES);
    // if (!hasAccess) {
    //   return res.status(403).json({
    //     status: false,
    //     message: "Forbidden: You do not have permission to perform this action",
    //   });
    // }

    // ✅ Get search query string
    const query = req.query.q || ""; // frontend se ?q=smith aayega

    
    // ✅ Search in firstName OR lastName using LIKE
    const providers = await TelehealthProvider.findAll({
      where: {
        [Op.or]: [
          { firstName: { [Op.like]: `%${query}%` } },
          { lastName: { [Op.like]: `%${query}%` } },
        ],
      },
    });

    if (!providers || providers.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No providers found",
      });
    }

    return res.status(200).json(providers);

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ✅ Update provider by ID
const updateProvider = async (req, res) => {
  try {
    const { privilege: u_role } = req.user;

    // ✅ Allow only SUPER_ADMIN and PCM
    if (![USER_ROLE.SUPER_ADMIN].includes(u_role)) {
      return res.status(403).json(unAuthorizedAccessResponse);
    }

    const provider = await TelehealthProvider.findByPk(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await provider.update({...req.body,stateLicenses:req.body.licensedStates});

    return res.json({
      message: "Provider updated successfully",
      provider,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server Error" });
  }
};

// ✅ Delete provider by ID
const deleteProvider = async (req, res) => {
 
  try {

    // Protect route - only allow users with specific privileges
    // The Superadmin and PCM can update provider details
   
    if([USER_ROLE.SUPER_ADMIN].includes(req.user.privilege)){

      const provider = await TelehealthProvider.findByPk(req.params.id);
      if (!provider) return res.status(404).json({ error: "Provider not found" });
      
      await provider.destroy();
     return  res.json({ message: "Provider deleted successfully" });
    }


   return res.status(401).json(unAuthorizedAccessResponse)
  } catch (error) {
   return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  addProvider,
  getAllProviders,
  getProviderById,
  updateProvider,
  deleteProvider,
  search
};
