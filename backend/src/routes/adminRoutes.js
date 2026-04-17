import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, isAdmin, isSuperAdmin } from '../middleware/auth.js';
import { trackAdminMutations } from '../middleware/adminRateAlert.js';
import {
  getOverview,
  getUsers,
  getUserDetail,
  blockUser,
  unblockUser,
  getAllTransactions,
  getFinancials,
  getPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getCourses,
  getAuditLogs,
  getMetrics,
} from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require a valid JWT + admin-tier role (admin | super_admin)
router.use(protect, isAdmin);

// Stricter rate limit for mutating actions (shared)
const adminActionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Too many admin requests, slow down.' },
});

// ── Overview & Metrics ────────────────────────────────────────────────────────
router.get('/overview',   getOverview);
router.get('/financials', getFinancials);
router.get('/metrics',    getMetrics);           // Fix 6: live metrics endpoint

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users',             getUsers);
router.get('/users/:id',         getUserDetail);
// Fix 2: block/unblock require super_admin for admin-tier targets (enforced in controller)
// Fix 4: trackAdminMutations watches mutation rate for spike alerts
router.post('/users/:id/block',   adminActionLimit, trackAdminMutations, blockUser);
router.post('/users/:id/unblock', adminActionLimit, trackAdminMutations, unblockUser);

// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/transactions', getAllTransactions);

// ── Withdrawals ───────────────────────────────────────────────────────────────
router.get('/withdrawals', getPendingWithdrawals);
// Fix 2: Approve/reject are financial operations — restricted to super_admin
// Fix 4: trackAdminMutations on financial mutations
router.post('/withdrawals/:id/approve', adminActionLimit, isSuperAdmin, trackAdminMutations, approveWithdrawal);
router.post('/withdrawals/:id/reject',  adminActionLimit, isSuperAdmin, trackAdminMutations, rejectWithdrawal);

// ── Courses ───────────────────────────────────────────────────────────────────
router.get('/courses', getCourses);

// ── Audit logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', getAuditLogs);

export default router;
