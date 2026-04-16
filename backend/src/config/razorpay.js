import Razorpay from 'razorpay';

// SECURITY: Fail fast if credentials are absent.
// Never fall back to dummy/hardcoded values — that silently causes 401s.
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error(
    '[RAZORPAY_ERROR] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set. ' +
    'Add them to backend/.env and restart the server.'
  );
  throw new Error('Razorpay not configured: missing environment variables');
}

console.log(
  '[RAZORPAY] Initialized with key:',
  process.env.RAZORPAY_KEY_ID.slice(0, 12) + '...' // log prefix only — never log the secret
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default razorpay;
