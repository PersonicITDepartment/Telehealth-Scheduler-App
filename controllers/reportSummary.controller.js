// controllers/report.controller.js
const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
const ExcelJS = require("exceljs");
const { Op } = require("sequelize");

dayjs.extend(relativeTime);

const Availability = require("../models/scheduler.model"); // Availability
const Reservation = require("../models/reservation.model");
const TelehealthProvider = require("../models/provider.model");
const State = require("../models/states.model");
const Report = require("../models/reports.model");
const User = require("../models/user.model");

/* --------------------------------- HELPERS -------------------------------- */

const REPORTS_DIR = path.join(__dirname, "../public/reports");

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/** Overlap milliseconds between two [start,end) intervals */
function overlapMs(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return Math.max(0, end - start);
}

// function msToHours(ms, decimals = 2) {
//   return +(ms / 3600000).toFixed(decimals); // 3,600,000 ms in an hour
// }
function msToHours(ms) {
  if (!ms || ms <= 0) return "00:00";
  const totalMinutes = Math.floor(ms / 60000); // 1 min = 60000 ms
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function msToHHmm(ms) {
  if (ms <= 0) return "00:00";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

function pct(numer, denom) {
  if (!denom || denom <= 0) return "0.0%";
  const v = Math.min(100, (numer / denom) * 100);
  return `${v.toFixed(1)}%`;
}

/**
 * Derive [startDate, endDate] from dateRange + optional custom dates
 * Supported dateRange: thisMonth (default), thisWeek, lastWeek, lastMonth, custom
 */
function getDateRange(dateRange = "thisMonth", customStartDate, customEndDate) {
  const today = dayjs();
  let startDate, endDate;
  
  console.log(dateRange)
  switch (dateRange) {
    case "today":
      startDate = today.startOf("day").toDate();
      endDate = today.endOf("day").toDate();
      break;

    case "yesterday": {
      const yesterday = today.subtract(1, "day");
      startDate = yesterday.startOf("day").toDate();
      endDate = yesterday.endOf("day").toDate();
      break;
    }

    case "thisWeek":
      startDate = today.startOf("week").toDate();
      endDate = today.endOf("week").toDate();
      break;

    case "lastWeek": {
      const last = today.subtract(1, "week");
      startDate = last.startOf("week").toDate();
      endDate = last.endOf("week").toDate();
      break;
    }

    case "thisMonth":
      startDate = today.startOf("month").toDate();
      endDate = today.endOf("month").toDate();
      break;

    case "lastMonth": {
      const last = today.subtract(1, "month");
      startDate = last.startOf("month").toDate();
      endDate = last.endOf("month").toDate();
      break;
    }

    case "thisQuarter":
      startDate = today.startOf("quarter").toDate();
      endDate = today.endOf("quarter").toDate();
      break;

    case "lastQuarter": {
      const last = today.subtract(1, "quarter");
      startDate = last.startOf("quarter").toDate();
      endDate = last.endOf("quarter").toDate();
      break;
    }

    case "thisYear":
      startDate = today.startOf("year").toDate();
      endDate = today.endOf("year").toDate();
      break;

    case "custom":
      if (!customStartDate || !customEndDate) {
        throw new Error("For 'custom' dateRange, provide customStartDate and customEndDate");
      }
      startDate = dayjs(customStartDate).startOf("day").toDate();
      endDate = dayjs(customEndDate).endOf("day").toDate();
      break;

    default:
      startDate = today.startOf("month").toDate();
      endDate = today.endOf("month").toDate();
  }

  return { startDate, endDate, today: today.toDate() };
}


/** Build a styled Excel file from rows[] objects and return filePath */
// async function writeExcel(rows, filename, sheetName = "Summary Report") {
//   ensureReportsDir();

//   const workbook = new ExcelJS.Workbook();
//   const sheet = workbook.addWorksheet(sheetName);

//   // Determine columns from object keys of first row
//   sheet.mergeCells('A1:H1');
//   sheet.getCell('A1').value = 'Telehealth Provider Summary Report';
//   sheet.getCell('A1').font = { size: 16, bold: true };
//   sheet.getCell('A1').alignment = { horizontal: 'center' };
//   // console.log(rows[0]["Date Range"])
//   sheet.mergeCells('A2:H2');
//   sheet.getCell('A2').value = `Report Period: ${rows[0]["Date Range"]}`;
//   sheet.getCell('A2').font = { italic: true };
//   sheet.getCell('A2').alignment = { horizontal: 'center' };



//   // console.log(rows)
// const headers = Object.keys(rows[0]);

// sheet.columns = headers.map((header) => {
//   const maxDataLength = Math.max(
//     header.length,
//     ...rows.map(row => String(row[header] || '').length)
//   );
//   return {
//     header,
//     key: header,
//     width: Math.max(15, maxDataLength + 2) // Keep minimum width 15
//   };
// });

// // Add header row
// sheet.addRow(headers).font = { bold: true };

//  // Data Rows
//   rows.forEach(row => {
//     sheet.addRow(Object.values(row));
//   });


//   // sheet.addRows(rows);

//   // Header styling
//   sheet.getRow(3).eachCell((cell) => {
//     cell.font = { bold: true, color: { argb: "FF1F4E78" } };
//     cell.alignment = { vertical: "middle", horizontal: "center" };
//     cell.fill = {
//       type: "pattern",
//       pattern: "solid",
//       fgColor: { argb: "FFE2EFDA" },
//     };
//     cell.border = {
//       top: { style: "thin", color: { argb: "FF999999" } },
//       left: { style: "thin", color: { argb: "FF999999" } },
//       bottom: { style: "thin", color: { argb: "FF999999" } },
//       right: { style: "thin", color: { argb: "FF999999" } },
//     };
//   });

//   const filePath = path.join(REPORTS_DIR, filename);
//   await workbook.xlsx.writeFile(filePath);
//   return filePath;
// }
async function writeExcel(rows, filename, sheetName = "Summary Report", reportTitle = "Telehealth Scheduler Report") {
  ensureReportsDir();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);


  // Remove last column (Date Range)
  const headers = Object.keys(rows[0]).slice(0, -2); // Exclude last column
  sheet.columns = headers.map(header => {
    const maxDataLength = Math.max(
      header.length,
      ...rows.map(row => String(row[header] || '').length)
    );
    return {
      header,
      key: header,
      width: Math.max(15, maxDataLength + 2)
    };
  });

  // Add header row
  // Merge and set title
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = reportTitle;
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  
  // Confirmation note
  sheet.getCell('A1').note = '✔ Report successfully generated';
  
  // Report period
  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = `Report Period: ${rows[0]["Date Range"]}`;
  sheet.getCell('A2').font = { italic: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };
  sheet.getCell('A2').alignment = { horizontal: 'center' };
  
  // sheet.getCell('I1').value = ``;
  // sheet.getCell('I2').value = ``;
  sheet.addRow(headers).font = { bold: true };
  // Add data rows without last column
  rows.forEach(row => {
    const rowValues = headers.map(header => row[header]);
    sheet.addRow(rowValues);
  });

  // Style header row (row 3)
  sheet.getRow(3).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2EFDA" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF999999" } },
      left: { style: "thin", color: { argb: "FF999999" } },
      bottom: { style: "thin", color: { argb: "FF999999" } },
      right: { style: "thin", color: { argb: "FF999999" } },
    };
  });

  const filePath = path.join(REPORTS_DIR, filename);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}
