const Project = require('../models/Project');
const Task = require('../models/Task');
const TimeLog = require('../models/TimeLog');
const Invoice = require('../models/Invoice');
const Issue = require('../models/Issue');
const User = require('../models/User');
const PurchaseOrder = require('../models/PurchaseOrder');
const DailyLog = require('../models/DailyLog');

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
        const activeProjects = await Project.countDocuments({ companyId, status: 'in_progress' });
        const completedProjects = await Project.countDocuments({ companyId, status: 'completed' });
        const atRiskProjects = await Project.countDocuments({ companyId, status: 'on_hold' }); // Using on_hold as proxy for risk for now

        // Tasks & Productivity
        const totalTasks = await Task.countDocuments({ companyId });
        const completedTasks = await Task.countDocuments({ companyId, status: 'completed' });

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


        res.json({
            financials: {
                totalRevenue: totalPaid, // Assuming paid invoices = revenue
                totalInvoiced,
                outstanding: totalOutstanding,
                projectBudget: totalBudget
            },
            projects: {
                total: totalProjects,
                active: activeProjects,
                completed: completedProjects,
                atRisk: atRiskProjects
            },
            labor: {
                totalHours: Math.round(totalLaborHours),
                productivityData
            },
            safety: {
                totalIncidents: safetyIncidentsCount,
                daysIncidentFree
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

        // Shared / Base Metrics
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (['COMPANY_OWNER', 'PM', 'FOREMAN', 'SUBCONTRACTOR'].includes(role)) {
            // Define filters
            const projectFilter = { companyId, status: { $in: ['active', 'planning'] } };
            const jobFilter = { companyId };
            const timeLogFilter = { companyId };
            const poFilter = { companyId, status: { $ne: 'received' } };
            const dailyLogFilter = { companyId };

            if (role === 'PM') {
                const Job = require('../models/Job');
                // Find projects where PM is direct pmId OR creator
                const directProjects = await Project.find({
                    companyId,
                    $or: [{ pmId: userId }, { createdBy: userId }]
                }).select('_id');

                // Find projects where PM is assigned to a job OR created a job
                const jobProjects = await Job.find({
                    $or: [{ foremanId: userId }, { createdBy: userId }]
                }).select('projectId');

                const allProjectIds = [...new Set([
                    ...directProjects.map(p => p._id.toString()),
                    ...jobProjects.filter(j => j.projectId).map(j => j.projectId.toString())
                ])];

                projectFilter._id = { $in: allProjectIds };
                delete projectFilter.status; // PM should see all their projects' stats? 
                // Actually keep status filter if we only want active/planning in the count
                projectFilter.status = { $in: ['active', 'planning'] };

                // jobFilter should also include jobs they created directly
                jobFilter.$or = [
                    { projectId: { $in: allProjectIds } },
                    { createdBy: userId },
                    { foremanId: userId }
                ];

                timeLogFilter.projectId = { $in: allProjectIds };
                poFilter.projectId = { $in: allProjectIds };
                dailyLogFilter.projectId = { $in: allProjectIds };
            } else if (['FOREMAN', 'SUBCONTRACTOR'].includes(role)) {
                const Job = require('../models/Job');
                const managedJobs = await Job.find({ foremanId: userId }).select('_id projectId');
                const jobIds = managedJobs.map(j => j._id);
                const projectIds = managedJobs.map(j => j.projectId);

                projectFilter._id = { $in: projectIds };
                jobFilter._id = { $in: jobIds };
                timeLogFilter.projectId = { $in: projectIds }; // Or more specific to job
                poFilter.projectId = { $in: projectIds };
                dailyLogFilter.projectId = { $in: projectIds };
            }

            const [activeJobsCount, crewOnSiteCount, totalCrew, pos, pendingLogs, recentActivity, recentLogs] = await Promise.all([
                Project.countDocuments(projectFilter),
                TimeLog.countDocuments({ ...timeLogFilter, clockOut: null }),
                User.countDocuments({ companyId, role: { $in: ['WORKER', 'FOREMAN', 'PM'] } }),
                PurchaseOrder.find(poFilter),
                TimeLog.countDocuments({ ...timeLogFilter, status: 'pending' }),
                TimeLog.find(timeLogFilter)
                    .sort({ clockIn: -1 })
                    .limit(5)
                    .populate('userId', 'fullName avatar')
                    .populate({
                        path: 'projectId',
                        select: 'name pmId',
                        populate: { path: 'pmId', select: 'fullName' }
                    }),
                DailyLog.find(dailyLogFilter)
                    .sort({ date: -1 })
                    .limit(3)
                    .populate('reportedBy', 'fullName')
                    .populate({
                        path: 'projectId',
                        select: 'name pmId',
                        populate: { path: 'pmId', select: 'fullName' }
                    })
            ]);

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
                equipmentRunning: 0,
                openPos: pos.length,
                openPosValue: pos.reduce((acc, p) => acc + (p.totalAmount || 0), 0),
                pendingApprovals: pendingLogs
            };

            stats.crewActivity = recentActivity.map(log => ({
                name: log.userId?.fullName || 'Unknown',
                job: log.projectId?.name || 'No Project',
                time: new Date(log.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: log.clockOut ? 'Clocked Out' : 'On Site',
                subtext: log.clockOut ? `${Math.round((new Date(log.clockOut) - new Date(log.clockIn)) / (1000 * 60 * 60))}h total` : null,
                avatar: log.userId?.fullName?.split(' ').map(n => n[0]).join('') || '??'
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

            stats.workerMetrics = {
                myHoursToday: myHoursToday.toFixed(1) + 'h',
                currentJob: activeLog?.projectId?.name || 'Not Clocked In',
                weeklyTarget: '40h',
                weeklyDone: Math.round(totalWeeklyHours) + 'h done',
                isClockedIn: !!activeLog,
                timer: activeLog ? Math.floor((new Date() - new Date(activeLog.clockIn)) / 1000) : 0
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

        // Productivity Data for Chart (last 7 days)
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const productivity = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayName = days[d.getDay()];

            const startOfDay = new Date(d);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(d);
            endOfDay.setHours(23, 59, 59, 999);

            const logs = await TimeLog.find({
                companyId,
                clockIn: { $gte: startOfDay, $lte: endOfDay }
            });

            const totalHours = logs.reduce((acc, log) => {
                const end = log.clockOut || (new Date().toDateString() === d.toDateString() ? new Date() : new Date(endOfDay));
                return acc + Math.max(0, (end - new Date(log.clockIn)) / (1000 * 60 * 60));
            }, 0);

            productivity.push({ day: dayName, hours: Math.round(totalHours) });
        }
        stats.trendData = productivity;

        res.json(stats);
    } catch (error) {
        next(error);
    }
};

module.exports = { getProjectReport, getCompanyReport, getDashboardStats };
