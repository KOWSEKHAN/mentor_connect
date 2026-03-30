let hasLoggedSecret = false;

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not defined');
  }

  if (!hasLoggedSecret) {
    console.log('JWT_SECRET used:', secret);
    hasLoggedSecret = true;
  }

  return secret;
}