/** Map reservation status to buckets. We treat 'completed' as 'confirmed' for utilization. */
function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "confirmed"; // <-- toggle here if you want separate handling
  return s; // reserved | confirmed | cancelled | missed
}

/** Common metric accumulator shape */
function createAccumulator() {
  return {
    totalAppointments: 0,
    reserved: 0,
    confirmed: 0,
    cancelled: 0,
    missed: 0,

    // time buckets (ms)
    reservedMs: 0,
    confirmedMs: 0,
    cancelledMs: 0,
    missedMs: 0,

    totalAppointmentsMs: 0, // sum of reservation durations (considered)
    availableMs: 0,         // sum of overlapping availability time
    availableSlots: 0,      // count of overlapping availability slots
  };
}

/** Add reservation time/count into accumulator */
function addReservationToAcc(acc, resv, rangeStart, rangeEnd) {
  const status = normalizeStatus(resv.status);
  const resvStart = resv.start;
  const resvEnd = resv.end;

  // Overlap with range for time-based metrics
  const overlapped = overlapMs(resvStart, resvEnd, rangeStart, rangeEnd);

  // Count always increments if reservation falls in range (we restrict query by date already)
  acc.totalAppointments += 1;

  // Time-based totals (use overlap for robustness)
  acc.totalAppointmentsMs += overlapped;

  switch (status) {
    case "reserved":
      acc.reserved += 1;
      acc.reservedMs += overlapped;
      break;
    case "confirmed":
      acc.confirmed += 1;
      acc.confirmedMs += overlapped;
      break;
    case "cancelled":
      acc.cancelled += 1;
      acc.cancelledMs += overlapped;
      break;
    case "missed":
      acc.missed += 1;
      acc.missedMs += overlapped;
      break;
    default:
      // Unknown status → ignore
      break;
  }
}

