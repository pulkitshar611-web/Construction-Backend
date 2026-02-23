const Project = require('../models/Project');
const Task = require('../models/Task');
const TimeLog = require('../models/TimeLog');
const Invoice = require('../models/Invoice');
const Issue = require('../models/Issue');
const User = require('../models/User');
const PurchaseOrder = require('../models/purchaseOrder.model');
const DailyLog = require('../models/DailyLog');
const Equipment = require('../models/Equipment');
const RFI = require('../models/RFI');
const Job = require('../models/Job');

// @desc    Get project overview report
// @route   GET /api/reports/project/:projectId
// @access  Private (PM, Owners)
const getProjectReport = async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const companyId = req.user.companyId;

        const project = await Project.findOne({ _id: projectId, companyId });
        if (!project) {
            res.status(404);
            throw new Error('Project not found');
        }

        const totalTasks = await Task.countDocuments({ projectId });
        const completedTasks = await Task.countDocuments({ projectId, status: 'completed' });

        const timeLogs = await TimeLog.find({ projectId });
        const totalHours = timeLogs.reduce((acc, log) => {
            if (log.clockOut) {
                return acc + (new Date(log.clockOut) - new Date(log.clockIn)) / (1000 * 60 * 60);
            }
            return acc;
        }, 0);

        const invoices = await Invoice.find({ projectId });
        const totalInvoiced = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
        const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + inv.totalAmount, 0);

        res.json({
            project: {
                name: project.name,
                status: project.status,
                progress: project.progress,
                budget: project.budget
            },
            tasks: {
                total: totalTasks,
                completed: completedTasks,
                completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
            },
            labor: {
                totalHours: totalHours.toFixed(2)
            },
            financials: {
                totalInvoiced,
                totalPaid,
                outstanding: totalInvoiced - totalPaid
            }
        });
    } catch (error) {
        next(error);
    }
};



