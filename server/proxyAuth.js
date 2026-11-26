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

const DEFAULT_PRODUCTION_ORIGINS = ["https://seleneai2-0.web.app"];

// In development Vite may pick any port when 5173 is busy; pinning is done in vite.config.js.
const DEV_LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function createCorsOptions({
    nodeEnv = process.env.NODE_ENV,
    allowedOrigins = DEFAULT_PRODUCTION_ORIGINS,
} = {}) {
    const productionOrigins = Array.isArray(allowedOrigins) ? allowedOrigins : [];

    return {
        origin(origin, callback) {
            // Reject requests with no origin (curl, server-to-server)
            if (!origin) {
                return callback(new Error("Not allowed by CORS"));
            }

            const allowed = productionOrigins.includes(origin)
                || (nodeEnv !== "production" && DEV_LOCAL_ORIGIN.test(origin));
            if (allowed) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: false,
    };
}

const PRODUCTION_ORIGIN = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || DEFAULT_PRODUCTION_ORIGINS;

export const corsOptions = createCorsOptions({ allowedOrigins: PRODUCTION_ORIGIN });