/** Add availability slot time into accumulator (overlap against range) */
function addAvailabilityToAcc(acc, slot, rangeStart, rangeEnd) {
  const overlapped = overlapMs(slot.startTime, slot.endTime, rangeStart, rangeEnd);
  if (overlapped > 0) {
    acc.availableMs += overlapped;
    acc.availableSlots += 1;
  }
}

/** Pretty name for a provider */
function providerFullName(prov) {
  const fn = prov.firstName || "";
  const ln = prov.lastName || "";
  return `${fn} ${ln}`.trim();
}

/* ------------------------ PROVIDER-SUMMARY CONTROLLER ----------------------- */
/**
 * POST /reports/summary/provider
 * body: { dateRange, customStartDate?, customEndDate?, provider?, status?, exportFormat? }
 * - provider: "all" | providerId (number) | providerId[] (array)
 * - status: "all" | reserved | confirmed | cancelled | missed | completed
 * - exportFormat: "excel" (default)
 */
exports.generateProviderSummaryReport = async (req, res) => {
  try {
    const {
      dateRange = "thisMonth",
      customStartDate,
      customEndDate,
      provider = "all",
      status = "all",
      exportFormat = "excel",
    } = req.body || {};

      const { startDate, endDate, today } = getDateRange(dateRange, customStartDate, customEndDate);

    // Build where for provider filter
    let providerWhere = {};
    if (provider !== "all") {
      if (Array.isArray(provider)) {
        providerWhere.id = { [Op.in]: provider };
      } else {
        providerWhere.id = provider;
      }
    }

    // Status filter for reservations
    const reservationWhere = {
      start: { [Op.between]: [startDate, endDate] },
    };
    if (status !== "all") reservationWhere.status = status;

    // Availability overlapping range
    const availabilityWhere = {
      [Op.and]: [
        { startTime: { [Op.lt]: endDate } },
        { endTime: { [Op.gt]: startDate } },
      ],
    };

    const providers = await TelehealthProvider.findAll({
      where: providerWhere,
      attributes: ["id", "firstName", "lastName", "specialty"],
      include: [
        {
          model: Availability,
          required: false,
          attributes: ["id", "stateId", "startTime", "endTime"],
          where: availabilityWhere,
          include: [
            {
              model: Reservation,
              as: "reservations",
              required: false,
              attributes: ["id", "status", "start", "end", "duration", "stateId"],
              where: reservationWhere,
            },
          ],
        },
      ],
    });

    if (!providers || providers.length === 0) {
      return res.status(404).json({ message: "No data found for the selected filters." });
    }

    // Build rows
    const rows = [];

    for (const prov of providers) {
      const acc = createAccumulator();

      // Availability windows for provider
      (prov.Availabilities || []).forEach((slot) => {
        addAvailabilityToAcc(acc, slot, startDate, endDate);

        // Reservations under this slot (already filtered by date)
        (slot.reservations || []).forEach((r) => {
          addReservationToAcc(acc, r, startDate, endDate);
        });
      });

      const utilizationPct = pct(acc.confirmedMs, acc.availableMs);
      const confirmationPct = pct(acc.confirmedMs, acc.totalAppointmentsMs);

      const dateRangeStr = `${dayjs(startDate).format("YYYY-MM-DD")} → ${dayjs(endDate).format("YYYY-MM-DD")}`;

      rows.push({
        "Doctor Name": providerFullName(prov),
        // "Specialty": prov.specialty || "",

        // Count metrics (as in your original spec)
        // "Total Appointments": acc.totalAppointments,
        // "Reserved": acc.reserved,
        // "Confirmed": acc.confirmed,
        // "Cancelled": acc.cancelled,
        // "Missed": acc.missed,
        // "Available Slots": acc.availableSlots,

        // Time metrics (human-readable HH:mm)
        "Available Time ": msToHHmm(acc.availableMs),
        "Appointments Time ": msToHHmm(acc.totalAppointmentsMs),
        "Reserved Time ": msToHHmm(acc.reservedMs),
        "Confirmed Time ": msToHHmm(acc.confirmedMs),
        "Cancelled Time ": msToHHmm(acc.cancelledMs),
        "Missed Time ": msToHHmm(acc.missedMs),

        // Percentage metrics (time-based)
        "Utilization %": utilizationPct,     // confirmed time / available time
        "Confirmation %": confirmationPct,   // confirmed time / total appointment time

        "Date Range": dateRangeStr,
      });
    }

    if (!rows.length) {
      return res.status(404).json({ message: "No data found for the selected filters." });
    }

    // Build file
    const providerNameLabel =
      provider === "all"
        ? "All_Providers"
        : Array.isArray(provider)
          ? `Providers_${provider.join("_")}`
          : `${providers[0].firstName}_${providers[0].lastName}`;

    const monthName = dayjs(startDate).isSame(dayjs(endDate), "month")
      ? dayjs(startDate).format("MMMM YYYY")
      : `${dayjs(startDate).format("MMM DD,YYYY")}-${dayjs(endDate).format("MMM DD, YYYY")}`;

    const filename = `${providerNameLabel}_Summary_Report_${monthName}.xlsx`;
    const filePath = await writeExcel(rows, filename, "Provider Summary");
    // ✅ Get file name from path

// ✅ Get file stats (size, creation date, etc.)
const stats = fs.statSync(filePath);

// ✅ Get size in bytes (convert to KB or MB if needed)
const fileSizeInBytes = stats.size;
// const fileSizeInKB = (fileSizeInBytes / 1024).toFixed(2);
const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
    
    await writeExcel(rows, filename, "Provider Summary");
    // const filePath  = `http://localhost:3000/public/reports/`
    
    // Direct download as attachment
    
    
    // await Report.create({payload:req.body,userId:req.user.id,filename:filename,filetype:exportFormat,size:fileSizeInMB})
    res.setHeader("X-Filename", filename);
    res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
    res.download(filePath, filename, (err) => {
  if (err) {
    console.error("❌ Error downloading file:", err);
    // Optional: handle client disconnect or missing file
    return;
  }

  // Delete file after successful download
  fs.unlink(filePath, (unlinkErr) => {
    if (unlinkErr) {
      console.error("❌ Error deleting file:", unlinkErr);
    } else {
      console.log("✅ File deleted successfully");
    }
  });
});
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error generating provider summary report",
      error: error.message,
    });
  }
};

