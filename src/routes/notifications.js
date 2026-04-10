const express = require('express');
const router = express.Router();

// In-Memory Array für Notifications
let notifications = [
    {
        id: 1,
        title: 'Welcome to BLUN',
        message: 'Your account has been created successfully',
        isRead: false,
        timestamp: new Date('2026-04-10T08:00:00Z')
    },
    {
        id: 2,
        title: 'System Update',
        message: 'New features are now available',
        isRead: false,
        timestamp: new Date('2026-04-10T09:30:00Z')
    },
    {
        id: 3,
        title: 'Payment Processed',
        message: 'Your subscription has been renewed',
        isRead: true,
        timestamp: new Date('2026-04-09T14:20:00Z')
    }
];

let nextId = 4;

// GET /api/notifications - Liste aller Notifications
router.get('/', (req, res) => {
    try {
        // Sortiere nach Timestamp (neueste zuerst)
        const sortedNotifications = notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json({
            success: true,
            data: sortedNotifications,
            count: notifications.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications'
        });
    }
});

// POST /api/notifications/mark-read/:id - Markiere als gelesen
router.post('/mark-read/:id', (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);

        if (isNaN(notificationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid notification ID'
            });
        }

        const notification = notifications.find(n => n.id === notificationId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        notification.isRead = true;

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: notification
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to mark notification as read'
        });
    }
});

// DELETE /api/notifications/:id - Lösche Notification
router.delete('/:id', (req, res) => {
    try {
        const notificationId = parseInt(req.params.id);

        if (isNaN(notificationId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid notification ID'
            });
        }

        const notificationIndex = notifications.findIndex(n => n.id === notificationId);

        if (notificationIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        const deletedNotification = notifications.splice(notificationIndex, 1)[0];

        res.json({
            success: true,
            message: 'Notification deleted successfully',
            data: deletedNotification
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to delete notification'
        });
    }
});

module.exports = router;