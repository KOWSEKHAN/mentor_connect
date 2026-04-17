// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config/jwt.js';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    if (user.blocked) return res.status(403).json({ message: 'Account suspended. Contact support.' });
    // Fix 1: Token version check — instantly invalidates sessions on block/unblock
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: 'Session invalidated. Please log in again.' });
    }
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

// Convenience alias — use on all /api/admin/* routes
// Both 'admin' and 'super_admin' can access general admin routes
export const isAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Admin access only' });
  }
  next();
};

// Restrict critical actions (block admins, approve payouts) to super_admin only
export const isSuperAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required for this action' });
  }
  next();
};
