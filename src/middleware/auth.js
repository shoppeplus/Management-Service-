/**
 * Authentication Middleware
 * -------------------------
 * Verifies Firebase ID tokens sent in the Authorization header.
 * In DEMO mode (Firebase not configured), all requests are allowed
 * with a mock user so the frontend can be tested without credentials.
 */

import { auth, isFirebaseReady } from '../config/firebase.js';

/**
 * Express middleware – verifies a Bearer token from the Authorization header.
 * In demo mode, skips verification and attaches a mock user.
 */
export const verifyToken = async (req, res, next) => {
  try {
    // If user is already authenticated by an upstream middleware, proceed.
    if (req.user) {
      return next();
    }

    // ── DEMO MODE: Firebase not configured ──────────────────────
    if (!isFirebaseReady) {
      req.user = {
        uid: 'EMP001',
        name: 'Nguyen Van A',
        email: 'demo@minipancake.vn',
        role: 'admin',
      };
      return next();
    }

    // ── PRODUCTION: Verify Firebase ID Token ────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized – missing or malformed Authorization header.',
      });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized – token not provided.',
      });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(403).json({
      success: false,
      message: 'Forbidden – invalid or expired token.',
    });
  }
};

export default verifyToken;
