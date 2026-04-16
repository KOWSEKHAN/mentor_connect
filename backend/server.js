import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { createServer } from 'http'
import { Server } from 'socket.io'
import connectDB from './src/config/db.js'
import Message from './src/models/Message.js'
import User from './src/models/User.js'
import Mentorship from './src/models/Mentorship.js'
import Course from './src/models/Course.js'
import { setRealtimeIO, mentorshipCourseRoom } from './src/socket/realtime.js'
import { metrics } from './src/observability/metrics.js'

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const SECRET = process.env.JWT_SECRET

import authRoutes from './src/routes/authRoutes.js'
import mentorshipRoutes from './src/routes/mentorshipRoutes.js'
import courseRoutes from './src/routes/courseRoutes.js'
import mentorRoutes from './src/routes/mentorRoutes.js'
import menteeRoutes from './src/routes/menteeRoutes.js'
import aiRoutes from './src/routes/aiRoutes.js'
import searchRoutes from './src/routes/searchRoutes.js'
import profileRoutes from './src/routes/profileRoutes.js'
import messageRoutes from './src/routes/messageRoutes.js'
import chatRoutes from './src/routes/chatRoutes.js'
import roadmapRoutes from './src/routes/roadmapRoutes.js'
import roadmapRoutesV2 from './src/routes/roadmapRoutesV2.js'
import communityRoutes from './src/routes/communityRoutes.js'
import reviewRoutes from './src/routes/reviewRoutes.js'
import certificateRoutes from './src/routes/certificateRoutes.js'
import pointRoutes from './src/routes/pointRoutes.js'
import structuredLearningRoutes from './src/routes/structuredLearningRoutes.js'
import realtimeRoutes from './src/routes/realtimeRoutes.js'
import walletRoutes from './src/routes/walletRoutes.js'
import paymentRoutes from './src/routes/paymentRoutes.js'
import { startProgressIntegrityJob } from './src/jobs/progressIntegrityJob.js'

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
setRealtimeIO(io)

app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}))
app.use(express.json({ limit: '1mb' }))

app.use('/uploads', express.static('uploads'))

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
app.use('/api/messages', messageRoutes) // Keep existing for backwards compatibility
app.use('/api/chat', chatRoutes)
app.use('/api/roadmaps', roadmapRoutes)
app.use('/api/roadmap', roadmapRoutesV2)
app.use('/api/community', communityRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/review', reviewRoutes)
app.use('/api/certificate', certificateRoutes)
app.use('/api/points', pointRoutes)
app.use('/api/structured', structuredLearningRoutes)
app.use('/api/realtime', realtimeRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/payment', paymentRoutes)

app.get('/', (req, res) => res.send('MentorConnect Backend is running'))

const onlineUsers = new Map()
const onlineCommunityUsers = new Map()
const userSockets = new Map()

const getRoomName = (mentorshipId) =>
  String(mentorshipId).startsWith('mentorship_')
    ? mentorshipId
    : `mentorship_${mentorshipId}`
const getCommunityRoomName = (courseId) => `community_${courseId || 'global'}`
const getMentorshipCourseRoomName = (courseId) => mentorshipCourseRoom(courseId)

const isMentorshipMember = async (mentorshipId, userId) => {
  if (!mentorshipId || !userId) return false
  const mongoose = (await import('mongoose')).default
  if (!mongoose.Types.ObjectId.isValid(mentorshipId)) return false
  const ms = await Mentorship.findById(mentorshipId).select('mentorId menteeId').lean()
  if (!ms) return false
  const uid = String(userId)
  return uid === String(ms.mentorId) || uid === String(ms.menteeId)
}

const isCourseMember = async (courseId, userId) => {
  if (!courseId || !userId) return false
  const mongoose = (await import('mongoose')).default
  if (!mongoose.Types.ObjectId.isValid(courseId)) return false
  const course = await Course.findById(courseId).select('mentor mentorId mentee menteeId').lean()
  if (!course) return false
  const uid = String(userId)
  const mentorId = String(course.mentor?._id || course.mentor || course.mentorId || '')
  const menteeId = String(course.mentee?._id || course.mentee || course.menteeId || '')
  return uid === mentorId || uid === menteeId
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('No token'))
    if (!SECRET) return next(new Error('Unauthorized'))

    const decoded = jwt.verify(token, SECRET)
    socket.userId = (decoded.id?.toString?.() || decoded.id)
    socket.user = decoded
    return next()
  } catch (err) {
    console.error('Socket auth failed')
    return next(new Error('Unauthorized'))
  }
})

