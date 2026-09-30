const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const { Op } = require("sequelize");
const Availability = require("../models/scheduler.model");
const TelehealthProvider = require("../models/provider.model");
const Reservation = require("../models/reservation.model");
const State = require("../models/states.model");

dayjs.extend(utc);

function parseCalendarDate(value) {
  return dayjs.utc(String(value).slice(0, 10));
}

function getReportRange({ dateRange = "thisMonth", customStartDate, customEndDate, startDate: requestedStart, endDate: requestedEnd }) {
  if (requestedStart || requestedEnd) {
    if (!requestedStart || !requestedEnd) return null;
    const start = parseCalendarDate(requestedStart).startOf("day");
    const end = parseCalendarDate(requestedEnd).endOf("day");
    return start.isValid() && end.isValid() && !end.isBefore(start) ? { startDate: start.toDate(), endDate: end.toDate() } : null;
  }

  const today = dayjs();
  let start;
  let end;

  switch (dateRange) {
    case "today":
      start = today.startOf("day");
      end = today.endOf("day");
      break;
    case "yesterday":
      start = today.subtract(1, "day").startOf("day");
      end = today.subtract(1, "day").endOf("day");
      break;
    case "thisWeek":
      start = today.startOf("week");
      end = today.endOf("week");
      break;
    case "lastWeek":
      start = today.subtract(1, "week").startOf("week");
      end = today.subtract(1, "week").endOf("week");
      break;
    case "lastMonth":
      start = today.subtract(1, "month").startOf("month");
      end = today.subtract(1, "month").endOf("month");
      break;
    case "thisYear":
      start = today.startOf("year");
      end = today.endOf("year");
      break;
    case "custom":
      if (!customStartDate || !customEndDate) return null;
      start = parseCalendarDate(customStartDate).startOf("day");
      end = parseCalendarDate(customEndDate).endOf("day");
      break;
    case "thisMonth":
      start = today.startOf("month");
      end = today.endOf("month");
      break;
    default:
      return null;
  }

  return start.isValid() && end.isValid() && !end.isBefore(start) ? { startDate: start.toDate(), endDate: end.toDate() } : null;
}