/* -------------------------- STATE-SUMMARY CONTROLLER ------------------------ */
/**
 * POST /reports/summary/state
 * body: { dateRange, customStartDate?, customEndDate?, state?, status?, exportFormat? }
 * - state: "all" | stateId (number) | stateId[] (array)
 * - status: "all" | reserved | confirmed | cancelled | missed | completed
 */
// exports.generateStateSummaryReport = async (req, res) => {
//   try {
//     const {
//       dateRange = "thisMonth",
//       customStartDate,
//       customEndDate,
//       state = "all",
//       status = "all",
//       exportFormat = "excel",
//     } = req.body || {};

//     const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);

//     // State where filter
//     let stateWhere = {};
//     if (state !== "all") {
//       if (Array.isArray(state)) {
//         stateWhere.id = { [Op.in]: state };
//       } else {
//         stateWhere.id = state;
//       }
//     }

//     // Reservations within range (and optional status filter)
//     const reservationWhere = {
//       start: { [Op.between]: [startDate, endDate] },
//     };
//     if (status !== "all") reservationWhere.status = status;

//     // Availabilities overlapping date range
//     const availabilityWhere = {
//       [Op.and]: [
//         { startTime: { [Op.lt]: endDate } },
//         { endTime: { [Op.gt]: startDate } },
//       ],
//     };

//     const states = await State.findAll({
//       where: stateWhere,
//       attributes: ["id", "stateName", "stateCode"],
//       include: [
//         {
//           model: Availability,
//           required: false,
//           attributes: ["id", "providerId", "startTime", "endTime"],
//           where: availabilityWhere,
//           include: [
//             {
//               model: Reservation,
//               as: "reservations",
//               required: false,
//               attributes: ["id", "status", "start", "end", "duration", "providerId", "stateId"],
//               where: reservationWhere,
//             },
//           ],
//         },
//       ],
//     });

//     if (!states || states.length === 0) {
//       return res.status(404).json({ message: "No data found for the selected filters." });
//     }

//     const rows = [];

//     for (const st of states) {
//       const acc = createAccumulator();

//       (st.Availabilities || []).forEach((slot) => {
//         addAvailabilityToAcc(acc, slot, startDate, endDate);

//         (slot.reservations || []).forEach((r) => {
//           // For state report, we accept reservations bound to this state's availability.
//           // If your domain uses Reservation.stateId as truth, this still aligns as we fetched under this State's availability.
//           addReservationToAcc(acc, r, startDate, endDate);
//         });
//       });

//       const utilizationPct = pct(acc.confirmedMs, acc.availableMs);
//       const confirmationPct = pct(acc.confirmedMs, acc.totalAppointmentsMs);

//       const dateRangeStr = `${dayjs(startDate).format("YYYY-MM-DD")} → ${dayjs(endDate).format("YYYY-MM-DD")}`;

