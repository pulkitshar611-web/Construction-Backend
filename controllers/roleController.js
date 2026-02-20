const RolePermission = require('../models/RolePermission');

const DEFAULT_PERMISSIONS = {
    'SUPER_ADMIN': ['ALL'],
    'COMPANY_OWNER': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'MANAGE_PROJECTS', 'VIEW_SCHEDULE', 'MANAGE_SCHEDULE', 'VIEW_TASKS', 'MANAGE_TASKS', 'VIEW_DRAWINGS', 'MANAGE_DRAWINGS', 'VIEW_PHOTOS', 'MANAGE_PHOTOS', 'VIEW_DAILY_LOGS', 'MANAGE_DAILY_LOGS', 'VIEW_ISSUES', 'MANAGE_ISSUES', 'VIEW_CHAT', 'ACCESS_CHAT', 'VIEW_REPORTS', 'ACCESS_SETTINGS', 'CLOCK_IN_OUT', 'CLOCK_IN_CREW', 'VIEW_FINANCIALS', 'MANAGE_FINANCIALS', 'VIEW_RFI', 'MANAGE_RFI', 'VIEW_EQUIPMENT', 'MANAGE_EQUIPMENT'],
    'PM': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'MANAGE_PROJECTS', 'VIEW_SCHEDULE', 'MANAGE_SCHEDULE', 'VIEW_TASKS', 'MANAGE_TASKS', 'VIEW_DRAWINGS', 'MANAGE_DRAWINGS', 'VIEW_PHOTOS', 'MANAGE_PHOTOS', 'VIEW_DAILY_LOGS', 'MANAGE_DAILY_LOGS', 'VIEW_ISSUES', 'MANAGE_ISSUES', 'VIEW_CHAT', 'ACCESS_CHAT', 'VIEW_REPORTS', 'ACCESS_SETTINGS', 'CLOCK_IN_OUT', 'CLOCK_IN_CREW', 'VIEW_FINANCIALS', 'VIEW_RFI', 'MANAGE_RFI', 'VIEW_EQUIPMENT', 'MANAGE_EQUIPMENT'],
    'FOREMAN': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_SCHEDULE', 'VIEW_TASKS', 'MANAGE_TASKS', 'CLOCK_IN_OUT', 'VIEW_DRAWINGS', 'VIEW_PHOTOS', 'VIEW_DAILY_LOGS', 'MANAGE_DAILY_LOGS', 'VIEW_ISSUES', 'VIEW_CHAT', 'ACCESS_CHAT', 'CLOCK_IN_CREW', 'VIEW_RFI'],
    'WORKER': ['VIEW_DASHBOARD', 'VIEW_MY_TASKS', 'CLOCK_IN_OUT', 'VIEW_DRAWINGS', 'VIEW_PHOTOS', 'VIEW_CHAT', 'ACCESS_CHAT'],
    'ENGINEER': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_DRAWINGS', 'MANAGE_DRAWINGS', 'VIEW_PHOTOS', 'VIEW_CHAT', 'ACCESS_CHAT'],
    'CLIENT': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_PHOTOS', 'VIEW_CHAT', 'VIEW_INVOICES'],
    'SUBCONTRACTOR': ['VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_SCHEDULE', 'VIEW_MY_TASKS', 'CLOCK_IN_OUT', 'VIEW_DRAWINGS', 'VIEW_PHOTOS', 'VIEW_DAILY_LOGS', 'VIEW_ISSUES', 'VIEW_CHAT', 'ACCESS_CHAT', 'VIEW_EQUIPMENT', 'VIEW_RFI']
};

// Internal helper to ensure roles are seeded
const seedRoles = async () => {
    for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
        const exists = await RolePermission.findOne({ role });
        if (!exists) {
            await RolePermission.create({ role, permissions: perms });
        }
    }
};

// Run seeding on startup (optional, here we call it inside getRoles)
seedRoles().catch(console.error);


// @desc    Get all role permissions
// @route   GET /api/roles
// @access  Private (SUPER_ADMIN, COMPANY_OWNER)
const getRoles = async (req, res, next) => {
    try {
        const roles = await RolePermission.find();
        res.json(roles);
    } catch (error) {
        next(error);
    }
};

// @desc    Update permissions for a role
// @route   PUT /api/roles/:role
// @access  Private (SUPER_ADMIN)
/*
NOTE: Full dynamic editing of permissions is usually a SUPER_ADMIN feature to ensure system stability.
However, for this Construction SaaS, the COMPANY_OWNER might want to tweak PM vs Foreman roles.
For now, we'll allow COMPANY_OWNER as per implementation plan.
*/
const updateRolePermissions = async (req, res, next) => {
    try {
        const { permissions } = req.body;
        const roleName = req.params.role;

        let rolePerm = await RolePermission.findOne({ role: roleName });

        if (rolePerm) {
            rolePerm.permissions = permissions;
            await rolePerm.save();
        } else {
            rolePerm = await RolePermission.create({
                role: roleName,
                permissions
            });
        }

        // Emit socket event to notify clients
        const io = req.app.get('io');
        if (io) {
            io.emit('permissions_updated', { role: roleName });
        }

        res.json(rolePerm);
    } catch (error) {
        next(error);
    }
};

// @desc    Get permissions for current user's role
// @route   GET /api/roles/my-permissions
// @access  Private
const getMyPermissions = async (req, res, next) => {
    try {
        let rolePerm = await RolePermission.findOne({ role: req.user.role });

        if (!rolePerm) {
            // Fallback to internal defaults if DB record is missing
            const perms = DEFAULT_PERMISSIONS[req.user.role] || [];
            return res.json({
                role: req.user.role,
                permissions: perms
            });
        }
        res.json(rolePerm);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRoles,
    updateRolePermissions,
    getMyPermissions
};
