const Role = require('../models/Role');
const Permission = require('../models/Permission');
const RolePermission = require('../models/RolePermission');
const UserPermission = require('../models/UserPermission');
const User = require('../models/User');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private (SUPER_ADMIN, COMPANY_OWNER)
const getRoles = async (req, res, next) => {
    try {
        const roles = await Role.find().sort({ name: 1 });

        // Fetch permissions for each role
        const rolesWithPerms = await Promise.all(roles.map(async (role) => {
            const rolePermissionDocs = await RolePermission.find({ roleId: role._id }).populate('permissionId');
            return {
                _id: role._id,
                name: role.name,
                description: role.description,
                permissions: rolePermissionDocs.map(rp => rp.permissionId.key)
            };
        }));

        res.json(rolesWithPerms);
    } catch (error) {
        next(error);
    }
};

// @desc    Update permissions for a specific role
// @route   PUT /api/roles/:roleName
// @access  Private (Admin)
const updateRolePermissions = async (req, res, next) => {
    try {
        const { roleName } = req.params;
        const { permissions } = req.body; // Array of permission keys

        const role = await Role.findOne({ name: roleName });
        if (!role) {
            res.status(404);
            throw new Error('Role not found');
        }

        // 1. Delete existing permissions for this role
        await RolePermission.deleteMany({ roleId: role._id });

        // 2. Add new permissions
        if (permissions && Array.isArray(permissions)) {
            for (const key of permissions) {
                const perm = await Permission.findOne({ key });
                if (perm) {
                    await RolePermission.create({
                        roleId: role._id,
                        permissionId: perm._id
                    });
                }
            }
        }

        res.json({ message: `Permissions for role ${roleName} updated successfully` });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all system permissions grouped by module
// @route   GET /api/roles/permissions
// @access  Private (Admin)
const getAllPermissions = async (req, res, next) => {
    try {
        const permissions = await Permission.find().sort({ module: 1, key: 1 });
        res.json(permissions);
    } catch (error) {
        next(error);
    }
};

// @desc    Bulk update permissions for multiple roles
// @route   PUT /api/roles/bulk
// @access  Private (Admin)
const bulkUpdateRolePermissions = async (req, res, next) => {
    try {
        const { roleUpdates } = req.body; // Array of { roleName: 'PM', permissions: ['VIEW_TASKS', ...] }

        if (!roleUpdates || !Array.isArray(roleUpdates)) {
            res.status(400);
            throw new Error('Invalid role updates data');
        }

        for (const update of roleUpdates) {
            const role = await Role.findOne({ name: update.roleName });
            if (!role) continue;

            // Delete existing permissions for this role
            await RolePermission.deleteMany({ roleId: role._id });

            // Add new permissions
            if (update.permissions && Array.isArray(update.permissions)) {
                for (const key of update.permissions) {
                    const perm = await Permission.findOne({ key });
                    if (perm) {
                        await RolePermission.create({
                            roleId: role._id,
                            permissionId: perm._id
                        });
                    }
                }
            }
        }

        res.json({ message: 'Bulk permissions updated successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get permissions for a specific user (Role base + Overrides)
// @route   GET /api/roles/user/:userId
// @access  Private (Admin)
const getUserPermissions = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).populate('roleId');
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Get Permissions from Role
        let rolePerms = [];
        if (user.roleId) {
            const rolePermissionDocs = await RolePermission.find({ roleId: user.roleId }).populate('permissionId');
            rolePerms = rolePermissionDocs.map(rp => rp.permissionId.key);
        } else {
            // Fallback for users without roleId (using string role)
            const roleDoc = await Role.findOne({ name: user.role });
            if (roleDoc) {
                const rolePermissionDocs = await RolePermission.find({ roleId: roleDoc._id }).populate('permissionId');
                rolePerms = rolePermissionDocs.map(rp => rp.permissionId.key);
            }
        }

        // Get Overrides
        const overrides = await UserPermission.find({ userId }).populate('permissionId');

        res.json({
            rolePermissions: rolePerms,
            overrides: overrides.map(o => ({
                key: o.permissionId.key,
                isAllowed: o.isAllowed
            }))
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user permission overrides
// @route   POST /api/roles/user/:userId/overrides
// @access  Private (Admin)
const updateUserOverrides = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { overrides } = req.body; // Array of { key: 'VIEW_RFI', isAllowed: true/false }

        for (const override of overrides) {
            const perm = await Permission.findOne({ key: override.key });
            if (!perm) continue;

            await UserPermission.findOneAndUpdate(
                { userId, permissionId: perm._id },
                { userId, permissionId: perm._id, isAllowed: override.isAllowed },
                { upsert: true, new: true }
            );
        }

        res.json({ message: 'User overrides updated successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Get permissions for current user
// @route   GET /api/roles/my-permissions
// @access  Private
const getMyPermissions = async (req, res, next) => {
    try {
        if (req.user.role === 'SUPER_ADMIN') {
            return res.json({ role: 'SUPER_ADMIN', permissions: ['ALL'] });
        }

        const userId = req.user._id;

        // This is a bit redundant with the middleware logic but good for frontend to have a list
        const allPermsDocs = await Permission.find();
        const finalPermissions = [];

        for (const perm of allPermsDocs) {
            // Check override
            const override = await UserPermission.findOne({ userId, permissionId: perm._id });
            if (override) {
                if (override.isAllowed) finalPermissions.push(perm.key);
                continue;
            }

            // Check role
            let roleId = req.user.roleId;
            if (!roleId) {
                const roleDoc = await Role.findOne({ name: req.user.role });
                if (roleDoc) roleId = roleDoc._id;
            }

            if (roleId) {
                const rolePerm = await RolePermission.findOne({ roleId, permissionId: perm._id });
                if (rolePerm) finalPermissions.push(perm.key);
            }
        }

        res.json({
            role: req.user.role,
            permissions: finalPermissions
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRoles,
    getAllPermissions,
    getUserPermissions,
    updateUserOverrides,
    getMyPermissions,
    updateRolePermissions,
    bulkUpdateRolePermissions
};
