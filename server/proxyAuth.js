import { getAuth } from "firebase-admin/auth";
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

let adminInitialized = false;

export function initializeFirebaseAdmin() {
    if (adminInitialized) return;
    if (getApps().length === 0) {
        // Try application default credentials first (GCP env, metadata server, etc.)
        // Falls back to explicit service account if GOOGLE_APPLICATION_CREDENTIALS is set
        initializeApp({
            credential: applicationDefault(),
        });
    }
    adminInitialized = true;
}

export function verifyIdToken(token) {
    if (!adminInitialized) initializeFirebaseAdmin();
    return getAuth().verifyIdToken(token);
}

export function extractToken(authHeader) {
    if (!authHeader) return null;
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
}

export function createAuthMiddleware(verifyFn = verifyIdToken) {
    return async (req, res, next) => {
        const token = extractToken(req.headers.authorization);
        if (!token) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }
        try {
            const decoded = await verifyFn(token);
            req.userId = decoded.uid;
            next();
        } catch (err) {
            return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
        }
    };
}

export function createRateLimiter(options = {}) {
    const {
        windowMs = 60000,
        max = 30,
        message = { error: "Too many requests. Please slow down." },
        standardHeaders = true,
        legacyHeaders = false,
    } = options;

    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders,
        legacyHeaders,
        keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
    });
}

const PRODUCTION_ORIGIN = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [
    "https://seleneai2-0.web.app",
];

const DEVELOPMENT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

const ALLOWED_ORIGINS = process.env.NODE_ENV === "production"
    ? PRODUCTION_ORIGIN
    : [...PRODUCTION_ORIGIN, ...DEVELOPMENT_ORIGINS];

export const corsOptions = {
    origin(origin, callback) {
        // Reject requests with no origin (curl, server-to-server)
        if (!origin) {
            return callback(new Error("Not allowed by CORS"));
        }
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: false,
};