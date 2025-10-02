// ===== Controller: scheduleController.js =====
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const Availability = require('../models/scheduler.model');
const Provider = require('../models/provider.model');
const State = require('../models/states.model');
const User = require('../models/user.model');
const Reservation = require('../models/reservation.model');

const exportDoctorScheduleToExcel = async (req, res) => {
  try {
    const { startingTime, endTime } = req.query;
    let availabilityWhere = {};

    // Date range filtering
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

    // Database se data fetch karein
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
              attributes: ['id', "firstName", "lastName", 'email']
            },
            {
              model: User,
              as: "reservedUser",
              attributes: ['id', "firstName", "lastName", 'email']
            },
            {
              model: Reservation,
              as: "reservations",
              attributes: ['id', 'start', 'end', 'duration', 'status', 'isCancelled', "reasonOfCancellation", "notes"],
              include: [
                { model: State, as: "state" },
                { model: User, as: "reservedUser", attributes: ['id', "firstName", "lastName", 'email', "privilege", "profile"] },
                { model: User, as: "confirmedUser", attributes: ['id', "firstName", "lastName", 'email', 'privilege', "profile"] }
              ]
            }
          ]
        }
      ]
    });

    // Data format karein
    const doctorsData = await Promise.all(
      providers.map(async (provider) => {
        const states = await State.findAll({
          where: { stateCode: provider.stateLicenses },
          attributes: ["stateCode", "stateName", "id"],
        });

        return {
          id: provider.id,
          name: `${provider.suffix || ''} ${provider.firstName} ${provider.lastName}`.trim(),
          specialty: provider.specialty,
          stateLicenses: [...new Set(states)],
          schedule: provider.Availabilities.map((slot) => {
            const start = new Date(slot.startTime);
            const end = new Date(slot.endTime);

            const totalDuration = Math.floor((end - start) / (1000 * 60));

            // Reservation duration sum
            const reservationDuration =
              slot.reservations?.reduce((sum, r) => {
                if (r.isCancelled === "no") {
                  return sum + (r.duration || 0);
                }
                return sum;
              }, 0) || 0;

            const availableDuration = totalDuration - reservationDuration;

            // Random messages list
            const messages = [
              "Running late",
              "Hey, I am coming late",
              "Sorry for delay",
              "Got stuck in traffic",
              "Be there shortly",
            ];

            // Sort reservations by start time
            const sortedReservations =
              slot.reservations
                ?.sort((a, b) => new Date(a.start) - new Date(b.start))
                ?.map((r, idx, arr) => {
                  const startR = new Date(r.start);
                  const endR = new Date(r.end);

                  let overlap = null;

                  if (idx > 0) {
                    const prev = arr[idx - 1];
                    const prevEnd = new Date(prev.end);

                    if (startR < prevEnd) {
                      const overlapMinutes = Math.floor(
                        (prevEnd - startR) / (1000 * 60)
                      );

                      const randomMsg =
                        messages[Math.floor(Math.random() * messages.length)];

                      overlap = {
                        overlapTime: overlapMinutes,
                        message: randomMsg,
                      };
                    }
                  }

                  return {
                    id: r.id,
                    start: r.start,
                    end: r.end,
                    duration: r.duration,
                    status: r.status,
                    isCancelled: r.isCancelled,
                    reasonOfCancellation: r.reasonOfCancellation,
                    reservedUser: r.reservedUser,
                    confirmedUser: r.confirmedUser,
                    state: r.state,
                    notes: r.notes,
                    ...(overlap ? { overlap } : {}),
                  };
                }) || [];

            return {
              id: slot.id,
              date: start.toISOString().split("T")[0],
              time: `${start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone:"UTC"
              })} - ${end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
                timeZone:"UTC"
              })}`,
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

    // Agar data nahi mila
    if (!doctorsData || doctorsData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No schedule data found for the selected date range'
      });
    }

    // Format dates for report
    const reportStartDate = startingTime 
      ? new Date(startingTime).toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];
    const reportEndDate = endTime 
      ? new Date(endTime).toISOString().split('T')[0] 
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ===== Excel Workbook Create karein =====
    const workbook = XLSX.utils.book_new();
    
    // ===== Sheet 1: Doctor Summary =====
    const doctorSummary = [];
    doctorSummary.push(['Doctor Schedule Report']);
    doctorSummary.push(['Report Period:', `${reportStartDate} to ${reportEndDate}`]);
    doctorSummary.push(['Generated On:', new Date().toLocaleString()]);
    doctorSummary.push([]); // Empty row
    doctorSummary.push(['Doctor ID', 'Doctor Name', 'Specialty', 'Licensed States', 'Total Schedules', 'Total Reservations', 'Confirmed', 'Cancelled']);
    
    doctorsData.forEach(doctor => {
      const totalSchedules = doctor.schedule?.length || 0;
      const allReservations = doctor.schedule?.flatMap(s => s.reservations || []) || [];
      const confirmedCount = allReservations.filter(r => r.status === 'confirm').length;
      const cancelledCount = allReservations.filter(r => r.isCancelled === 'yes').length;
      
      doctorSummary.push([
        doctor.id,
        doctor.name,
        doctor.specialty || 'N/A',
        doctor.stateLicenses?.map(s => s.stateCode).join(', ') || 'N/A',
        totalSchedules,
        allReservations.length,
        confirmedCount,
        cancelledCount
      ]);
    });
    
    const ws1 = XLSX.utils.aoa_to_sheet(doctorSummary);
    ws1['!cols'] = [
      { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, 
      { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws1, 'Doctor Summary');
    
    // ===== Sheet 2: Detailed Schedule =====
    const scheduleDetails = [];
    scheduleDetails.push(['Schedule ID', 'Doctor Name', 'Date', 'Time Slot', 'Duration (min)', 'Available Duration (min)', 'Status', 'Timezone', 'Total Reservations']);
    
    doctorsData.forEach(doctor => {
      doctor.schedule?.forEach(schedule => {
        scheduleDetails.push([
          schedule.id,
          doctor.name,
          schedule.date,
          schedule.time,
          schedule.duration,
          schedule.availableDuration,
          schedule.status,
          schedule.timezone,
          schedule.reservations?.length || 0
        ]);
      });
    });
    
    const ws2 = XLSX.utils.aoa_to_sheet(scheduleDetails);
    ws2['!cols'] = [
      { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, 
      { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws2, 'Schedule Details');
    
    // ===== Sheet 3: Reservations Details =====
    const reservationDetails = [];
    reservationDetails.push([
      'Reservation ID', 'Doctor Name', 'Schedule Date', 'Start Time', 'End Time', 
      'Duration (min)', 'Status', 'Cancelled', 'Cancellation Reason', 
      'Reserved By', 'Confirmed By', 'State', 'Notes', 'Overlap Time', 'Overlap Message'
    ]);
    
    doctorsData.forEach(doctor => {
      doctor.schedule?.forEach(schedule => {
        schedule.reservations?.forEach(reservation => {
          const startTime = new Date(reservation.start).toLocaleString();
          const endTime = new Date(reservation.end).toLocaleString();
          
          reservationDetails.push([
            reservation.id,
            doctor.name,
            schedule.date,
            startTime,
            endTime,
            reservation.duration,
            reservation.status,
            reservation.isCancelled,
            reservation.reasonOfCancellation || '',
            `${reservation.reservedUser?.firstName || ''} ${reservation.reservedUser?.lastName || ''}`.trim(),
            `${reservation.confirmedUser?.firstName || ''} ${reservation.confirmedUser?.lastName || ''}`.trim(),
            reservation.state?.stateName || 'N/A',
            reservation.notes || '',
            reservation.overlap?.overlapTime || '',
            reservation.overlap?.message || ''
          ]);
        });
      });
    });
    
    const ws3 = XLSX.utils.aoa_to_sheet(reservationDetails);
    ws3['!cols'] = [
      { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 },
      { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws3, 'Reservations');
    
    // ===== Sheet 4: State Licenses =====
    const licenseDetails = [];
    licenseDetails.push(['Doctor ID', 'Doctor Name', 'State Code', 'State Name', 'License ID']);
    
    doctorsData.forEach(doctor => {
      doctor.stateLicenses?.forEach(license => {
        licenseDetails.push([
          doctor.id,
          doctor.name,
          license.stateCode,
          license.stateName,
          license.id
        ]);
      });
    });
    
    const ws4 = XLSX.utils.aoa_to_sheet(licenseDetails);
    ws4['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, ws4, 'State Licenses');
    
    // ===== Sheet 5: Cancelled Appointments =====
    const cancelledDetails = [];
    cancelledDetails.push([
      'Reservation ID', 'Doctor Name', 'Date', 'Time', 'Duration (min)', 
      'Cancellation Reason', 'Reserved By', 'State'
    ]);
    
    doctorsData.forEach(doctor => {
      doctor.schedule?.forEach(schedule => {
        schedule.reservations
          ?.filter(r => r.isCancelled === 'yes')
          .forEach(reservation => {
            cancelledDetails.push([
              reservation.id,
              doctor.name,
              schedule.date,
              new Date(reservation.start).toLocaleString(),
              reservation.duration,
              reservation.reasonOfCancellation || '',
              `${reservation.reservedUser?.firstName || ''} ${reservation.reservedUser?.lastName || ''}`.trim(),
              reservation.state?.stateName || 'N/A'
            ]);
          });
      });
    });
    
    const ws5 = XLSX.utils.aoa_to_sheet(cancelledDetails);
    ws5['!cols'] = [
      { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 20 }, 
      { wch: 14 }, { wch: 35 }, { wch: 20 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws5, 'Cancelled Appointments');
    
    // Temp folder create karein agar nahi hai
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // File save karein
    const fileName = `Doctor_Schedule_Report_${reportStartDate}_to_${reportEndDate}_${Date.now()}.xlsx`;
    const filePath = path.join(tempDir, fileName);
    
    XLSX.writeFile(workbook, filePath);
    
    // File download karein with proper headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // File download karein
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        if (!res.headersSent) {
          return res.status(500).json({
            success: false,
            message: 'Error downloading file'
          });
        }
      }
      
      // File download hone ke baad delete kar dein
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`✅ Temporary file deleted: ${fileName}`);
          }
        } catch (deleteError) {
          console.error('Error deleting temp file:', deleteError);
        }
      }, 5000);
    });

  } catch (error) {
    console.error('Error exporting schedule:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

module.exports = {
  exportDoctorScheduleToExcel
};


// ===== Routes: scheduleRoutes.js =====
/*
const express = require('express');
const router = express.Router();
const { exportDoctorScheduleToExcel } = require('../controllers/scheduleController');

// Export schedule to Excel
// GET /api/schedule/export?startingTime=2025-09-29&endTime=2025-10-01
router.get('/export', exportDoctorScheduleToExcel);

module.exports = router;
*/


// ===== Frontend Button Example (React/HTML) =====
/*
// HTML Button
<button onclick="downloadSchedule()">Download Schedule Report</button>

<script>
function downloadSchedule() {
  const startDate = '2025-09-29'; // Apni date yahan set karein
  const endDate = '2025-10-01';
  
  window.location.href = `http://localhost:3000/api/schedule/export?startingTime=${startDate}&endTime=${endDate}`;
}
</script>

// React Button
const handleDownload = () => {
  const startDate = '2025-09-29';
  const endDate = '2025-10-01';
  
  window.open(`/api/schedule/export?startingTime=${startDate}&endTime=${endDate}`, '_blank');
};

<button onClick={handleDownload}>Download Schedule Report</button>
*/