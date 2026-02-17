const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['open', 'in_review', 'resolved', 'closed'],
        default: 'open'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dueDate: Date,
    category: {
        type: String,
        enum: ['safety', 'quality', 'technical', 'financial', 'schedule', 'other'],
        default: 'technical'
    },
    photoIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Photo'
    }]
}, {
    timestamps: true
});

const Issue = mongoose.model('Issue', issueSchema);

module.exports = Issue;