//       rows.push({
//         "State": `${st.stateName} (${st.stateCode})`,
//         // "Total Appointments": acc.totalAppointments,
//         // "Reserved": acc.reserved,
//         // "Confirmed": acc.confirmed,
//         // "Cancelled": acc.cancelled,
//         // "Missed": acc.missed,
//         // "Available Slots": acc.availableSlots,

//         "Available Time (HH:mm)": msToHHmm(acc.availableMs),
//         "Appointments Time (HH:mm)": msToHHmm(acc.totalAppointmentsMs),
//         "Reserved Time (HH:mm)": msToHHmm(acc.reservedMs),
//         "Confirmed Time (HH:mm)": msToHHmm(acc.confirmedMs),
//         "Cancelled Time (HH:mm)": msToHHmm(acc.cancelledMs),
//         "Missed Time (HH:mm)": msToHHmm(acc.missedMs),

//         "Utilization %": utilizationPct,
//         // "Confirmation %": confirmationPct,
//         "Date Range": dateRangeStr,
//       });
//     }

//     if (!rows.length) {
//       return res.status(404).json({ message: "No data found for the selected filters." });
//     }

//     const stateLabel =
//       state === "all"
//         ? "All_States"
//         : Array.isArray(state)
//           ? `States_${state.join("_")}`
//           : `State_${state}`;

//     const spanLabel = `${dayjs(startDate).format("MMM DD, YYYY")}-${dayjs(endDate).format("MM DD, YYYY")}`;
//     const filename = `${stateLabel}_Summary_Report_${spanLabel}.xlsx`;

//     const filePath = await writeExcel(rows, filename, "State Summary");
// res.download(filePath, filename, (err) => {
//   if (err) {
//     console.error("❌ Error downloading file:", err);
//     // Optional: handle client disconnect or missing file
//     return;
//   }
  
//   // Delete file after successful download
//   fs.unlink(filePath, (unlinkErr) => {
//     if (unlinkErr) {
//       console.error("❌ Error deleting file:", unlinkErr);
//     } else {
//       console.log("✅ File deleted successfully");
//     }
//   });
// });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       message: "Error generating state summary report",
//       error: error.message,
//     });
//   }
// };


// exports.generateStateSummaryReport = async (req, res) => {
//   try {
//     const {
//       dateRange = "thisMonth",
//       customStartDate,
//       customEndDate,
//       state = "all",
//       status = "all",
//       exportFormat = "excel",
//     } = req.body || {};

//     const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);

//     // State filter
//     let stateWhere = {};
//     if (state !== "all") {
//       stateWhere.id = Array.isArray(state) ? { [Op.in]: state } : state;
//     }

//     // Reservation filter
//     const reservationWhere = {
//       start: { [Op.between]: [startDate, endDate] },
//     };
//     if (status !== "all") reservationWhere.status = status;

//     // Availability overlapping range
//     const availabilityWhere = {
//       [Op.and]: [
//         { startTime: { [Op.lt]: endDate } },
//         { endTime: { [Op.gt]: startDate } },
//       ],
//     };

//     // Fetch states
//     const states = await State.findAll({
//       where: stateWhere,
//       attributes: ["id", "stateName", "stateCode"],
//     });

//     if (!states || states.length === 0) {
//       return res.status(404).json({ message: "No states found for the selected filters." });
//     }

//     // Fetch reservations grouped by state
//     const reservations = await Reservation.findAll({
//       where: reservationWhere,
//       attributes: ["id", "status", "start", "end", "duration", "providerId", "stateId"],
//     });

//     // Fetch all availabilities for providers in reservations
//     const providerIds = [...new Set(reservations.map(r => r.providerId))];
//     const availabilities = await Availability.findAll({
//       where: {
//         ...availabilityWhere,
//         providerId: { [Op.in]: providerIds },
//       },
//       attributes: ["id", "providerId", "startTime", "endTime"],
//     });

//     // Group data by state
//     const rows = [];
//     for (const st of states) {
//       const acc = createAccumulator();

//       // Reservations for this state
//       const stateReservations = reservations.filter(r => r.stateId === st.id);
//       stateReservations.forEach(r => addReservationToAcc(acc, r, startDate, endDate));

//       // Providers serving this state
//       const stateProviderIds = [...new Set(stateReservations.map(r => r.providerId))];
//       const stateAvailabilities = availabilities.filter(a => stateProviderIds.includes(a.providerId));
//       stateAvailabilities.forEach(slot => addAvailabilityToAcc(acc, slot, startDate, endDate));

//       const utilizationPct = pct(acc.confirmedMs, acc.availableMs);
//       const confirmationPct = pct(acc.confirmedMs, acc.totalAppointmentsMs);
//       const dateRangeStr = `${dayjs(startDate).format("YYYY-MM-DD")} → ${dayjs(endDate).format("YYYY-MM-DD")}`;

