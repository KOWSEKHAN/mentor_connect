import mongoose from 'mongoose'
import { assertTransactionsAvailable } from './replicaSet.js'

mongoose.set('bufferCommands', false)

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI
    if (!uri) {
      console.error('MONGO_URI not set in .env')
      return
    }
<<<<<<< HEAD
    await mongoose.connect(uri, {})
    console.log('[DB] MongoDB Connected ✔')
    await assertTransactionsAvailable()
=======
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    })
    console.log('MongoDB Connected ✔')
>>>>>>> 3b09b5b (image fif)
  } catch (err) {
    console.error('MongoDB connection error:', err.message)
    process.exit(1)
  }
}

export default connectDB
