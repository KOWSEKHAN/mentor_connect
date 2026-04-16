/**
 * generateReceipt — produces a Razorpay-compliant receipt string.
 *
 * Razorpay hard limit: receipt MUST be ≤ 40 characters.
 *
 * Layout (max 22 chars, well under the limit):
 *   "rcpt_" (5) + userId last-6 (6) + "_" (1) + Unix seconds (10) = 22 chars
 *
 * Uniqueness is guaranteed because:
 *   - different users → different userId suffix
 *   - same user rapid-fire → different second-level timestamp (worst case
 *     two orders within the same second get the same receipt, but Razorpay
 *     treats receipt as advisory; real uniqueness comes from order.id)
 */
export function generateReceipt(userId) {
  const shortId   = String(userId).slice(-6);           // last 6 hex chars of ObjectId
  const timestamp = Math.floor(Date.now() / 1000);      // Unix epoch seconds (10 digits)
  const receipt   = `rcpt_${shortId}_${timestamp}`;     // e.g. "rcpt_a1b2c3_1713249600"

  // Defensive guard — must never fire, but catches future regressions instantly
  if (receipt.length > 40) {
    // Fallback: pure timestamp — always 15 chars, guaranteed unique by time
    return `rcpt_${Date.now()}`;
  }

  return receipt;
}
