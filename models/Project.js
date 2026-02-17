const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // References a user with role CLIENT
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    budget: {
        type: Number,
        default: 0
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    status: {
        type: String,
        enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        default: 'planning'
    },
    location: {
        address: String,
        latitude: Number,
        longitude: Number
    },
    geofenceRadius: {
        type: Number,
        default: 200 // in meters
    },
    image: {
        type: String // Base64 or URL
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;
