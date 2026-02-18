const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
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
    scheduleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule'
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    assignedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    dueDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['todo', 'in_progress', 'review', 'completed'],
        default: 'todo'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    attachments: [{
        name: String,
        url: String,
        fileType: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    completionOTP: {
        type: String
    }
}, {
    timestamps: true
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
