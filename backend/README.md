# MentorConnect Backend (Full Auth)

## What this contains
- Express server with routes for `/api/auth/signup` and `/api/auth/login`
- MongoDB connection (mongoose)
- User model with roles (mentor / mentee)
- Password hashing with bcrypt
- JWT token generation

## Quick start
1. Copy the repo and `cd` into it
2. Run `npm install`
3. Create a `.env` from `.env.example` and fill MONGO_URI and JWT_SECRET
4. Run `npm run dev` (requires nodemon) or `npm start`

## Endpoints
- POST /api/auth/signup
  body: { name, email, password, role } where role is 'mentor' or 'mentee'
- POST /api/auth/login
  body: { email, password }
  returns: { user, token }
