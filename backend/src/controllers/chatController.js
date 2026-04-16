// backend/src/controllers/chatController.js
import Message from '../models/Message.js';

/**
 * Get message history for a course
 * GET /api/chat/:courseId
 */
export const getChatHistory = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    if (!courseId) {
      return res.status(400).json({ message: 'courseId is required' });
    }

    // Fetch messages sorted by timestamp ASC
    const messages = await Message.find({ courseId })
      .populate('senderId', 'name email')
      .populate('receiverId', 'name email')
      .sort({ timestamp: 1 })
      .lean();

    // Format for frontend
    const formattedMessages = messages.map(msg => ({
      ...msg,
      _id: msg._id,
      courseId: msg.courseId?.toString() || courseId,
      senderId: msg.senderId?._id?.toString() || msg.senderId?.toString(),
      receiverId: msg.receiverId?._id?.toString() || msg.receiverId?.toString(),
      senderRole: msg.senderRole,
      text: msg.message || msg.text,
      message: msg.message || msg.text,
      status: msg.status || 'sent',
      from: msg.senderId?.name || 'Unknown',
      timestamp: msg.timestamp || msg.createdAt,
      createdAt: msg.createdAt
    }));

    return res.json({ messages: formattedMessages });
  } catch (err) {
    console.error('Error fetching chat history:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
