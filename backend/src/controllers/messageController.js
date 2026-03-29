// backend/src/controllers/messageController.js
import Message from '../models/Message.js';
import User from '../models/User.js';
import Mentorship from '../models/Mentorship.js';

/**
 * Get message history for a mentorship
 * GET /api/messages/:mentorshipId
 */
export const getMessagesByMentorship = async (req, res) => {
  try {
    const { mentorshipId } = req.params;
    const userId = req.user._id;

    if (!mentorshipId) {
      return res.status(400).json({ message: 'mentorshipId is required' });
    }

    // Validate ObjectId
    const mongoose = (await import('mongoose')).default
    if (!mongoose.Types.ObjectId.isValid(mentorshipId)) {
      return res.status(400).json({ message: 'Invalid mentorshipId format' });
    }

    const mentorship = await Mentorship.findById(mentorshipId).select('mentorId menteeId').lean();
    if (!mentorship) {
      return res.status(404).json({ message: 'Mentorship not found' });
    }

    const requestUserId = String(userId);
    const mentorId = mentorship.mentorId?.toString?.() || String(mentorship.mentorId || '');
    const menteeId = mentorship.menteeId?.toString?.() || String(mentorship.menteeId || '');
    if (requestUserId !== mentorId && requestUserId !== menteeId) {
      return res.status(403).json({ message: 'Not authorized to view these messages' });
    }

    // Fetch messages
    const messages = await Message.find({ mentorshipId })
      .populate('senderId', 'name email')
      .sort({ createdAt: 1 })
      .lean();

    // Format messages for frontend (status, deliveredTo, readBy for ticks)
    const formattedMessages = messages.map(msg => {
      const senderIdStr = (msg.senderId && msg.senderId._id ? msg.senderId._id : msg.senderId).toString();
      const deliveredTo = (msg.deliveredTo || []).map(id => (id && id._id ? id._id : id).toString());
      const readBy = (msg.readBy || []).map(id => (id && id._id ? id._id : id).toString());
      let status = msg.status || 'sent';
      if (readBy.length > 0) status = 'seen';
      else if (deliveredTo.length > 0) status = 'delivered';
      return {
        _id: msg._id,
        mentorshipId: msg.mentorshipId.toString(),
        senderId: senderIdStr,
        senderRole: msg.senderRole,
        text: msg.text,
        status,
        deliveredTo,
        readBy,
        from: msg.senderId?.name || 'Unknown',
        message: msg.text,
        timestamp: msg.createdAt,
        createdAt: msg.createdAt
      };
    });

    return res.json({ messages: formattedMessages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