//       rows.push({
//         "State": `${st.stateName} (${st.stateCode})`,
//         "Available Time": msToHHmm(acc.availableMs),
//         "Appointments Time": msToHHmm(acc.totalAppointmentsMs),
//         "Reserved Time": msToHHmm(acc.reservedMs),
//         "Confirmed Time": msToHHmm(acc.confirmedMs),
//         "Cancelled Time": msToHHmm(acc.cancelledMs),
//         "Missed Time": msToHHmm(acc.missedMs),
//         "Utilization %": utilizationPct,
//         "Confirmation %": confirmationPct,
//         "Date Range": dateRangeStr,
//       });
//     }

//     if (!rows.length) {
//       return res.status(404).json({ message: "No data found for the selected filters." });
//     }

//     // File naming
//     const stateLabel = state === "all"
//       ? "All_States"
//       : Array.isArray(state)
//         ? `States_${state.join("_")}`
//         : `State_${state}`;

//     const spanLabel = `${dayjs(startDate).format("MMM DD, YYYY")}-${dayjs(endDate).format("MMM DD, YYYY")}`;
//     const filename = `${stateLabel}_Summary_Report_${spanLabel}.xlsx`;

//     const filePath = await writeExcel(rows, filename, "State Summary");

//     res.setHeader("X-Filename", filename);
//     res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//     res.download(filePath, filename, (err) => {
//       if (err) {
//         console.error("❌ Error downloading file:", err);
//         return;
//       }
//       fs.unlink(filePath, (unlinkErr) => {
//         if (unlinkErr) console.error("❌ Error deleting file:", unlinkErr);
//         else console.log("✅ File deleted successfully");
//       });
//     });

//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       message: "Error generating state summary report",
//       error: error.message,
//     });
//   }
// };


// function msToHours(ms) {
//   return (ms / (1000 * 60 * 60)).toFixed(2);
// }

exports.generateStateSummaryReport = async (req, res) => {
  try {
    const {
      dateRange = "thisMonth",
      customStartDate,
      customEndDate,
      state = "all",
      status = "all",
    } = req.body || {};

    const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);


     const dateRangeStr = `${dayjs(startDate).format("YYYY-MM-DD")} → ${dayjs(endDate).format("YYYY-MM-DD")}`;

    /** -------------------- STATE FILTER -------------------- **/
    const stateWhere = {};
    if (state !== "all") {
      stateWhere.id = Array.isArray(state) ? { [Op.in]: state } : state;
    }

    /** -------------------- FETCH STATES -------------------- **/
    const states = await State.findAll({
      where: stateWhere,
      attributes: ["id", "stateName", "stateCode"],
    });

    if (!states.length) {
      return res.status(404).json({ message: "No states found for selected filters." });
    }

    /** -------------------- FETCH PROVIDERS + RELATIONS -------------------- **/
    const providers = await TelehealthProvider.findAll({
      include: [
        {
          model: Availability,
          as: "Availabilities",
          where: {
            [Op.and]: [
              { startTime: { [Op.lt]: endDate } },
              { endTime: { [Op.gt]: startDate } },
            ],
          },
          required: false,
          include: [
            {
              model: Reservation,
              as: "reservations",
              where: {
                start: { [Op.between]: [startDate, endDate] },
                ...(status !== "all" ? { status } : {}),
              },
              required: false,
              attributes: ["id", "status", "start", "end", "stateId", "duration"],
            },
          ],
        },
      ],
    });

    if (!providers.length) {
      return res.status(404).json({ message: "No providers found for selected filters." });
    }

    /** -------------------- ACCUMULATE PER STATE -------------------- **/
    const stateAccMap = {}; // { stateId: accumulator }

    providers.forEach((prov) => {
      (prov.Availabilities || []).forEach((slot) => {
        const overlapped = overlapMs(slot.startTime, slot.endTime, startDate, endDate);

        if (overlapped > 0) {
          // Each reservation within this slot belongs to a specific state
          for (const r of slot.reservations || []) {
            const stateId = r.stateId;
            if (!stateAccMap[stateId]) stateAccMap[stateId] = createAccumulator();
            stateAccMap[stateId].availableMs += overlapped; // available time window
          }
        }

        // Add reservation durations
        (slot.reservations || []).forEach((r) => {
          const stateId = r.stateId;
          if (!stateAccMap[stateId]) stateAccMap[stateId] = createAccumulator();
          addReservationToAcc(stateAccMap[stateId], r, startDate, endDate);
        });
      });
    });

    /** -------------------- BUILD DATA ROWS -------------------- **/
    const rows = states.map((st) => {
      const acc = stateAccMap[st.id] || createAccumulator();
      const utilization = parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", ""));
      const confirmation = parseFloat(pct(acc.confirmedMs, acc.totalAppointmentsMs).replace("%", ""));

      return {
        State: `${st.stateName} (${st.stateCode})`,
        // "Available Hours": msToHours(acc.availableMs),
        "Appointments Hours": msToHours(acc.totalAppointmentsMs),
        "Confirmed Hours": msToHours(acc.confirmedMs),
        "Cancelled Hours": msToHours(acc.cancelledMs),
        "Missed Hours": msToHours(acc.missedMs),
        "Utilization %": `${utilization}%`,
        "Confirmation %": confirmation,
        "Confirmation %": confirmation,
        "Date Range": dateRangeStr,
      };
    });

    if (!rows.length) {
      return res.status(404).json({ message: "No data found for the selected filters." });
    }

    /** -------------------- FILE NAME + EXPORT -------------------- **/
    const stateLabel =
      state === "all"
        ? "All_States"
        : Array.isArray(state)
        ? `States_${state.join("_")}`
        : `State_${state}`;

    const spanLabel = `${dayjs(startDate).format("MMM_DD_YYYY")}_to_${dayjs(endDate).format(
      "MMM_DD_YYYY"
    )}`;
    const filename = `${stateLabel}_Utilization_Report_${spanLabel}.xlsx`;

    const filePath = await writeExcel(rows, filename, "State Utilization");

    res.setHeader("X-Filename", filename);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("❌ Error downloading file:", err);
        if (!res.headersSent)
          res.status(500).json({ message: "Error downloading file." });
        return;
      }

      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error("❌ Error deleting file:", unlinkErr);
        else console.log("✅ File deleted successfully:", filename);
      });
    });
  } catch (error) {
    console.error("❌ Error generating state report:", error);
    res.status(500).json({
      message: "Error generating state summary report",
      error: error.message,
    });
  }
};