// @desc    Get company-wide report
// @route   GET /api/reports/company
// @access  Private (Owners, Admins)
const getCompanyReport = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;

        // Financials
        const invoices = await Invoice.find({ companyId });
        const totalInvoiced = invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
        const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
        const totalOutstanding = totalInvoiced - totalPaid;

        // Projects
        const totalProjects = await Project.countDocuments({ companyId });
        const preConstruction = await Project.countDocuments({ companyId, status: 'planning' });
        const activeSites = await Project.countDocuments({ companyId, status: 'active' });
        const onHold = await Project.countDocuments({ companyId, status: 'on_hold' });
        const handedOver = await Project.countDocuments({ companyId, status: 'completed' });

        // Jobs
        const totalJobs = await Job.countDocuments({ companyId });
        const completedJobs = await Job.countDocuments({ companyId, status: 'completed' });

        // Labor Hours (from TimeLogs)
        const timeLogs = await TimeLog.find({ companyId });
        const totalLaborHours = timeLogs.reduce((acc, log) => {
            if (log.clockOut && log.clockIn) {
                const hours = (new Date(log.clockOut) - new Date(log.clockIn)) / (1000 * 60 * 60);
                return acc + hours;
            }
            return acc;
        }, 0);

        // Weekly Productivity (Last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentLogs = await TimeLog.find({
            companyId,
            createdAt: { $gte: sevenDaysAgo }
        });

        // Group by day
        const dailyProductivity = {};
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayName = days[d.getDay()];
            dailyProductivity[dayName] = 0;
        }

        recentLogs.forEach(log => {
            if (log.clockOut && log.clockIn) {
                const d = new Date(log.clockIn);
                const dayName = days[d.getDay()];
                const hours = (new Date(log.clockOut) - new Date(log.clockIn)) / (1000 * 60 * 60);
                if (dailyProductivity[dayName] !== undefined) {
                    dailyProductivity[dayName] += hours;
                }
            }
        });

        const productivityData = Object.keys(dailyProductivity).map(day => ({
            day,
            hours: Math.round(dailyProductivity[day] * 10) / 10
        }));

        // Calculate Total Project Budget
        const projects = await Project.find({ companyId });
        const totalBudget = projects.reduce((acc, proj) => acc + (proj.budget || 0), 0);

        // Safety Incidents (Issues with category 'safety')
        const safetyIncidentsCount = await Issue.countDocuments({ companyId, category: 'safety' });

        // Days Incident Free
        const lastSafetyIncident = await Issue.findOne({ companyId, category: 'safety' })
            .sort({ createdAt: -1 });

        let daysIncidentFree = 0;
        if (lastSafetyIncident) {
            const today = new Date();
            const lastDate = new Date(lastSafetyIncident.createdAt);
            const diffTime = Math.abs(today - lastDate);
            daysIncidentFree = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
            // If no incidents, technically incident free since company start match report logic or just 0?
            // Let's use 0 or maybe a high number if we want to show positive metric? 
            // For now, let's just make it 0 if no incidents ever, or maybe the company creation date?
            // Let's go with 0 to keep it simple, or maybe "N/A"
            daysIncidentFree = 0;
        }


        // Equipment Stats
        const totalEquipment = await Equipment.countDocuments({ companyId });
        const operationalEquipment = await Equipment.countDocuments({ companyId, status: 'operational' });

        res.json({
            financials: {
                totalRevenue: totalPaid, // Assuming paid invoices = revenue
                totalInvoiced,
                outstanding: totalOutstanding,
                projectBudget: totalBudget
            },
            projects: {
                total: totalProjects,
                preConstruction,
                activeSites,
                onHold,
                handedOver
            },
            labor: {
                totalHours: Math.round(totalLaborHours),
                productivityData
            },
            safety: {
                totalIncidents: safetyIncidentsCount,
                daysIncidentFree
            },
            equipment: {
                total: totalEquipment,
                operational: operationalEquipment
            },
            jobs: {
                total: totalJobs,
                completed: completedJobs
            }
        });

    } catch (error) {
        next(error);
    }
};
const getDashboardStats = async (req, res, next) => {
    try {
        const companyId = req.user.companyId;
        const userId = req.user._id;
        const role = req.user.role;

        const stats = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        if (['COMPANY_OWNER', 'PM', 'FOREMAN', 'SUBCONTRACTOR'].includes(role)) {
            // Define filters
            const projectFilter = { companyId, status: { $in: ['active', 'planning'] } };
            const jobFilter = { companyId };
            const timeLogFilter = { companyId };
            const poFilter = { companyId, status: { $in: ['Draft', 'Pending Approval', 'Approved', 'Sent', 'Delivered'] } };
            const pendingPOFilter = { companyId, status: 'Pending Approval' };
            const dailyLogFilter = { companyId };

            if (role === 'PM') {
                const directProjects = await Project.find({
                    companyId,
                    $or: [{ pmId: userId }, { createdBy: userId }]
                }).select('_id');

                const jobProjects = await Job.find({
                    $or: [{ foremanId: userId }, { createdBy: userId }]
                }).select('projectId');

                const allProjectIds = [...new Set([
                    ...directProjects.map(p => p._id.toString()),
                    ...jobProjects.filter(j => j.projectId).map(j => j.projectId.toString())
                ])];

                projectFilter._id = { $in: allProjectIds };
                projectFilter.status = { $in: ['active', 'planning'] };
                jobFilter.$or = [{ projectId: { $in: allProjectIds } }, { createdBy: userId }, { foremanId: userId }];
                timeLogFilter.projectId = { $in: allProjectIds };
                poFilter.projectId = { $in: allProjectIds };
                dailyLogFilter.projectId = { $in: allProjectIds };
            }

            // Fetch Multi-metrics
            const [
                activeJobsCount,
                crewOnSiteCount,
                totalCrew,
                pos,
                pendingPOsCount,
                pendingLogs,
                recentActivity,
                recentLogs,
                equipAlerts,
                overdueRFIs,
                overdueTasks,
                offlineSyncs
            ] = await Promise.all([
                Project.countDocuments(projectFilter),
                TimeLog.countDocuments({ ...timeLogFilter, clockOut: null }),
                User.countDocuments({ companyId, role: { $in: ['WORKER', 'FOREMAN', 'PM'] } }),
                PurchaseOrder.find(poFilter),
                PurchaseOrder.countDocuments(pendingPOFilter),
                TimeLog.countDocuments({ ...timeLogFilter, status: 'pending' }),
                TimeLog.find(timeLogFilter).sort({ clockIn: -1 }).limit(5).populate('userId', 'fullName avatar').populate('projectId', 'name'),
                DailyLog.find(dailyLogFilter).sort({ date: -1 }).limit(3).populate('reportedBy', 'fullName').populate('projectId', 'name'),
                Equipment.find({ companyId }).populate('assignedJob', 'status'),
                RFI.countDocuments({ companyId, status: { $ne: 'closed' }, dueDate: { $lt: new Date() } }),
                Task.countDocuments({ companyId, status: { $ne: 'completed' }, dueDate: { $lt: new Date() } }),
                TimeLog.countDocuments({ companyId, offlineSync: true, status: 'pending' })
            ]);

            const equipAlertCount = equipAlerts.filter(e => e.assignedJob?.status === 'completed').length;

            // Calculate hours today
            const logsToday = await TimeLog.find({ ...timeLogFilter, clockIn: { $gte: today } });
            const hoursToday = logsToday.reduce((acc, log) => {
                const end = log.clockOut || new Date();
                return acc + (end - new Date(log.clockIn)) / (1000 * 60 * 60);
            }, 0);

            stats.metrics = {
                activeJobs: activeJobsCount,
                crewOnSiteCount,
                totalCrew,
                hoursToday: Math.round(hoursToday),
                equipmentRunning: equipAlerts.filter(e => e.status === 'operational').length,
                openPos: pos.length,
                openPosValue: pos.reduce((acc, p) => acc + (p.totalAmount || 0), 0),
                pendingApprovals: pendingLogs + pendingPOsCount,
                equipmentAlerts: equipAlertCount,
                overdueRFIs,
                overdueTasks,
                offlineSyncs
            };

            stats.crewActivity = recentActivity.map(log => ({
                name: log.userId?.fullName || 'Unknown',
                job: log.projectId?.name || 'No Project',
                time: new Date(log.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: log.clockOut ? 'Clocked Out' : 'On Site',
                subtext: log.clockOut ? `${Math.round((new Date(log.clockOut) - new Date(log.clockIn)) / (1000 * 60 * 60))}h total` : null,
                avatar: log.userId?.fullName?.split(' ').map(n => n[0]).join('') || '??',
                lat: log.gpsIn?.latitude || null,
                lng: log.gpsIn?.longitude || null
            }));

            stats.recentDailyLogs = recentLogs.map(log => ({
                job: log.projectId?.name || '---',
                date: new Date(log.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
                foreman: log.reportedBy?.fullName || '---'
            }));
        }

        if (['WORKER', 'SUBCONTRACTOR'].includes(role)) {
            const myLogsToday = await TimeLog.find({ userId, clockIn: { $gte: today } });
            const myHoursToday = myLogsToday.reduce((acc, log) => {
                const end = log.clockOut || new Date();
                return acc + (end - new Date(log.clockIn)) / (1000 * 60 * 60);
            }, 0);

            const activeLog = await TimeLog.findOne({ userId, clockOut: null }).populate('projectId', 'name');

            // Weekly hours
            const startOfWeek = new Date();
            startOfWeek.setDate(today.getDate() - today.getDay());
            const myWeeklyLogs = await TimeLog.find({ userId, clockIn: { $gte: startOfWeek } });
            const totalWeeklyHours = myWeeklyLogs.reduce((acc, log) => {
                const end = log.clockOut || new Date();
                return acc + (end - new Date(log.clockIn)) / (1000 * 60 * 60);
            }, 0);

            // Fetch assigned projects for the selection dropdown
            const jobs = await Job.find({
                companyId,
                $or: [
                    { assignedWorkers: userId },
                    { foremanId: userId }
                ]
            }).populate('projectId', 'name');

            const assignedProjects = jobs
                .filter(j => j.projectId)
                .map(j => ({
                    _id: j.projectId._id,
                    name: j.projectId.name,
                    jobName: j.name,
                    jobId: j._id
                }));

            stats.workerMetrics = {
                myHoursToday: myHoursToday.toFixed(1) + 'h',
                currentJob: activeLog?.projectId?.name || 'Not Clocked In',
                weeklyTarget: '40h',
                weeklyDone: Math.round(totalWeeklyHours) + 'h done',
                isClockedIn: !!activeLog,
                timer: activeLog ? Math.floor((new Date() - new Date(activeLog.clockIn)) / 1000) : 0,
                assignedProjects: assignedProjects
            };

            const myRecentActivity = await TimeLog.find({ userId })
                .sort({ clockIn: -1 })
                .limit(5)
                .populate('projectId', 'name');

            stats.myRecentActivity = myRecentActivity.map(log => ({
                id: log._id,
                action: log.clockOut ? 'Clocked Out' : 'Clocked In',
                job: log.projectId?.name || '---',
                time: new Date(log.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: new Date(log.clockIn).toDateString() === new Date().toDateString() ? 'Today' :
                    new Date(log.clockIn).toDateString() === new Date(Date.now() - 86400000).toDateString() ? 'Yesterday' :
                        new Date(log.clockIn).toLocaleDateString()
            }));
        }

        // Productivity Trend (Last 7 Days)
        const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const productivity = [];
        const projectProductivity = {}; // To find Top Project

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(d); endOfDay.setHours(23, 59, 59, 999);

            const logs = await TimeLog.find({ companyId, clockIn: { $gte: startOfDay, $lte: endOfDay } });
            const totalHours = logs.reduce((acc, log) => {
                const end = log.clockOut || (new Date().toDateString() === d.toDateString() ? new Date() : endOfDay);
                const h = Math.max(0, (end - new Date(log.clockIn)) / (1000 * 60 * 60));

                // Track project productivity for top project identification
                if (log.projectId) {
                    const pid = log.projectId.toString();
                    projectProductivity[pid] = (projectProductivity[pid] || 0) + h;
                }

                return acc + h;
            }, 0);

            productivity.push({ day: daysShort[d.getDay()], hours: Math.round(totalHours), date: startOfDay });
        }
        stats.trendData = productivity;

        // Find Top Project for the localized "Hours Trend" section
        const topProjectId = Object.keys(projectProductivity).sort((a, b) => projectProductivity[b] - projectProductivity[a])[0];
        if (topProjectId) {
            const topProj = await Project.findById(topProjectId).populate('pmId', 'fullName');
            stats.topProject = {
                name: topProj.name,
                manager: topProj.pmId?.fullName || 'Unassigned',
                hours: Math.round(projectProductivity[topProjectId]),
                image: topProj.image || 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=200'
            };
        }

        res.json(stats);
    } catch (error) {
        next(error);
    }
};

module.exports = { getProjectReport, getCompanyReport, getDashboardStats };
