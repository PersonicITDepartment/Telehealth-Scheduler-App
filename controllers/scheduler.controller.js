const Availability = require('../models/scheduler.model');
const Provider = require('../models/provider.model');
const State = require('../models/states.model');
const User = require('../models/user.model');
const Reservation = require('../models/reservation.model');
const { Op, Sequelize } = require('sequelize');
const { AccessControl, unAuthorizedAccessResponse, toUTC, toLocalTz } = require('../Utils/services');
const { USER_ROLE } = require('./privilliges.controller');
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { getIO } = require('../socket');

dayjs.extend(utc);
dayjs.extend(timezone);
const toTimestamp = (dateTimeString) => {
  // Replace space with "T" and treat as UTC
  const utcString = dateTimeString.replace(" ", "T") + "Z";
  return new Date(utcString).toISOString();
};
// Create a new schedule
exports.createAvailability = async (req, res) => {

  const { providerId, date, startTime: startFrom, endTime: endFrom, timezone } = req.body;

  try {


    const startTime = toUTC(startFrom, timezone)
    const endTime = toUTC(endFrom, timezone)



    if ([USER_ROLE.DSS, USER_ROLE.SUPER_ADMIN].includes(req.user.privilege)) {
      // AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);
      // Check overlapping slots for same provider/state
      const overlap = await Availability.findOne({
        where: {
          providerId,

          [Op.or]: [
            { startTime: { [Op.between]: [startTime, endTime] } },
            { endTime: { [Op.between]: [startTime, endTime] } },
            { startTime: { [Op.lte]: startTime }, endTime: { [Op.gte]: endTime } }
          ]
        }
      });

      if (overlap) {
        return res.status(400).json({ message: 'Slot already exists for this provider/state' });
      }

      const schedule = await Availability.create({ providerId, date, startTime, endTime, timezone, createdBy: req.user.id });

      getIO().emit("scheduleUpdated");
      return res.status(201).json(schedule);
    }

    return res.status(401).json(unAuthorizedAccessResponse)
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
//  check conflict 
exports.checkAvailabilityConflict = async (req, res) => {
  try {

    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);

    const { providerId, date, startTime: startFrom, endTime: endWith,timezone="EST" } = req.body;



    const startTime = toUTC(startFrom,timezone)
    const endTime= toUTC(endWith,timezone)
   
    // Conflict check (time overlapping logic)
    const conflict = await Availability.findOne({
      where: {
        providerId,

        [Op.or]: [
          { startTime: { [Op.between]: [startTime, endTime] } },
          { endTime: { [Op.between]: [startTime, endTime] } },
          { startTime: { [Op.lte]: startTime }, endTime: { [Op.gte]: endTime } }
        ]
      },
      include: [
        { model: Provider, attributes: ['id', 'firstName', 'lastName', "suffix"] },
        { model: State, attributes: ['id', 'stateName'] }
      ]
    });

 
    if (conflict) {
      return res.status(200).json({
        name: "Conflict",
        error: "Schedule conflict detected",
        conflictDetails: {
          provider: `${conflict.TelehealthProvider.suffix} ${conflict.TelehealthProvider.firstName} ${conflict.TelehealthProvider.lastName}`,
          state: conflict.State?.stateName,
          existingSlot: {
            startTime: toLocalTz(conflict.startTime,conflict?.timezone),
            endTime: toLocalTz(conflict.endTime,conflict?.timezone),
            timezone:conflict?.timezone,
            status: conflict?.status
          }
        }
      });
    }

    return res.json({ message: "No conflicts detected. Slot is available.", name: "No Conflict" });

  } catch (error) {
    console.error("Error creating availability:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


const TIMEZONES = {
  EST: "America/New_York",
  CST: "America/Chicago",
};
function convertTimeZone(dateTime, from, to) {

  if (from == to || !from || !to) {
    return dayjs.utc(dateTime).format("YYYY-MM-DD HH:mm:ss")
  }

  return dayjs.tz(dayjs.utc(dateTime).format("YYYY-MM-DD HH:mm:ss"), TIMEZONES[from]).tz(TIMEZONES[to]).format("YYYY-MM-DD HH:mm:ss");

}

exports.getAvailability = async (req, res) => {
  try {
    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);
    const userTimezone = req.setting.timezone

    const { startingTime, endTime } = req.query;
    let availabilityWhere = {};

    if (startingTime && endTime) {
      let start = new Date(startingTime);
      let end = new Date(endTime);

      // Always extend the end date to the end of the day
      end.setHours(23, 59, 59, 999);

      // Optional: ensure start date begins at 00:00:00 for full-day coverage
      start.setHours(0, 0, 0, 0);

      availabilityWhere.startTime = {
        [Op.between]: [start, end]
      };
    } else {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      const oneWeekLater = new Date();
      oneWeekLater.setDate(oneWeekLater.getDate() + 7);
      const endOfWeek = new Date(oneWeekLater.setHours(23, 59, 59, 999));

      availabilityWhere.startTime = {
        [Op.between]: [startOfDay, endOfWeek]
      };
    }

    const providers = await Provider.findAll({
      attributes: ['id', 'suffix', 'firstName', 'stateLicenses', 'lastName', 'specialty'],
      include: [
        {
          model: Availability,
          required: true,
          attributes: ['id', 'startTime', 'endTime', 'status', 'timezone'],
          where: availabilityWhere,
          include: [
            { model: State, attributes: ["id", 'stateName'] },
            {
              model: User,
              as: "confirmedUser",
              attributes: ['id', "firstName", "lastName", 'email', "status"]
            },
            {
              model: User,
              as: "reservedUser",
              attributes: ['id', "firstName", "lastName", 'email', "status"]
            },
            {
              model: Reservation,
              as: "reservations",
              attributes: ['id', 'start', 'end', 'duration', 'status', 'isCancelled', "reasonOfCancellation", "notes", "timezone"],
              include: [
                { model: State, as: "state" },
                { model: User, as: "reservedUser", attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile", "status", "designation"] },
                { model: User, as: "confirmedUser", attributes: ['id', "firstName", "lastName", 'email', 'privilege', "profile", "status", "designation"] }
              ]
            }
          ]
        }
      ]
    });



    const response = await Promise.all(
      providers.map(async (provider) => {
        const states = await State.findAll({
          where: { stateCode: provider.stateLicenses },
          attributes: ["stateCode", "stateName", "id"],
        });

        return {
          id: provider.id,
          name: `${provider.suffix} ${provider.firstName} ${provider.lastName}`,
          specialty: provider.specialty,
          stateLicenses: [...new Set(states)],
          schedule: provider.Availabilities.map((slot) => {
            const start = new Date(slot.startTime);
            const end = new Date(slot.endTime);

            const totalDuration = Math.floor((end - start) / (1000 * 60));

            // ✅ Reservation duration sum
            const reservationDuration =
              slot.reservations?.reduce((sum, r) => {
                return sum + (r.duration || 0);
              }, 0) || 0;

            const availableDuration = totalDuration - reservationDuration;

            // ✅ Random messages list
            const messages = [
              "Running late",
              "Hey, I am coming late",
              "Sorry for delay",
              "Got stuck in traffic",
              "Be there shortly",
            ];

            const sortedReservations =
              slot.reservations
                // ?.filter(r => r.isCancelled === "no") // ✅ First filter out cancelled ones
                ?.sort((a, b) =>
                  dayjs(a.start).diff(
                    dayjs(b.start)
                  )
                )
                ?.map((r, idx, arr) => {
                  const startR = dayjs(r.start);
                  const endR = dayjs(r.end);

                  let overlap = null;

                  if (idx > 0) {
                    const prev = arr[idx - 1];
                    const prevEnd = dayjs(
                      prev.end // ✅ Use prev.timezone
                    );

                    // ✅ Check if current reservation starts before previous one ends
                    if (startR.isBefore(prevEnd)) {
                      const overlapMinutes = prevEnd.diff(startR, "minute");

                      const randomMsg =
                        messages[Math.floor(Math.random() * messages.length)];

                      overlap = {
                        overlapTime: overlapMinutes,
                        message: randomMsg,
                        previousReservationId: prev.id, // ✅ Added for debugging
                      };
                    }
                  }

                  return {
                    id: r.id,
                    start: toLocalTz(r.start, userTimezone ? userTimezone : slot?.timezone),
                    end: toLocalTz(r.end, userTimezone ? userTimezone : slot?.timezone),
                    duration: r.duration,
                    status: r.status,
                    isCancelled: r.isCancelled,
                    reasonOfCancellation: r.reasonOfCancellation,
                    reservedUser: r.reservedUser,
                    confirmedUser: r.confirmedUser,
                    state: r.state,
                    notes: r.notes,
                    timezone: r.timezone,
                    ...(overlap ? { overlap } : {}),
                  };
                }) || [];



            return {
              id: slot.id,
              date: start.toISOString().split("T")[0],
              availableTime: {
                start: toLocalTz(slot.startTime, userTimezone ? userTimezone : timezone),
                end: toLocalTz(slot.endTime, userTimezone ? userTimezone : timezone),
                timezone: slot.timezone
              },
              time: `${dayjs(toLocalTz(start, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")} - ${dayjs(toLocalTz(end, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")}`,
              duration: totalDuration,
              availableDuration,
              status: slot.status,
              state: slot.State?.stateName || null,
              reservedUser: slot.reservedUser || null,
              confirmedUser: slot.confirmedUser || null,
              timezone: slot.timezone,
              reservations: sortedReservations,
            };
          }),
        };
      })
    );

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

exports.getAvailabilityByUser = async (req, res) => {
  try {
    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);

    const { providerId } = req.params;
    const { startingTime, endTime } = req.query;
    let availabilityWhere = {};

    if (startingTime && endTime) {
      availabilityWhere.startTime = {
        [Op.between]: [new Date(startingTime), new Date(endTime)]
      };
    } else {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      const oneWeekLater = new Date();
      oneWeekLater.setDate(oneWeekLater.getDate() + 7);
      const endOfWeek = new Date(oneWeekLater.setHours(23, 59, 59, 999));

      availabilityWhere.startTime = {
        [Op.between]: [startOfDay, endOfWeek]
      };
    }

    const provider = await Provider.findOne({
      where: { id: providerId },
      attributes: ['id', 'suffix', 'firstName', 'stateLicenses', 'lastName', 'specialty'],
      include: [
        {
          model: Availability,
          required: true,
          attributes: ['id', 'startTime', 'endTime', 'status', 'timezone'],
          // where: availabi  lityWhere,
          include: [
            { model: State, attributes: ["id", 'stateName'] },
            {
              model: User,
              as: "confirmedUser",
              attributes: ['id', "firstName", "lastName", 'email', "status", "designation"]
            },
            {
              model: User,
              as: "reservedUser",
              attributes: ['id', "firstName", "lastName", 'email', "status", "designation"]
            },
            {
              model: Reservation,
              as: "reservations",
              attributes: ['id', 'start', 'end', 'duration', 'status', 'isCancelled', "reasonOfCancellation", "notes"],
              include: [
                { model: State, as: "state" },
                { model: User, as: "reservedUser", attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile", "status", "designation"] },
                { model: User, as: "confirmedUser", attributes: ['id', "firstName", "lastName", 'email', 'privilege', "profile", "status", "designation"] }
              ]
            }
          ]
        }
      ]
    });

    const userTimezone = req.setting.timezone
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const states = await State.findAll({
      where: { stateCode: provider.stateLicenses },
      attributes: ["stateCode", "stateName", "id"],
    });
    const response = {
      id: provider.id,
      name: `${provider.suffix} ${provider.firstName} ${provider.lastName}`,
      specialty: provider.specialty,
      stateLicenses: [...new Set(states)],
      schedule: provider.Availabilities.map((slot) => {
        const start = new Date(slot.startTime);
        const end = new Date(slot.endTime);

        const totalDuration = Math.floor((end - start) / (1000 * 60));

        // ✅ Reservation duration sum
        const reservationDuration =
          slot.reservations?.reduce((sum, r) => {

            return sum + (r.duration || 0);

          }, 0) || 0;

        const availableDuration = totalDuration - reservationDuration;

        return {
          id: slot.id,
          // 👇 Database wali exact date & time
          startTime: toLocalTz(slot.startTime,userTimezone?userTimezone:slot?.timezone),
          endTime: toLocalTz(slot.endTime,userTimezone?userTimezone:slot?.timezone),
         availableTime: {
                start: toLocalTz(slot.startTime, userTimezone ? userTimezone : timezone),
                end: toLocalTz(slot.endTime, userTimezone ? userTimezone : timezone),
                timezone: slot.timezone
              },
              time: `${dayjs(toLocalTz(start, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")} - ${dayjs(toLocalTz(end, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")}`,
            
          date: dayjs(slot?.startTime).format("YYYY-MM-DD"), // sirf date ke liye
          // date: "", // sirf date ke liye
          duration: totalDuration,
          availableDuration, // ✅ new field
          status: slot.status,
          state: slot.State?.stateName || null,
          reservedUser: slot.reservedUser || null,
          confirmedUser: slot.confirmedUser || null,
          timezone: slot.timezone,
          reservations:
            slot.reservations
              ?.sort((a, b) => new Date(a.start) - new Date(b.start))
              .map((r) => ({
                id: r.id,
                start: toLocalTz(r.start,userTimezone?userTimezone:slot?.timezone), // 👈 DB wali value
                end: toLocalTz(r.end,userTimezone?userTimezone:slot?.timezone), // 👈 DB wali value
                
                duration: r.duration,
                status: r.status,
                notes: r.notes,
                isCancelled: r.isCancelled,
                reasonOfCancellation: r.reasonOfCancellation,
                reservedUser: r.reservedUser,
                confirmedUser: r.confirmedUser,
                state: r.state,
              })) || [],
        };
      }),
    };



    return res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};
exports.getReservationDetailByReserveId = async (req, res) => {
  try {
    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);

    const { reservationId } = req.params;

    const userTimezone = req.setting.timezone
    const provider = await Provider.findOne({
      attributes: ['id', 'suffix', 'firstName', 'stateLicenses', 'lastName', 'specialty'],
      include: [
        {
          model: Availability,
          required: true,
          attributes: ['id', 'startTime', 'endTime', 'status', 'timezone'],
          include: [
            { model: State, attributes: ["id", 'stateName', "stateCode", "details", "timezone", "createdAt", "updatedAt"] },
            {
              model: User,
              as: "confirmedUser",
              attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile"]
            },
            {
              model: User,
              as: "reservedUser",
              attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile"]
            },
            {
              model: Reservation,
              as: "reservations",
              attributes: ['id', 'start', 'end', 'duration', 'status', 'isCancelled', "reasonOfCancellation", "notes", "availabilityId", "timezone","updatedAt"],
              where: { id: reservationId },
              include: [
                { model: State, as: "state" },
                { model: User, as: "reservedUser", attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile", "status", "designation"] },
                { model: User, as: "confirmedUser", attributes: ['id', "firstName", "lastName", 'email', 'privilege', "profile", "status", "designation"] }
              ]
            }
          ]
        }
      ]
    });

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const states = await State.findAll({
      where: { stateCode: provider.stateLicenses },
      attributes: ["stateCode", "stateName", "id"],
    });




    // const reservationAllbyAvwholeailibilityId = await Reservation.findAll({ where: { availabilityId: provider?.Availabilities[0]?.reservations[0]?.availabilityId } })
    // 🔥 first reservation pick (since where:id already ensures single reservation)
    const mainReservation = provider?.Availabilities[0]?.reservations[0] || null;


    const overlap = null;
    // const overlap = checkMainReservationOverlap(mainReservation, reservationAllbyAvwholeailibilityId, provider.Availabilities[0].timezone)
    const response = {
      ...(mainReservation ? {
        id: mainReservation.id,
        start: toLocalTz(mainReservation.start, userTimezone ? userTimezone : mainReservation?.timezone),
        end: toLocalTz(mainReservation.end, userTimezone ? userTimezone : mainReservation?.timezone),
        duration: mainReservation.duration,
        status: mainReservation.status,
        isCancelled: mainReservation.isCancelled,
        reasonOfCancellation: mainReservation.reasonOfCancellation,
        reservedUser: mainReservation.reservedUser,
        confirmedUser: mainReservation.confirmedUser,
        state: mainReservation.state,
        notes: mainReservation.notes,
        timezone: mainReservation.timezone,
        updatedAt:mainReservation.updatedAt
      } : {}),
      doctor: {
        id: provider.id,
        name: `${provider.suffix} ${provider.firstName} ${provider.lastName}`,
        specialty: provider.specialty,
        stateLicenses: [...new Set(states.map(s => ({
          stateCode: s.stateCode,
          stateName: s.stateName,
          id: s.id
        })))],
        schedule: provider.Availabilities.map((slot) => {
          const start = new Date(slot.startTime);
          const end = new Date(slot.endTime);

          const totalDuration = Math.floor((end - start) / (1000 * 60));

          // ✅ Reservation duration sum
          const reservationDuration = slot.reservations?.reduce((sum, r) => {

            return sum + (r.duration || 0);

          }, 0) || 0;

          const availableDuration = totalDuration - reservationDuration;

          return {
            id: slot.id,
            date: start.toISOString().split("T")[0],
            availableTime: {
              start: toLocalTz(slot.startTime, userTimezone ? userTimezone : timezone),
              end: toLocalTz(slot.endTime, userTimezone ? userTimezone : timezone),
              timezone: slot.timezone
            },
            time: `${dayjs(toLocalTz(start, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")} - ${dayjs(toLocalTz(end, userTimezone ? userTimezone : slot?.timezone)).format("hh:mm A")}`,

            duration: totalDuration,
            availableDuration,
            status: slot.status,
            state: slot.State || null,
            reservedUser: slot.reservedUser || null,
            confirmedUser: slot.confirmedUser || null,
            timezone: slot.timezone,
            reservations: slot.reservations
              ?.sort((a, b) => new Date(a.start) - new Date(b.start))
              .map(r => ({
                id: r.id,
                start: toLocalTz(r.start, userTimezone ? userTimezone : slot?.timezone),
                end: toLocalTz(r.start, userTimezone ? userTimezone : slot?.timezone),
                duration: r.duration,
                status: r.status,
                notes: r.notes,
                isCancelled: r.isCancelled,
                reasonOfCancellation: r.reasonOfCancellation,
                reservedUser: r.reservedUser,
                confirmedUser: r.confirmedUser,
                state: r.state,

              })) || []
          };
        }),
      },
      schedule: provider.Availabilities[0] ? {
        ...provider.Availabilities[0].get(),
        reservations: provider.Availabilities[0].reservations
      } : null,
      overlap
    };

    return res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};



exports.getAvailabilityById = async (req, res) => {
  try {
    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);

    const { id } = req.params; // URL se id nikal lo

    const slot = await Availability.findByPk(id, {
      attributes: ['id', 'startTime', 'endTime', 'status'],
      include: [
        { model: Provider, attributes: ['firstName', 'lastName'] },
        { model: State, attributes: ['stateName'] }
      ]
    });

    if (!slot) {
      return res.status(404).json({ message: "Availability not found" });
    }

    return res.json(slot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};





exports.updateStatus = async (req, res, next) => {
  try {
    AccessControl.authorizeByPrivileges(['CDS', 'PCC', 'PCM', 'superadmin'], req.user, res);

    const { id } = req.params;
    const { stateId } = req.body;

    const slot = await Availability.findByPk(id);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    // The PCC is not allowed to confirm slots
    if (AccessControl.authorizeByPrivileges(["CDS", "PCM", "superadmin"], req.user)) {
      slot.status = "Confirmed";
      slot.confirmedBy = req.user.id;
    }


    // The CDS is not allowed to reserve slots
    if (AccessControl.authorizeByPrivileges(["PCC", "PCM", "superadmin"], req.user)) {
      slot.status = "Reserved";
      slot.reservedBy = req.user.id;
      slot.stateId = stateId
    }

    await slot.save();

    // Fetch again with joined users
    const updatedSlot = await Availability.findByPk(id, {
      include: [
        { model: User, as: "confirmedUser", attributes: ["id", "firstName", "LastName", "email"] },
        { model: User, as: "reservedUser", attributes: ["id", "firstName", "LastName", "email"] }
      ]
    });

    getIO().emit("scheduleUpdated");
    return res.json(updatedSlot);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};


exports.deleteAvailability = async (req, res) => {
  try {
    AccessControl.authorizeByPrivileges(['CDS', 'PCC', "DSS", "PCM", 'superadmin'], req.user, res);
    const { privilege: u_role } = req.user
    //  Super Admin can delete availibility record
    const { id } = req.params;

    if ([USER_ROLE.SUPER_ADMIN, USER_ROLE.PCM, USER_ROLE.CDS].includes(u_role)) {

      const slot = await Availability.findByPk(id);
      if (!slot) return res.status(404).json({ message: 'Slot not found' });
      await slot.destroy();
      return res.json({ message: 'Slot deleted successfully' });
    }

    else if ([USER_ROLE.DSS].includes(u_role)) {
      const slot = await Availability.findOne({
        where: {
          id: id,
          createdBy: req.user.id
        }
      });
      if (!slot) return res.status(404).json({ message: 'Slot not found' });
      await slot.destroy();
      getIO().emit("scheduleUpdated");
      return res.status(200).json({ message: 'Slot deleted successfully' });
    }
    return res.status(401).json(unAuthorizedAccessResponse)
  } catch (error) {

    return res.status(500).json({ message: error.message || 'Server Error' });
  }
};



exports.updateAvailability = async (req, res) => {
  try {


    // Super Admin, DSS and CDS can only update availability

    if ([USER_ROLE.SUPER_ADMIN, USER_ROLE.DSS, USER_ROLE.CDS].includes(req.user.privilege)) {

      const { id } = req.params;
      const {
        // providerId,
        // stateId,
        startTime,
        endTime,
        timezone,
        date
        // status,
        // confirmedBy,
        // reservedBy,
        // createdBy
      } = req.body;


      const start = toUTC(`${date} ${startTime}`, timezone),
        end = toUTC(`${date} ${endTime}`, timezone)
      // Record find karo
      const availability = await Availability.findByPk(id);
      if (!availability) {
        return res.status(404).json({ message: "Availability not found" });
      }

      // Update fields
      // availability.providerId = providerId ?? availability.providerId;
      // availability.stateId = stateId ?? availability.stateId;
      availability.startTime = start ?? availability.startTime;
      availability.endTime = end ?? availability.endTime;
      availability.timezone = timezone ?? availability.timezone;
      // availability.status = status ?? availability.status;
      // availability.confirmedBy = confirmedBy ?? availability.confirmedBy;
      // availability.reservedBy = reservedBy ?? availability.reservedBy;
      // availability.createdBy = createdBy ?? availability.createdBy;


      await availability.save();
      getIO().emit("scheduleUpdated");
      return res.json({
        message: "Availability updated successfully",
        data: availability,

      });
    }

    res.status(401).json(unAuthorizedAccessResponse)
  } catch (error) {
    console.error("Update Availability Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};






// ✅ Convert datetime from fromTZ to UTC for comparison
function convertTimeZoneV1(datetime, fromTZ, toTZ) {
  return dayjs.tz(datetime, fromTZ).tz(toTZ).format();
}

function checkMainReservationOverlap(mainReservation, allReservations, slotTimezone) {
  if (!mainReservation) return null;

  const messages = [
    "Running late",
    "Hey, I am coming late",
    "Sorry for delay",
    "Got stuck in traffic",
    "Be there shortly",
  ];

  // ✅ Filter aur sort karo - same logic as first code
  const sortedReservations = allReservations
    .filter(r => r.status != "cancelled") // Only active reservations
    .sort((a, b) =>
      dayjs(convertTimeZoneV1(a.start, a.timezone, slotTimezone)).diff(
        dayjs(convertTimeZoneV1(b.start, b.timezone, slotTimezone))
      )
    );

  // ✅ Main reservation ko find karo sorted list mein
  const mainIndex = sortedReservations.findIndex(r => r.id === mainReservation.id);

  if (mainIndex === -1) return null;

  const mainStartInSlotTZ = dayjs(convertTimeZoneV1(
    mainReservation.start,
    mainReservation.timezone,
    slotTimezone
  ));
  const mainEndInSlotTZ = dayjs(convertTimeZoneV1(
    mainReservation.end,
    mainReservation.timezone,
    slotTimezone
  ));

  let overlap = null;


  // ✅ Check with NEXT reservation bhi (reverse check)
  if (!overlap && mainIndex < sortedReservations.length - 1) {
    const next = sortedReservations[mainIndex + 1];
    const nextStart = dayjs(
      convertTimeZoneV1(next.start, next.timezone, slotTimezone)
    );

    // Agar next reservation main ke end se pehle start ho raha hai
    if (nextStart.isBefore(mainEndInSlotTZ)) {
      const overlapMinutes = mainEndInSlotTZ.diff(nextStart, "minute");

      const randomMsg = messages[Math.floor(Math.random() * messages.length)];

      overlap = {
        type: "overlaps_with_next",
        overlapWith: next.id,
        overlapWithUser: next.reservedUser || next.confirmedUser,
        overlapTime: overlapMinutes,
        message: randomMsg,
        nextReservationId: next.id,
        details: `This reservation ends after next reservation starts (${overlapMinutes} min overlap)`
      };
    }
  }

  return overlap;
}



exports.recentSchedule = async (req, res) => {
  try {
    AccessControl.allUsers(req.user, res, ['CDS', 'PCC', "DSS", "PCM", 'superadmin']);

    // Get recent 5 reservations, sorted by most recent start time
    const reservations = await Reservation.findAll({
      limit: 5,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'start', 'end', "status", "notes", "reasonOfCancellation", "timezone"],
      include: [
        {
          model: Availability,
          as: "availability",
          attributes: ['id', 'timezone'],
          include: [
            {
              model: Provider,
              attributes: ['suffix', 'firstName', 'lastName'],
            }
          ]
        }
      ]
    });
    const userTimezone = req.setting.timezone

    // Format the result
    const response = reservations.map(r => {
      const doctor = r.availability?.TelehealthProvider;
      // const start = new Date(r.start);
      const start = toLocalTz(r.start,userTimezone?userTimezone:  r.availability.timezone);
      const end = toLocalTz(r.end, userTimezone?userTimezone:r.availability.timezone);



      return {
        reservationId: r.id,
        doctorName: doctor ? `${doctor.suffix} ${doctor.firstName} ${doctor.lastName}` : 'N/A',
        status: r.status,
        notes: r.notes,
        reasonOfCancellation: r.reasonOfCancellation,
        appointmentDate: dayjs(start).format("MMM-DD-YY"),
        appointmentTime: `${dayjs(start).format("hh:mm A")} - ${dayjs(end).format("hh:mm A")}`,
      };
    });

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};



