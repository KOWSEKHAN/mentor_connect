import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { createServer } from 'http'
import { Server } from 'socket.io'
import connectDB from './src/config/db.js'
import Message from './src/models/Message.js'
import User from './src/models/User.js'
import Mentorship from './src/models/Mentorship.js'

dotenv.config()
const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret'
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

import authRoutes from './src/routes/authRoutes.js'
import mentorshipRoutes from './src/routes/mentorshipRoutes.js'
import courseRoutes from './src/routes/courseRoutes.js'
import mentorRoutes from './src/routes/mentorRoutes.js'
import menteeRoutes from './src/routes/menteeRoutes.js'
import aiRoutes from './src/routes/aiRoutes.js'
import searchRoutes from './src/routes/searchRoutes.js'
import profileRoutes from './src/routes/profileRoutes.js'
import messageRoutes from './src/routes/messageRoutes.js'
import roadmapRoutes from './src/routes/roadmapRoutes.js'
import roadmapRoutesV2 from './src/routes/roadmapRoutesV2.js'
import communityRoutes from './src/routes/communityRoutes.js'
import reviewRoutes from './src/routes/reviewRoutes.js'
import certificateRoutes from './src/routes/certificateRoutes.js'
import pointRoutes from './src/routes/pointRoutes.js'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
    allowEIO3: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
})

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}))
app.use(express.json())

app.use('/uploads', express.static('uploads'))

connectDB()