exports.getRecentReports = async (req, res) => {
  try {
    // Get page number from query params (default to 1)
    const page = parseInt(req.query.page) || 1;
    const limit = 4; // number of records per page
    const offset = (page - 1) * limit;

    const reports = await Report.findAll({
      limit: limit,
      offset: offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          attributes: ["firstName", "lastName"],
          as: "generatedBy",
        },
      ],
    });

    // Optional: Get total count for pagination info
    const totalReports = await Report.count();
    const totalPages = Math.ceil(totalReports / limit);

    res.status(200).json({
      success: true,
      count: reports.length,
      currentPage: page,
      totalPages: totalPages,
      data: reports,
    });
  } catch (error) {
    console.error("❌ Error fetching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent reports",
      error: error.message,
    });
  }
};







// Visualization Report Controller
// controllers/report.controller.js
// exports.getUtilizationChartData = async (req, res) => {
//   try {
//     const {
//       dateRange = "thisMonth",
//       customStartDate,
//       customEndDate,
//     } = req.query || {};

//     const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);

//     // Fetch Providers with availability and reservations
//     const providers = await TelehealthProvider.findAll({
//       attributes: ["id", "firstName", "lastName"],
//       include: [
//         {
//           model: Availability,
//           required: false,
//           attributes: ["startTime", "endTime"],
//           where: {
//             [Op.and]: [
//               { startTime: { [Op.lt]: endDate } },
//               { endTime: { [Op.gt]: startDate } },
//             ],
//           },
//           include: [
//             {
//               model: Reservation,
//               as: "reservations",
//               required: false,
//               attributes: ["status", "start", "end"],
//               where: { start: { [Op.between]: [startDate, endDate] } },
//             },
//           ],
//         },
//       ],
//     });

//     const providerData = providers.map((prov) => {
//       const acc = createAccumulator();
//       (prov.Availabilities || []).forEach((slot) => {
//         addAvailabilityToAcc(acc, slot, startDate, endDate);
//         (slot.reservations || []).forEach((r) => addReservationToAcc(acc, r, startDate, endDate));
//       });
//       return {
//         name: providerFullName(prov),
//         utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")), // numeric value
//       };
//     });

//     // Fetch States similarly
//     const states = await State.findAll({
//       attributes: ["id", "stateName"],
//       include: [
//         {
//           model: Availability,
//           required: false,
//           attributes: ["startTime", "endTime"],
//           where: {
//             [Op.and]: [
//               { startTime: { [Op.lt]: endDate } },
//               { endTime: { [Op.gt]: startDate } },
//             ],
//           },
//           include: [
//             {
//               model: Reservation,
//               as: "reservations",
//               required: false,
//               attributes: ["status", "start", "end"],
//               where: { start: { [Op.between]: [startDate, endDate] } },
//             },
//           ],
//         },
//       ],
//     });