function overlapMs(startA, endA, startB, endB) {
  return Math.max(0, Math.min(new Date(endA).getTime(), new Date(endB).getTime()) - Math.max(new Date(startA).getTime(), new Date(startB).getTime()));
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

exports.getReservationCapacitySummary = async (req, res) => {
  try {
    const range = getReportRange(req.body || {});
    if (!range) {
      return res.status(400).json({ message: "Provide a valid dateRange or both startDate and endDate." });
    }

    const { startDate, endDate } = range;
    const { providerId, stateId } = req.body || {};
    const availabilityWhere = {
      [Op.and]: [
        { startTime: { [Op.lte]: endDate } },
        { endTime: { [Op.gte]: startDate } },
      ],
    };

    if (providerId && providerId !== "all") availabilityWhere.providerId = providerId;
    if (stateId && stateId !== "all") availabilityWhere.stateId = stateId;

    const availabilities = await Availability.findAll({
      where: availabilityWhere,
      attributes: ["id", "startTime", "endTime"],
      include: [{
        association: "reservations",
        required: false,
        attributes: ["id", "start", "end", "status"],
        where: {
          status: "reserved",
          start: { [Op.lte]: endDate },
          end: { [Op.gte]: startDate },
        },
      }],
    });

    let availableMs = 0;
    let reservedMs = 0;
    let reservationCount = 0;

    for (const availability of availabilities) {
      availableMs += overlapMs(availability.startTime, availability.endTime, startDate, endDate);
      for (const reservation of availability.reservations || []) {
        reservationCount += 1;
        reservedMs += overlapMs(reservation.start, reservation.end, startDate, endDate);
      }
    }

    const unusedCapacityMs = Math.max(0, availableMs - reservedMs);
    const utilization = availableMs > 0
      ? Number((Math.min(100, (reservedMs / availableMs) * 100)).toFixed(1))
      : 0;

    return res.json({
      success: true,
      dateRange: { startDate, endDate },
      summary: {
        utilizationPercent: utilization,
        reservationCount,
        availableSlotCount: availabilities.length,
        totalReservedTimeMinutes: Number((reservedMs / 60000).toFixed(2)),
        totalReservedTimeHours: Number((reservedMs / 3600000).toFixed(2)),
        totalReservedTimeFormatted: formatDuration(reservedMs),
        totalAvailableTimeMinutes: Number((availableMs / 60000).toFixed(2)),
        totalAvailableTimeHours: Number((availableMs / 3600000).toFixed(2)),
        totalAvailableTimeFormatted: formatDuration(availableMs),
        unusedCapacityMinutes: Number((unusedCapacityMs / 60000).toFixed(2)),
        unusedCapacityHours: Number((unusedCapacityMs / 3600000).toFixed(2)),
        unusedCapacityFormatted: formatDuration(unusedCapacityMs),
      },
    });
  } catch (error) {
    console.error("Error generating reservation capacity summary:", error);
    return res.status(500).json({ message: "Error generating reservation capacity summary." });
  }
};

exports.getProviderReservationChartData = async (req, res) => {
  try {
    const range = getReportRange(req.body || {});
    if (!range) {
      return res.status(400).json({ message: "Provide a valid dateRange or both startDate and endDate." });
    }

    const { startDate, endDate } = range;
    const { providerId, stateId } = req.body || {};
    const availabilityWhere = {
      [Op.and]: [
        { startTime: { [Op.lte]: endDate } },
        { endTime: { [Op.gte]: startDate } },
      ],
    };

    if (providerId && providerId !== "all") availabilityWhere.providerId = providerId;
    if (stateId && stateId !== "all") availabilityWhere.stateId = stateId;

    const availabilities = await Availability.findAll({
      where: availabilityWhere,
      attributes: ["id", "providerId", "startTime", "endTime"],
      include: [{
        association: "reservations",
        required: false,
        attributes: ["id", "start", "end", "status"],
        where: {
          status: "reserved",
          start: { [Op.lte]: endDate },
          end: { [Op.gte]: startDate },
        },
      }],
    });

    const providerIds = [...new Set(availabilities.map((availability) => availability.providerId))];
    const providers = providerIds.length
      ? await TelehealthProvider.findAll({
          where: { id: { [Op.in]: providerIds } },
          attributes: ["id", "firstName", "lastName"],
          order: [["firstName", "ASC"], ["lastName", "ASC"]],
        })
      : [];

    const chartDataByProvider = new Map(providers.map((provider) => [provider.id, {
      name: `Dr. ${provider.firstName} ${provider.lastName}`.trim(),
      totalAvailable: 0,
      totalReserved: 0,
      totalBookedSlot: 0,
      totalAvailableMinutes: 0,
      totalReservedMinutes: 0,
      totalAvailableSlots: 0,
    }]));

    for (const availability of availabilities) {
      const chartData = chartDataByProvider.get(availability.providerId);
      if (!chartData) continue;

      const availableMs = overlapMs(availability.startTime, availability.endTime, startDate, endDate);
      chartData.totalAvailable += availableMs / 3600000;
      chartData.totalAvailableMinutes += availableMs / 60000;
      chartData.totalAvailableSlots += 1;

      for (const reservation of availability.reservations || []) {
        const reservedMs = overlapMs(reservation.start, reservation.end, startDate, endDate);
        chartData.totalReserved += reservedMs / 3600000;
        chartData.totalReservedMinutes += reservedMs / 60000;
        chartData.totalBookedSlot += 1;
      }
    }

    const chartData = Array.from(chartDataByProvider.values(), (providerData) => ({
      ...providerData,
      totalAvailable: Number(providerData.totalAvailable.toFixed(2)),
      totalReserved: Number(providerData.totalReserved.toFixed(2)),
      totalAvailableMinutes: Number(providerData.totalAvailableMinutes.toFixed(2)),
      totalReservedMinutes: Number(providerData.totalReservedMinutes.toFixed(2)),
    }));

    return res.json({
      success: true,
      dateRange: { startDate, endDate },
      chartData,
    });
  } catch (error) {
    console.error("Error generating provider reservation chart data:", error);
    return res.status(500).json({ message: "Error generating provider reservation chart data." });
  }
};

exports.getStateReservationChartData = async (req, res) => {
  try {
    const range = getReportRange(req.body || {});
    if (!range) {
      return res.status(400).json({ message: "Provide a valid dateRange or both startDate and endDate." });
    }

    const { startDate, endDate } = range;
    const { providerId, stateId } = req.body || {};
    const stateWhere = stateId && stateId !== "all" ? { id: stateId } : {};
    const reservationWhere = {
      status: "reserved",
      start: { [Op.lte]: endDate },
      end: { [Op.gte]: startDate },
    };

    if (providerId && providerId !== "all") reservationWhere.providerId = providerId;
    if (stateId && stateId !== "all") reservationWhere.stateId = stateId;

    const [states, reservations] = await Promise.all([
      State.findAll({
        where: stateWhere,
        attributes: ["id", "stateName", "stateCode"],
        order: [["stateName", "ASC"]],
      }),
      Reservation.findAll({
        where: reservationWhere,
        attributes: ["stateId", "start", "end"],
      }),
    ]);

    const totalsByState = new Map(states.map((state) => [state.id, {
      name: `${state.stateName} (${state.stateCode})`,
      stateName: state.stateName,
      stateCode: state.stateCode,
      totalReservedHours: 0,
      totalReservedMinutes: 0,
      totalReservedSlots: 0,
    }]));

    for (const reservation of reservations) {
      const totals = totalsByState.get(reservation.stateId);
      if (!totals) continue;

      const reservedMs = overlapMs(reservation.start, reservation.end, startDate, endDate);
      totals.totalReservedHours += reservedMs / 3600000;
      totals.totalReservedMinutes += reservedMs / 60000;
      totals.totalReservedSlots += 1;
    }

    const chartData = Array.from(totalsByState.values())
      .filter((totals) => totals.totalReservedSlots > 0)
      .map((totals) => ({
        ...totals,
        totalReservedHours: Number(totals.totalReservedHours.toFixed(2)),
        totalReservedMinutes: Number(totals.totalReservedMinutes.toFixed(2)),
      }));

    return res.json({
      success: true,
      dateRange: { startDate, endDate },
      chartData,
    });
  } catch (error) {
    console.error("Error generating state reservation chart data:", error);
    return res.status(500).json({ message: "Error generating state reservation chart data." });
  }
};

exports.getDoctorReservationsByState = async (req, res) => {
  try {
    const range = getReportRange(req.body || {});
    if (!range) {
      return res.status(400).json({ message: "Provide a valid dateRange or both startDate and endDate." });
    }

    const { startDate, endDate } = range;
    const { providerId, stateId } = req.body || {};
    const providerWhere = providerId && providerId !== "all" ? { id: providerId } : {};
    const stateWhere = stateId && stateId !== "all" ? { id: stateId } : {};
    const reservationWhere = {
      status: "reserved",
      start: { [Op.lte]: endDate },
      end: { [Op.gte]: startDate },
    };

    if (providerId && providerId !== "all") reservationWhere.providerId = providerId;
    if (stateId && stateId !== "all") reservationWhere.stateId = stateId;

    const [providers, states, reservations] = await Promise.all([
      TelehealthProvider.findAll({
        where: providerWhere,
        attributes: ["id", "firstName", "lastName"],
        order: [["firstName", "ASC"], ["lastName", "ASC"]],
      }),
      State.findAll({
        where: stateWhere,
        attributes: ["id", "stateName", "stateCode"],
        order: [["stateName", "ASC"]],
      }),
      Reservation.findAll({
        where: reservationWhere,
        attributes: ["providerId", "stateId", "start", "end"],
      }),
    ]);

    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const stateById = new Map(states.map((state) => [state.id, state]));
    const countsByProvider = new Map();

    for (const reservation of reservations) {
      const provider = providerById.get(reservation.providerId);
      const state = stateById.get(reservation.stateId);
      if (!provider || !state) continue;

      if (!countsByProvider.has(provider.id)) {
        countsByProvider.set(provider.id, {
          byState: new Map(),
          reservedMs: 0,
          reservedSlots: 0,
        });
      }
      const providerCounts = countsByProvider.get(provider.id);
      const reservedMs = overlapMs(reservation.start, reservation.end, startDate, endDate);
      const stateCounts = providerCounts.byState.get(state.id) || { reservedMs: 0, reservedSlots: 0 };
      stateCounts.reservedMs += reservedMs;
      stateCounts.reservedSlots += 1;
      providerCounts.byState.set(state.id, stateCounts);
      providerCounts.reservedMs += reservedMs;
      providerCounts.reservedSlots += 1;
    }

    const tableStates = [...states].sort((firstState, secondState) => {
      if (firstState.stateCode === "BL") return 1;
      if (secondState.stateCode === "BL") return -1;
      return 0;
    });
    const columns = [
      { key: "doctor", label: "Doctor/State" },
      ...tableStates.flatMap((state) => [
        { key: state.stateCode, label: `${state.stateCode} Reserved Slots` },
        { key: `${state.stateCode}ReservedHours`, label: `${state.stateCode} Reserved Hours` },
        { key: `${state.stateCode}ReservedMinutes`, label: `${state.stateCode} Reserved Minutes` },
      ]),
      { key: "totalReservedHours", label: "Total Reserved Hours" },
      { key: "totalReservedMinutes", label: "Total Reserved Minutes" },
      { key: "totalReservedSlots", label: "Total Reserved Slots" },
    ];
    const rows = providers
      .filter((provider) => countsByProvider.has(provider.id))
      .map((provider) => {
        const providerCounts = countsByProvider.get(provider.id);
        const row = {
          providerId: provider.id,
          doctor: `Dr. ${provider.firstName} ${provider.lastName}`.trim(),
          totalReservedHours: Number((providerCounts.reservedMs / 3600000).toFixed(2)),
          totalReservedMinutes: Number((providerCounts.reservedMs / 60000).toFixed(2)),
          totalReservedSlots: providerCounts.reservedSlots,
        };

        for (const state of tableStates) {
          const stateCounts = providerCounts.byState.get(state.id) || { reservedMs: 0, reservedSlots: 0 };
          row[state.stateCode] = stateCounts.reservedSlots;
          row[`${state.stateCode}ReservedHours`] = Number((stateCounts.reservedMs / 3600000).toFixed(2));
          row[`${state.stateCode}ReservedMinutes`] = Number((stateCounts.reservedMs / 60000).toFixed(2));
        }

        return row;
      });

    const totalReservedMs = [...countsByProvider.values()]
      .reduce((total, providerCounts) => total + providerCounts.reservedMs, 0);
    const totalReservedSlots = [...countsByProvider.values()]
      .reduce((total, providerCounts) => total + providerCounts.reservedSlots, 0);
    const totalRow = {
      doctor: "Total",
      isTotal: true,
      totalReservedHours: Number((totalReservedMs / 3600000).toFixed(2)),
      totalReservedMinutes: Number((totalReservedMs / 60000).toFixed(2)),
      totalReservedSlots,
    };
    for (const state of tableStates) {
      const stateTotals = [...countsByProvider.values()].reduce((totals, providerCounts) => {
        const counts = providerCounts.byState.get(state.id);
        totals.reservedMs += counts?.reservedMs || 0;
        totals.reservedSlots += counts?.reservedSlots || 0;
        return totals;
      }, { reservedMs: 0, reservedSlots: 0 });

      totalRow[state.stateCode] = stateTotals.reservedSlots;
      totalRow[`${state.stateCode}ReservedHours`] = Number((stateTotals.reservedMs / 3600000).toFixed(2));
      totalRow[`${state.stateCode}ReservedMinutes`] = Number((stateTotals.reservedMs / 60000).toFixed(2));
    }
    rows.push(totalRow);

    return res.json({
      success: true,
      dateRange: { startDate, endDate },
      table: { columns, rows },
    });
  } catch (error) {
    console.error("Error generating doctor reservations by state:", error);
    return res.status(500).json({ message: "Error generating doctor reservations by state." });
  }
};