app.use('/api/auth', authRoutes)
app.use('/api/mentorship', mentorshipRoutes)
app.use('/api/mentorships', mentorshipRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/course', courseRoutes)
app.use('/api/mentors', mentorRoutes)
app.use('/api/mentor', mentorRoutes)
app.use('/api/mentee', menteeRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/roadmaps', roadmapRoutes)
app.use('/api/roadmap', roadmapRoutesV2)
app.use('/api/community', communityRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/review', reviewRoutes)
app.use('/api/certificate', certificateRoutes)
app.use('/api/points', pointRoutes)

app.get('/', (req, res) => res.send('MentorConnect Backend is running'))

const onlineUsers = new Map()
const onlineCommunityUsers = new Map()

const getRoomName = (mentorshipId) =>
  String(mentorshipId).startsWith('mentorship_')
    ? mentorshipId
    : `mentorship_${mentorshipId}`
const getCommunityRoomName = (courseId) => `community_${courseId || 'global'}`

const isMentorshipMember = async (mentorshipId, userId) => {
  if (!mentorshipId || !userId) return false
  const mongoose = (await import('mongoose')).default
  if (!mongoose.Types.ObjectId.isValid(mentorshipId)) return false
  const ms = await Mentorship.findById(mentorshipId).select('mentorId menteeId').lean()
  if (!ms) return false
  const uid = String(userId)
  return uid === String(ms.mentorId) || uid === String(ms.menteeId)
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token

  if (!token) {
    socket.user = { role: 'guest' }
    return next()
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    socket.userId = (decoded.id?.toString?.() || decoded.id)
    socket.user = decoded
  } catch (err) {
    console.warn('Socket auth decode failed:', {
      message: err.message,
      hasEnvSecret: Boolean(process.env.JWT_SECRET),
      tokenLen: String(token).length,
      tokenPrefix: String(token).slice(0, 16),
    })
    socket.user = { role: 'guest' }
  }

  next()
})

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)
  const uid = socket.userId
  if (uid) {
    socket.join(`user_${uid}`)
    onlineUsers.set(uid, socket.id)
    io.emit('user_online', uid)
    console.log(`User ${uid} connected, socket: ${socket.id}`)
  }
  socket.emit('connected', { status: 'connected' })

  socket.on('joinRoom', async (payload = {}) => {
    const { mentorshipId } = payload
    if (!mentorshipId || !socket.userId) return
    if (!(await isMentorshipMember(mentorshipId, socket.userId))) {
      socket.emit('error', { message: 'Not authorized for this mentorship room' })
      return
    }
    const roomName = getRoomName(mentorshipId)
    socket.join(roomName)
    socket.emit('joined_chat', { mentorshipId, room: roomName })
  })

  socket.on('join_chat', async (payload = {}) => {
    const { mentorshipId, chatId } = payload
    const id = mentorshipId || chatId
    if (!id || !socket.userId) {
      socket.emit('error', { message: 'mentorshipId is required' })
      return
    }
    if (!(await isMentorshipMember(id, socket.userId))) {
      socket.emit('error', { message: 'Not authorized for this mentorship room' })
      return
    }
    const roomName = getRoomName(id)
    socket.join(roomName)
    socket.emit('joined_chat', { mentorshipId: id, room: roomName })
    console.log(`Socket ${socket.id} joined room: ${roomName}`)
  })

  socket.on('leave_chat', (payload = {}) => {
    const { mentorshipId, chatId } = payload
    const id = mentorshipId || chatId
    if (!id) return
    const roomName = getRoomName(id)
    socket.leave(roomName)
    console.log(`Socket ${socket.id} left room: ${roomName}`)
  })

  socket.on('send_message', async (data) => {
    const payload = data || {}
    const { mentorshipId, receiverId, content } = payload
    const mentId = mentorshipId

    try {
      if (!mentId || !content || !receiverId) {
        console.error('Invalid message payload:', payload)
        socket.emit('error', { message: 'Missing required fields' })
        return
      }
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authorized' })
        return
      }

      const mongoose = (await import('mongoose')).default
      if (!mongoose.Types.ObjectId.isValid(mentId)) {
        socket.emit('error', { message: 'Invalid mentorshipId format' })
        return
      }

      const mentorship = await Mentorship.findById(mentId).select('mentorId menteeId').lean()
      if (!mentorship) {
        socket.emit('error', { message: 'Mentorship not found' })
        return
      }

      const senderId = String(socket.userId)
      const mentorIdStr = String(mentorship.mentorId)
      const menteeIdStr = String(mentorship.menteeId)
      const isMember = senderId === mentorIdStr || senderId === menteeIdStr
      if (!isMember) {
        socket.emit('error', { message: 'Not authorized to send in this mentorship' })
        return
      }

      const expectedReceiverId = senderId === mentorIdStr ? menteeIdStr : mentorIdStr
      if (String(receiverId) !== expectedReceiverId) {
        socket.emit('error', { message: 'Invalid receiver for mentorship' })
        return
      }

      const sender = await User.findById(senderId).select('name')
      const senderName = sender?.name || 'Unknown'
      const senderRole = senderId === mentorIdStr ? 'mentor' : 'mentee'

      const msg = await Message.create({
        mentorshipId: mentId,
        senderId,
        senderRole,
        text: String(content).trim(),
        status: 'sent',
        deliveredTo: [expectedReceiverId],
        readBy: []
      })

      const formattedMessage = {
        _id: msg._id,
        mentorshipId: msg.mentorshipId.toString(),
        senderId: msg.senderId.toString(),
        senderRole: msg.senderRole,
        text: msg.text,
        status: msg.status,
        from: senderName,
        message: msg.text,
        timestamp: msg.createdAt,
        createdAt: msg.createdAt,
        deliveredTo: msg.deliveredTo || [],
        readBy: msg.readBy || []
      }

      const roomName = getRoomName(mentId)

      io.to(roomName).emit('receive_message', formattedMessage)

      console.log(`Message ${msg._id} sent in room ${roomName} by ${senderName}`)
    } catch (err) {
      console.error('Error handling send_message:', err)
      socket.emit('error', { message: 'Failed to send message', error: err.message })
    }
  })

  socket.on('message_delivered_ack', async (payload = {}) => {
    const { messageId, mentorshipId } = payload
    const uid = socket.userId
    if (!uid || !messageId || !mentorshipId) return
    try {
      if (!(await isMentorshipMember(mentorshipId, uid))) return
      const msg = await Message.findById(messageId)
      if (!msg) return
      if (String(msg.mentorshipId) !== String(mentorshipId)) return
      if (String(msg.senderId) === String(uid)) return

      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { deliveredTo: uid },
        $set: { status: 'delivered' },
      })

      const roomName = getRoomName(mentorshipId)
      io.to(roomName).emit('message_delivered', {
        messageId,
        status: 'delivered',
        deliveredTo: [uid],
      })
    } catch (err) {
      console.error('message_delivered_ack failed:', err.message)
    }
  })

  socket.on('typing', (payload = {}) => {
    const { chatId, mentorshipId } = payload
    const userId = socket.userId
    const id = mentorshipId || chatId
    if (!id || !userId) return
    const roomName = getRoomName(id)
    socket.to(roomName).emit('user_typing', userId)
    socket.to(roomName).emit('typing', userId)
  })

  socket.on('stop_typing', (payload = {}) => {
    const { chatId, mentorshipId } = payload
    const userId = socket.userId
    const id = mentorshipId || chatId
    if (!id || !userId) return
    const roomName = getRoomName(id)
    socket.to(roomName).emit('user_stop_typing', userId)
    socket.to(roomName).emit('stop_typing', userId)
  })

  socket.on('message_seen', async (payload = {}) => {
    const { chatId, mentorshipId } = payload
    const mentId = mentorshipId || chatId
    const uid = socket.userId
    if (!mentId || !uid) return
    if (!(await isMentorshipMember(mentId, uid))) return

    try {
      const mongoose = (await import('mongoose')).default
      if (!mongoose.Types.ObjectId.isValid(mentId)) return

      await Message.updateMany(
        { mentorshipId: mentId, senderId: { $ne: uid } },
        { $set: { status: 'seen' } }
      )

      const roomName = getRoomName(mentId)
      io.to(roomName).emit('messages_seen', { chatId: mentId })
    } catch (err) {
      console.error('Error handling message_seen:', err)
    }
  })

  socket.on('joinCommunityRoom', (payload = {}) => {
    const { courseId } = payload
    socket.data.communityCourseId = courseId || 'global'
    const room = getCommunityRoomName(courseId)
    socket.join(room)
    console.log(`Socket ${socket.id} joined ${room}`)
  })

  socket.on('sendCommunityMessage', async (data) => {
    try {
      const uid = socket.userId
      const { courseId, text } = data || {}
      if (!uid || !text) {
        console.warn('Invalid community message payload')
        return
      }

      const CommunityMessage = (await import('./src/models/CommunityMessage.js')).default
      const mongoose = (await import('mongoose')).default
      const trimmed = String(text).trim().slice(0, 5000)
      const room = getCommunityRoomName(courseId)
      const sender = await User.findById(uid).select('name role').lean()
      if (!sender) return

      const createPayload = {
        senderId: uid,
        senderName: sender.name || 'Unknown',
        senderRole: sender.role === 'mentor' ? 'mentor' : 'mentee',
        message: trimmed,
      }
      if (courseId && mongoose.Types.ObjectId.isValid(courseId) && String(new mongoose.Types.ObjectId(courseId)) === courseId) {
        createPayload.courseId = courseId
      }

      const msg = await CommunityMessage.create(createPayload)
      io.to(room).emit('newCommunityMessage', {
        _id: msg._id,
        courseId: msg.courseId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        message: msg.message,
        edited: msg.edited,
        editedAt: msg.editedAt,
        deleted: msg.deleted,
        reactions: msg.reactions || [],
        createdAt: msg.createdAt,
      })
      console.log(`Community message broadcasted to ${room}`)
    } catch (err) {
      console.error('Community chat error:', err)
    }
  })

  socket.on('community_typing', (payload = {}) => {
    const { courseId } = payload
    const uid = socket.userId
    if (!uid) return
    if (courseId) socket.data.communityCourseId = courseId
    const room = getCommunityRoomName(courseId || socket.data?.communityCourseId)
    socket.to(room).emit('community_typing', {
      userId: uid,
      name: socket.userName || 'Someone',
    })
  })

  socket.on('community_stop_typing', (payload = {}) => {
    const { courseId } = payload
    const uid = socket.userId
    if (!uid) return
    if (courseId) socket.data.communityCourseId = courseId
    const room = getCommunityRoomName(courseId || socket.data?.communityCourseId)
    socket.to(room).emit('community_stop_typing', { userId: uid })
  })

  socket.on('community_message_edit', async (data) => {
    const uid = socket.userId
    if (!uid || !data?.messageId || !data?.message) return
    try {
      const CommunityMessage = (await import('./src/models/CommunityMessage.js')).default
      const msg = await CommunityMessage.findById(data.messageId)
      if (!msg || msg.senderId.toString() !== uid.toString()) {
        socket.emit('error', { message: 'Not authorized to edit' })
        return
      }
      msg.message = String(data.message).trim().slice(0, 5000)
      msg.edited = true
      msg.editedAt = new Date()
      await msg.save()
      const payload = {
        _id: msg._id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        message: msg.message,
        edited: true,
        editedAt: msg.editedAt,
        deleted: msg.deleted,
        reactions: msg.reactions || [],
        createdAt: msg.createdAt,
      }
      const room = getCommunityRoomName(msg.courseId?.toString?.() || data?.courseId)
      io.to(room).emit('community_message_edit', payload)
    } catch (err) {
      console.error('community_message_edit failed:', err)
      socket.emit('error', { message: 'Failed to edit message' })
    }
  })

  socket.on('community_message_delete', async (payload = {}) => {
    const { messageId, courseId } = payload
    const uid = socket.userId
    if (!uid || !messageId) return
    try {
      const CommunityMessage = (await import('./src/models/CommunityMessage.js')).default
      const msg = await CommunityMessage.findById(messageId)
      if (!msg || msg.senderId.toString() !== uid.toString()) {
        socket.emit('error', { message: 'Not authorized to delete' })
        return
      }
      msg.deleted = true
      await msg.save()
      const room = getCommunityRoomName(msg.courseId?.toString?.() || courseId)
      io.to(room).emit('community_message_delete', { messageId: msg._id })
    } catch (err) {
      console.error('community_message_delete failed:', err)
      socket.emit('error', { message: 'Failed to delete message' })
    }
  })

  socket.on('community_reaction', async (data) => {
    const uid = socket.userId
    if (!uid || !data?.messageId || !data?.emoji) return
    try {
      const CommunityMessage = (await import('./src/models/CommunityMessage.js')).default
      const msg = await CommunityMessage.findById(data.messageId)
      if (!msg) return
      const mongoose = (await import('mongoose')).default
      const uidObj = new mongoose.Types.ObjectId(uid)
      let reactions = msg.reactions || []
      const rIdx = reactions.findIndex((r) => r.emoji === data.emoji)
      if (rIdx >= 0) {
        const users = (reactions[rIdx].users || []).filter((u) => u.toString() !== uid)
        if (users.length === 0) {
          reactions = reactions.filter((_, i) => i !== rIdx)
        } else {
          reactions[rIdx] = { ...reactions[rIdx], users }
        }
      } else {
        reactions.push({ emoji: data.emoji, users: [uidObj] })
      }
      msg.reactions = reactions
      await msg.save()
      const payload = {
        _id: msg._id,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        message: msg.message,
        edited: msg.edited,
        editedAt: msg.editedAt,
        deleted: msg.deleted,
        reactions: msg.reactions || [],
        createdAt: msg.createdAt,
      }
      const room = getCommunityRoomName(msg.courseId?.toString?.() || data?.courseId)
      io.to(room).emit('community_reaction', payload)
    } catch (err) {
      console.error('community_reaction failed:', err)
      socket.emit('error', { message: 'Failed to update reaction' })
    }
  })

  socket.on('message_read', async (payload = {}) => {
    const { messageId } = payload
    const uid = socket.userId
    if (!messageId || !uid) return
    try {
      const msg = await Message.findById(messageId)
      if (!msg) return
      const mentId = msg.mentorshipId.toString()
      if (!(await isMentorshipMember(mentId, uid))) return
      const roomName = getRoomName(mentId)
      await Message.findByIdAndUpdate(messageId, { $addToSet: { readBy: uid } })
      io.to(roomName).emit('message_read_update', { messageId, userId: uid })
    } catch (err) {
      console.error('message_read failed:', err.message)
    }
  })

  socket.on('disconnect', async () => {
    const uid = socket.userId
    if (uid) {
      onlineUsers.delete(uid)
      onlineCommunityUsers.delete(uid)
      try {
        await User.findByIdAndUpdate(uid, { lastSeen: new Date() })
      } catch (e) {
        console.error('lastSeen update failed:', e.message)
      }
      io.emit('user_offline', uid)
      const room = getCommunityRoomName(socket.data?.communityCourseId)
      io.to(room).emit(
        'community_users_online',
        Array.from(onlineCommunityUsers.values())
      )
      console.log(`User ${uid} offline`)
    }
    console.log('Socket disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Socket.IO server ready`)
})