//     const stateData = states.map((st) => {
//       const acc = createAccumulator();
//       (st.Availabilities || []).forEach((slot) => {
//         addAvailabilityToAcc(acc, slot, startDate, endDate);
//         (slot.reservations || []).forEach((r) => addReservationToAcc(acc, r, startDate, endDate));
//       });
//       return {
//         name: st.stateName,
//         utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")),
//       };
//     });

//     res.json({
//       success: true,
//       dateRange: `${startDate.toISOString()} → ${endDate.toISOString()}`,
//       providers: providerData,
//       states: stateData,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, message: "Error fetching chart data", error: error.message });
//   }
// };
exports.getUtilizationChartData = async (req, res) => {
  try {
   const {
      dateRange = "thisMonth",
      customStartDate,
      customEndDate,
      provider
    } = req.body || {};

    const { startDate, endDate } = getDateRange(dateRange, customStartDate, customEndDate);
    
    // Fetch Providers with availability and reservations
  
const providers = await TelehealthProvider.findAll({
  attributes: ["id", "firstName", "lastName"],
  where:{
    ...(typeof provider == "number" ? { id: provider } : {}) // ✅ یہ لائن

  },
  include: [
    {
      model: Availability,
      required: false,
      attributes: ["startTime", "endTime"],
      where: {
        [Op.and]: [
          { startTime: { [Op.lt]: endDate } },
          { endTime: { [Op.gt]: startDate } },
        ],
      },
      include: [
        {
          model: Reservation,
          as: "reservations",
          required: false,
          attributes: ["status", "start", "end", "stateId"],
          where: { start: { [Op.between]: [startDate, endDate] } },
        },
      ],
    },
  ],
});


    // ✅ Provider Utilization
    // const providerData = providers.map((prov) => {
    //   const acc = createAccumulator();
    //   (prov.Availabilities || []).forEach((slot) => {
    //     addAvailabilityToAcc(acc, slot, startDate, endDate);
    //     (slot.reservations || []).forEach((r) => addReservationToAcc(acc, r, startDate, endDate));
    //   });
    //   return {
    //     name: providerFullName(prov),
    //     utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")),
    //   };
    // });
    
const providerData = providers.map((prov) => {
  const acc = createAccumulator();
  (prov.Availabilities || []).forEach((slot) => {
    addAvailabilityToAcc(acc, slot, startDate, endDate);
    (slot.reservations || []).forEach((r) => addReservationToAcc(acc, r, startDate, endDate));
  });
  return {
    name: providerFullName(prov),
    utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")),
    confirmedTime: msToHours(acc.confirmedMs), // Convert ms to hours
    availableTime: msToHours(acc.availableMs),
  };
});


function msToHours(ms) {
  return (ms / (1000 * 60 * 60)).toFixed(2); // hours with 2 decimal places
}

    // ✅ State Utilization
    const stateAccMap = {}; // { stateId: accumulator }

    providers.forEach((prov) => {
      (prov.Availabilities || []).forEach((slot) => {
        const overlapped = overlapMs(slot.startTime, slot.endTime, startDate, endDate);
        if (overlapped > 0) {
          // Add available time to ALL states because availability is global
          for (const r of slot.reservations || []) {
            const stateId = r.stateId;
            if (!stateAccMap[stateId]) stateAccMap[stateId] = createAccumulator();
            stateAccMap[stateId].availableMs += overlapped; // availability time
          }
        }

        // Add reservation times
        (slot.reservations || []).forEach((r) => {
          const stateId = r.stateId;
          if (!stateAccMap[stateId]) stateAccMap[stateId] = createAccumulator();
          addReservationToAcc(stateAccMap[stateId], r, startDate, endDate);
        });
      });
    });

    // Fetch state names for response
    const states = await State.findAll({ attributes: ["id", "stateName"] });
    // const stateData = states.map((st) => {
    //   const acc = stateAccMap[st.id] || createAccumulator();
    //   return {
    //     name: st.stateName,
    //     utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")),
    //   };
    // });

const stateData = states.map((st) => {
  const acc = stateAccMap[st.id] || createAccumulator();
  return {
    name: st.stateName,
    utilization: parseFloat(pct(acc.confirmedMs, acc.availableMs).replace("%", "")),
    confirmedTime: msToHours(acc.confirmedMs),
    availableTime: msToHours(acc.availableMs),
  };
});

    res.json({
      success: true,
      dateRange: {startDate:dayjs(startDate).format("MMM DD, YYYY"),endDate:dayjs(endDate).format("MMM DD, YYYY")},
      providers: providerData,
      states: stateData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching chart data", error: error.message });
  }
};
