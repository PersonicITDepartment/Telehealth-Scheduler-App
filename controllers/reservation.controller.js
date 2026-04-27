const Reservation = require("../models/reservation.model");
const State = require("../models/states.model");
const Provider = require("../models/provider.model");
const Availability = require("../models/scheduler.model");
const User = require("../models/user.model");



const { Op } = require("sequelize");
const { USER_ROLE } = require("./privilliges.controller");
const { getIO } = require("../socket");
const { toUTC } = require("../Utils/services");

exports.createReservation = async (req, res) => {
  try {
    const {
      stateId,
      providerId,
      availabilityId,
      start:startTime,
      end:endTime,
      duration,
      notes,
      // timezone
    } = req.body;
    const timezone = req.setting.timezone

  
    const start = toUTC(startTime,timezone),
          end = toUTC(endTime,timezone)
          
    // Overlap check: any existing reservation for same provider that overlaps this time
    const existingReservation = await Reservation.findOne({
      where: {
        providerId,
        status: { [Op.ne]: "cancelled" }, // optional: exclude cancelled reservations
        [Op.or]: [
          {
            start: {
              [Op.lt]: end, // existing start < new end
            },
            end: {
              [Op.gt]: start, // existing end > new start
            },
          },
        ],
      },
    });

    if (existingReservation) {
      return res
        .status(400)
        .json({ error: "This time slot is already reserved for the provider." });
    }

    



    const reservation = await Reservation.create({
      stateId,
      providerId,
      availabilityId,
      reservedBy: req.user.id,
      start,
      end,
      duration,
      status: "reserved",
      notes,
      timezone
    });


    getIO().emit("scheduleUpdated");

   return res
      .status(201)
      .json({ message: "Reservation created", data: reservation });
  } catch (error) {
    console.error(error);
   return res
      .status(500)
      .json({ message: "Failed to create reservation", error: error.message });
  }
};


// ✅ Get All Reservations
exports.getReservations = async (req, res) => {
  try {
    const reservations = await Reservation.findAll({
      include: [
        { model: State, as: "state" },
        { model: Provider, as: "provider" },
        { model: Availability, as: "availability" },
        { model: User, as: "reservedUser" },
        { model: User, as: "confirmedUser" },
      ],
    });

  return  res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
   return res.status(500).json({ message: "Failed to fetch reservations", error });
  }
};

// ✅ Get Single Reservation by ID
exports.getReservationById = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: State, as: "state" },
        { model: Provider, as: "provider" },
        { model: Availability, as: "availability" },
        { model: User, as: "reservedUser" },
        { model: User, as: "confirmedUser" },
      ],
    });

    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    res.status(200).json(reservation);
  } catch (error) {
    console.error(error);
  return  res.status(500).json({ message: "Failed to fetch reservation", error });
  }
};


exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;

    // Pehle reservation fetch karo
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Role restriction check
    if (
      req.user.privilege === "PCC" &&
      reservation.status === "confirmed"
    ) {
      return res.status(403).json({
        title:"Appointment has been confirmed",
        message: "You are not allowed to update this appointment at this time. Please inform admin or CDS team to update.",
        type:"updated_not_allowed"
      }); 
    }
    
     const timezone = req.setting.timezone,
     start =req.body.start?toUTC(req.body.start,timezone):reservation.start,
     end = req.body.end?toUTC(req.body.end,timezone):reservation.end
    

      // Overlap check: exclude current reservation itself
    const conflictingReservation = await Reservation.findOne({
      where: {
        id: { [Op.ne]: id },
        providerId: reservation.providerId,
        status: { [Op.ne]: "cancelled" },
        [Op.or]: [
          {
            start: { [Op.lt]: end },
            end: { [Op.gt]: start },
          },
        ],
      },
    });

    if (conflictingReservation) {
      return res.status(400).json({
        title:"Time Slot Conflict",
        error: "This time slot conflicts with an already reserved slot for this provider.",
      });
    }
    // Agar CDS, Super Admin ya allowed PCC case hai → update kar do
    const updated = await Reservation.update({...req.body,start,end}, { where: { id } });

    if (updated[0] === 0) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    getIO().emit("scheduleUpdated");
    getIO().emit("scheduleDetailUpdated");
    const updatedReservation = await Reservation.findByPk(id);
    return res.status(200).json({
      message: "Reservation updated",
      data: updatedReservation,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to update reservation", error });
  }
};


