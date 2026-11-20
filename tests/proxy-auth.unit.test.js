import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Tests for the proxy logic without starting the real server with Google API call.
// We import and test the route handlers and middlewares directly.

import {
    createAuthMiddleware,
    createRateLimiter,
    corsOptions,
    extractToken,
} from "../server/proxyAuth.js";

describe("Proxy Auth & Rate Limit", () => {
    test("extractToken reads Bearer token correctly", () => {
        assert.equal(extractToken("Bearer my-secret-token"), "my-secret-token");
        assert.equal(extractToken("bearer lower-token"), "lower-token");
        assert.equal(extractToken("Basic xyz"), null);
        assert.equal(extractToken(undefined), null);
        assert.equal(extractToken(""), null);
    });

    test("authMiddleware rejects requests with missing Authorization header (401)", async () => {
        const mockVerify = async () => ({ uid: "u123" });
        const middleware = createAuthMiddleware(mockVerify);

        let statusSent, jsonSent;
        const req = { headers: {} };
        const res = {
            status(s) {
                statusSent = s;
                return this;
            },
            json(j) {
                jsonSent = j;
            },
        };
        let nextCalled = false;

        await middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(statusSent, 401);
        assert.deepEqual(jsonSent, { error: "Missing or invalid Authorization header" });
        assert.equal(nextCalled, false);
    });

    test("authMiddleware attaches decoded token claims.uid to req.userId", async () => {
        const mockVerify = async (token) => {
            if (token === "valid-token") return { uid: "user-456", email: "test@selene.ia" };
            throw new Error("Invalid token");
        };
        const middleware = createAuthMiddleware(mockVerify);

        const req = { headers: { authorization: "Bearer valid-token" } };
        const res = {};
        let nextCalled = false;

        await middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(req.userId, "user-456");
    });

    test("authMiddleware rejects invalid tokens (401)", async () => {
        const mockVerify = async () => {
            throw new Error("Token expired");
        };
        const middleware = createAuthMiddleware(mockVerify);

        let statusSent, jsonSent;
        const req = { headers: { authorization: "Bearer expired-token" } };
        const res = {
            status(s) {
                statusSent = s;
                return this;
            },
            json(j) {
                jsonSent = j;
            },
        };

        await middleware(req, res, () => {});

        assert.equal(statusSent, 401);
        assert.deepEqual(jsonSent, { error: "Unauthorized: Invalid or expired token" });
    });

    test("createRateLimiter returns a middleware function", () => {
        const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
        assert.equal(typeof limiter, "function");
        assert.ok(limiter.length >= 3, "Middleware has (req, res, next) signature");
    });

    test("corsOptions rejects origins not in allowed list", (done) => {
        const originFn = corsOptions.origin;

        originFn("http://malicious.com", (err, allow) => {
            assert.ok(err instanceof Error, "Should return Error for disallowed origin");
            assert.equal(err.message, "Not allowed by CORS");
        });

        originFn("http://localhost:5173", (err, allow) => {
            assert.equal(err, null);
            assert.equal(allow, true);
        });

        originFn(undefined, (err, allow) => {
            assert.ok(err instanceof Error, "Should reject requests with no origin");
        });
    });
});
