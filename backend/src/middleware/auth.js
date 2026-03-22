// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error', err.message);
    return res.status(401).json({ message: 'Not authorized' });
  }
};

export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};