io.on('connection', (socket) => {
  metrics.inc('active_socket_connections')
  socket.on('mentorship_realtime_reconnect_ack', () => {
    metrics.inc('reconnect_hints')
  })
  const uid = socket.userId
  if (uid) {
    socket.join(`user_${uid}`)
    const existing = userSockets.get(uid) || new Set()
    const wasEmpty = existing.size === 0
    existing.add(socket.id)
    userSockets.set(uid, existing)
    onlineUsers.set(uid, socket.id)
    if (wasEmpty) io.emit('user_online', uid)
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
  })

  socket.on('join_course_room', async (payload = {}) => {
    const { courseId } = payload
    if (!courseId || !socket.userId) return
    if (!(await isCourseMember(courseId, socket.userId))) {
      socket.emit('error', { message: 'Not authorized for this course room' })
      return
    }
    const roomName = getMentorshipCourseRoomName(courseId)
    socket.join(roomName)
    socket.emit('joined_course_room', { courseId, room: roomName })
  })

  socket.on('leave_course_room', (payload = {}) => {
    const { courseId } = payload
    if (!courseId) return
    const roomName = getMentorshipCourseRoomName(courseId)
    socket.leave(roomName)
  })

  socket.on('leave_chat', (payload = {}) => {
    const { mentorshipId, chatId } = payload
    const id = mentorshipId || chatId
    if (!id) return
    const roomName = getRoomName(id)
    socket.leave(roomName)
  })

  socket.on('send_message', async (data) => {
    const payload = data || {}
    // If courseId is passed, prioritize it. Fallback to mentorshipId for backwards compat.
    const courseId = payload.courseId
    const cIdStr = courseId ? String(courseId) : null
    const mentorshipId = payload.mentorshipId
    const content = payload.content

    try {
      if (!content || (!courseId && !mentorshipId)) {
        console.error('Message error')
        socket.emit('error', { message: 'Missing required fields' })
        return
      }
      if (!socket.userId) {
        socket.emit('error', { message: 'Not authorized' })
        return
      }

      const senderId = String(socket.userId)

      let menteeIdStr, mentorIdStr, mentIdStr, validCourseId

      if (courseId) {
        const Course = (await import('./src/models/Course.js')).default
        const course = await Course.findById(courseId).select('mentor mentee mentorshipId').lean()
        if (!course) {
          socket.emit('error', { message: 'Course not found' })
          return
        }
        validCourseId = courseId
        mentIdStr = course.mentorshipId?.toString?.() || course.mentorshipId || mentorshipId
        mentorIdStr = course.mentor?.toString?.() || course.mentor || ''
        menteeIdStr = course.mentee?.toString?.() || course.mentee || ''
      } else if (mentorshipId) {
        const Mentorship = (await import('./src/models/Mentorship.js')).default
        const mentorship = await Mentorship.findById(mentorshipId).select('mentorId menteeId').lean()
        if (!mentorship) {
          socket.emit('error', { message: 'Mentorship not found' })
          return
        }
        mentIdStr = mentorshipId
        mentorIdStr = mentorship.mentorId?.toString?.() || mentorship.mentorId || ''
        menteeIdStr = mentorship.menteeId?.toString?.() || mentorship.menteeId || ''
      }

      const isMember = senderId === mentorIdStr || senderId === menteeIdStr
      if (!isMember) {
        socket.emit('error', { message: 'Not authorized to send in this course/mentorship' })
        return
      }

      const expectedReceiverId = senderId === mentorIdStr ? menteeIdStr : mentorIdStr

      const sender = await User.findById(senderId).select('name')
      const senderName = sender?.name || 'Unknown'
      const senderRole = senderId === mentorIdStr ? 'mentor' : 'mentee'

      const msg = await Message.create({
        courseId: validCourseId,
        mentorshipId: mentIdStr, // Keep existing for compat
        senderId,
        receiverId: expectedReceiverId,
        senderRole,
        text: String(content).trim(),
        message: String(content).trim(),
        status: 'sent',
        deliveredTo: [expectedReceiverId],
        readBy: []
      })

      const formattedMessage = {
        _id: msg._id,
        courseId: msg.courseId?.toString(),
        mentorshipId: msg.mentorshipId?.toString(),
        senderId: msg.senderId.toString(),
        receiverId: msg.receiverId?.toString(),
        senderRole: msg.senderRole,
        text: msg.text,
        status: msg.status,
        from: senderName,
        message: msg.message || msg.text,
        timestamp: msg.timestamp || msg.createdAt,
        createdAt: msg.createdAt,
        deliveredTo: msg.deliveredTo || [],
        readBy: msg.readBy || []
      }

      const roomName = getRoomName(validCourseId || mentIdStr)

      io.to(roomName).emit('receive_message', formattedMessage)
    } catch (err) {
      console.error('Message error')
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
    metrics.inc('active_socket_connections', -1)
    socket.leaveAll()
    const uid = socket.userId
    if (uid) {
      const set = userSockets.get(uid)
      if (set) set.delete(socket.id)
      const hasRemaining = set && set.size > 0
      if (!hasRemaining) {
        userSockets.delete(uid)
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
      }
    }
  })
})

if (process.env.CHAOS_MODE === 'true') {
  setInterval(() => {
    try {
      const list = typeof io.sockets?.sockets?.values === 'function'
        ? [...io.sockets.sockets.values()]
        : []
      if (!list.length) return
      const victim = list[Math.floor(Math.random() * list.length)]
      victim.disconnect(true)
      metrics.inc('chaos_forced_disconnects')
    } catch (_) {
      /* ignore */
    }
  }, 45_000)
  console.warn('[CHAOS_MODE] Random socket disconnects enabled (~45s interval, demo only)')
}

const PORT = process.env.PORT || 5000
;(async () => {
  await connectDB()
  startProgressIntegrityJob()
  
  // 5. Start Wallet Reconciliation Job
  const { startReconciliationJob } = await import('./src/jobs/reconcileWallet.js');
  startReconciliationJob();

  if (process.env.REDIS_URL) {
    try {
      const { createClient } = await import('redis')
      const { createAdapter } = await import('@socket.io/redis-adapter')
      const pubClient = createClient({ url: process.env.REDIS_URL })
      const subClient = pubClient.duplicate()
      await Promise.all([pubClient.connect(), subClient.connect()])
      io.adapter(createAdapter(pubClient, subClient))
      console.log('Socket.IO Redis adapter enabled (multi-instance ready)')
    } catch (e) {
      console.error('Redis adapter failed (single-node mode):', e.message)
    }
  }
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
    console.log(`Socket.IO server ready`)
  })
})()
