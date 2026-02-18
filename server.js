require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { errorHandler } = require('./middlewares/errorMiddleware');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const projectRoutes = require('./routes/projectRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const taskRoutes = require('./routes/taskRoutes');
const timeLogRoutes = require('./routes/timeLogRoutes');
const photoRoutes = require('./routes/photoRoutes');
const drawingRoutes = require('./routes/drawingRoutes');
const issueRoutes = require('./routes/issueRoutes');
const dailyLogRoutes = require('./routes/dailyLogRoutes');
const estimateRoutes = require('./routes/estimateRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const purchaseOrderRoutes = require('./routes/purchaseOrderRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const roleRoutes = require('./routes/roleRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const planRoutes = require('./routes/planRoutes');
const jobRoutes = require('./routes/jobRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for now (adjust for production)
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
    }
});

// Connect to Database
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/timelogs', timeLogRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/drawings', drawingRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/dailylogs', dailyLogRoutes);
app.use('/api/estimates', estimateRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/jobs', jobRoutes);

// Root Route
app.get('/', (req, res) => {
    res.send('Construction SaaS Backend API is running...');
});

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_project', (projectId) => {
        socket.join(projectId);
        console.log(`User joined project room: ${projectId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Make io available in routes
app.set('io', io);

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
