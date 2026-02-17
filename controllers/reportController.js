const Project = require('../models/Project');
const Task = require('../models/Task');
const TimeLog = require('../models/TimeLog');
const Invoice = require('../models/Invoice');
const Issue = require('../models/Issue');

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
module.exports = { getProjectReport, getCompanyReport };
