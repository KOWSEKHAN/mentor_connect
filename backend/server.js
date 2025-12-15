import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import connectDB from './src/config/db.js'

import authRoutes from './src/routes/authRoutes.js'
import mentorRequestRoutes from './src/routes/mentorRequestRoutes.js'
import mentorshipRoutes from './src/routes/mentorshipRoutes.js'
import courseRoutes from './src/routes/courseRoutes.js'
import mentorRoutes from './src/routes/mentorRoutes.js'
import menteeRoutes from './src/routes/menteeRoutes.js'
import aiRoutes from './src/routes/aiRoutes.js'
import searchRoutes from './src/routes/searchRoutes.js'
import profileRoutes from './src/routes/profileRoutes.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

// Static serving for uploaded resumes
app.use('/uploads', express.static('uploads'))

// Connect to MongoDB
connectDB()

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/mentorship', mentorRequestRoutes)
app.use('/api/mentorship', mentorshipRoutes)
app.use('/api/mentorships', mentorshipRoutes) // Alternative route for /api/mentorships/mentor
app.use('/api/courses', courseRoutes)
app.use('/api/course', courseRoutes)
app.use('/api/mentors', mentorRoutes)
app.use('/api/mentor', mentorRoutes)
app.use('/api/mentee', menteeRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/profile', profileRoutes)

app.get('/', (req, res) => res.send('MentorConnect Backend is running'))

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  socket.on('join-room', (roomName) => {
    socket.join(roomName)
    console.log(`Socket ${socket.id} joined room: ${roomName}`)
  })

  socket.on('leave-room', (roomName) => {
    socket.leave(roomName)
    console.log(`Socket ${socket.id} left room: ${roomName}`)
  })

  socket.on('chat-message', (data) => {
    // Broadcast to room
    io.to(data.room).emit('chat-message', {
      from: data.from,
      message: data.message,
      timestamp: new Date()
    })
  })

  socket.on('typing', (data) => {
    socket.to(data.room).emit('typing', {
      user: data.user,
      isTyping: data.isTyping
    })
  })

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