exports.confirmReservation = async (req, res) => {
  try {
    const { id } = req.params;

    
    // Pehle reservation fetch karo
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Role check logic
    if (
      req.user.privilege === "PCC" && 
      reservation.status === "confirmed"
    ) {
      return res.status(403).json({
        message: "You are not allowed to edit this reservation",
      });
    }
 const timezone = req.setting.timezone
    const start = toUTC(req.body.start,timezone),
          end  = toUTC(req.body.end,timezone)
  
    // Agar CDS ya Super Admin hai, ya phir PCC but condition match nahi hui to allow update
    const updated = await Reservation.update(
      { 
        ...req.body,
        confirmedId: req.user.id,
        start,
        end,
        status: "confirmed",
        isCancelled: "no" 
      },
      { where: { id } }
    );

    if (updated[0] === 0) {
      return res.status(404).json({ message: "Reservation not found" });
    }
   getIO().emit("scheduleUpdated");
    getIO().emit("scheduleDetailUpdated");
    const updatedReservation = await Reservation.findByPk(id);
    return res.status(200).json({
      message: "Reservation updated",
      data: updatedReservation,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to update reservation", error });
  }
};



exports.cancellationAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    

    const updated = await Reservation.update({...req.body,status:"cancelled", isCancelled:"yes", reasonOfCancellation:req.body.reason}, { where: { id } });

    if (updated[0] === 0) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    getIO().emit("scheduleUpdated");
     getIO().emit("scheduleDetailUpdated");
    const updatedReservation = await Reservation.findByPk(id);
    res.status(200).json({ message: "Reservation updated", data: updatedReservation });
  } catch (error) {
    console.error(error);
  return  res.status(500).json({ message: "Failed to update reservation", error });
  }
};
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // update data dynamically build kare
    const updateData = { status };
    if (reason) {
      updateData.reasonOfCancellation = reason;
    }

    const updated = await Reservation.update(updateData, { where: { id } });

    if (updated[0] === 0) {
      return res.status(404).json({ message: "Reservation not found" });
    }
   getIO().emit("scheduleUpdated");
    getIO().emit("scheduleDetailUpdated");
    const updatedReservation = await Reservation.findByPk(id);
    return res.status(200).json({ 
      message: "Reservation updated", 
      data: updatedReservation 
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ 
      message: "Failed to update reservation", 
      error 
    });
  }
};




exports.deleteReservation = async (req, res) => {
  try {
    const { id } = req.params;

    // Pehle reservation fetch karo
    const reservation = await Reservation.findByPk(id);
    if (!reservation) {
      return res.status(404).json({ message: "Reservation not found" });
    }

    // Role restriction check
    if (
      req.user.privilege === "PCC" &&
      reservation.status === "confirm"
    ) {
      return res.status(403).json({
        title: "Appointment has been confirmed",
        message:
          "You are not allowed to delete this appointment at this time. Please inform Admin or CDS team to delete.",
          type:"updated_not_allowed"
      });
    }

    // Agar CDS / Super Admin hai ya allowed case hai to delete karo
    const deleted = await Reservation.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({ message: "Reservation not found" });
    }
    getIO().emit("scheduleUpdated");
     getIO().emit("scheduleDetailUpdated"); 
    return res
      .status(200)
      .json({ message: "Reservation deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Failed to delete reservation", error });
  }
};
