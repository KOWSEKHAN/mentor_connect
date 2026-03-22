import CommunityMessage from '../models/CommunityMessage.js';

/**
 * Get last 100 community messages sorted ascending (oldest first for chat display).
 */
export const getCommunityMessages = async (req, res) => {
  try {
    const messages = await CommunityMessage.find({ deleted: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    const formatted = messages.map((m) => ({
      _id: m._id,
      senderId: m.senderId,
      senderName: m.senderName,
      senderRole: m.senderRole,
      message: m.message,
      edited: m.edited ?? false,
      editedAt: m.editedAt,
      deleted: m.deleted ?? false,
      reactions: m.reactions || [],
      createdAt: m.createdAt,
    }));

    return res.json({ messages: formatted });
  } catch (err) {
    console.error('getCommunityMessages failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
