const mongoose = require('mongoose');

const rolePermissionSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        unique: true,
        enum: ['SUPER_ADMIN', 'COMPANY_OWNER', 'PM', 'FOREMAN', 'WORKER', 'ENGINEER', 'CLIENT']
    },
    permissions: [{
        type: String, // e.g., 'CREATE_TASK', 'VIEW_FINANCIALS', etc.
        required: true
    }]
}, {
    timestamps: true
});

const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);

module.exports = RolePermission;
