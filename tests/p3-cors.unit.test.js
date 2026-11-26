import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";

import { createCorsOptions } from "../server/proxyAuth.js";
import { createCorsErrorHandler } from "../server/corsError.js";

const PRODUCTION_ORIGIN = "https://seleneai2-0.web.app";

function checkOrigin(options, origin) {
    let result;
    options.origin(origin, (err, allow) => {
        result = { err, allow };
    });
    return result;
}

describe("P3 - dev origin matching", () => {
    const dev = () => createCorsOptions({ nodeEnv: "development", allowedOrigins: [PRODUCTION_ORIGIN] });

    test("allows a Vite port drifted to 5174 in development", () => {
        const { err, allow } = checkOrigin(dev(), "http://localhost:5174");
        assert.equal(err, null);
        assert.equal(allow, true);
    });

    test("allows 127.0.0.1 on another local port in development", () => {
        const { err, allow } = checkOrigin(dev(), "http://127.0.0.1:5199");
        assert.equal(err, null);
        assert.equal(allow, true);
    });

    test("keeps allowing the original localhost:5173 in development", () => {
        const { err, allow } = checkOrigin(dev(), "http://localhost:5173");
        assert.equal(err, null);
        assert.equal(allow, true);
    });

    test("keeps allowing the configured production origin in development", () => {
        const { err, allow } = checkOrigin(dev(), PRODUCTION_ORIGIN);
        assert.equal(err, null);
        assert.equal(allow, true);
    });

    test("rejects an unknown host and a request with no origin", () => {
        const malicious = checkOrigin(dev(), "http://malicious.com");
        assert.ok(malicious.err instanceof Error);
        assert.equal(malicious.err.message, "Not allowed by CORS");

        const absent = checkOrigin(dev(), undefined);
        assert.ok(absent.err instanceof Error);
        assert.equal(absent.err.message, "Not allowed by CORS");
    });

    test("rejects dev localhost origins in production", () => {
        const prod = createCorsOptions({ nodeEnv: "production", allowedOrigins: [PRODUCTION_ORIGIN] });
        for (const origin of ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"]) {
            const { err, allow } = checkOrigin(prod, origin);
            assert.ok(err instanceof Error, `${origin} must be rejected in production`);
            assert.equal(allow, undefined);
        }
    });

    test("allows only the exact configured origin in production", () => {
        const prod = createCorsOptions({ nodeEnv: "production", allowedOrigins: [PRODUCTION_ORIGIN] });
        const { err, allow } = checkOrigin(prod, PRODUCTION_ORIGIN);
        assert.equal(err, null);
        assert.equal(allow, true);
    });

    test("does not enable credentials", () => {
        assert.equal(dev().credentials, false);
    });

    test("rejects lookalike hosts, userinfo, https and trailing paths", () => {
        const options = dev();
        for (const origin of [
            "http://localhost.evil.com",
            "http://localhost:5173.evil.com",
            "http://localhost@evil.com",
            "http://localhost:5173@evil.com",
            "http://127.0.0.1.evil.com",
            "https://localhost:5173",
            "http://localhost:5173/",
            "http://localhost:5173 ",
            "null",
            "file://",
        ]) {
            const { err } = checkOrigin(options, origin);
            assert.ok(err instanceof Error, `${origin} must be rejected in development`);
        }
    });
});

describe("P3 - rejected origin response", () => {
    function invoke(err, origin = "http://localhost:5174") {
        const captured = { status: undefined, body: undefined, headers: [], warns: [], nextCalled: false };
        const res = {
            status(code) {
                captured.status = code;
                return this;
            },
            json(body) {
                captured.body = body;
                return this;
            },
            setHeader(name, value) {
                captured.headers.push([name, value]);
                return this;
            },
        };
        const handler = createCorsErrorHandler({ warn: (message) => captured.warns.push(message) });
        handler(err, { headers: { origin } }, res, () => {
            captured.nextCalled = true;
        });
        return captured;
    }

    test("returns 403 JSON for a CORS rejection", () => {
        const captured = invoke(new Error("Not allowed by CORS"));
        assert.equal(captured.status, 403);
        assert.deepEqual(captured.body, { error: "Origin not allowed" });
        assert.equal(captured.nextCalled, false);
    });

    test("logs the rejected origin and reflects no arbitrary origin header", () => {
        const captured = invoke(new Error("Not allowed by CORS"), "http://malicious.com");
        assert.equal(captured.warns.length, 1);
        assert.match(captured.warns[0], /\[server\] CORS rejected origin: http:\/\/malicious\.com/);
        assert.deepEqual(captured.headers, []);
    });

    test("passes unrelated errors to the default Express handler", () => {
        const captured = invoke(new Error("boom"));
        assert.equal(captured.status, undefined);
        assert.equal(captured.body, undefined);
        assert.equal(captured.nextCalled, true);
    });
});

describe("P3 - preflight chain", () => {
    async function withApp(warn, run) {
        const app = express();
        app.use(cors(createCorsOptions({ nodeEnv: "development", allowedOrigins: [PRODUCTION_ORIGIN] })));
        app.use(createCorsErrorHandler({ warn }));
        app.options("/api/gemini/title", (_req, res) => res.sendStatus(204));

        const server = app.listen(0);
        try {
            const { port } = server.address();
            return await run(`http://127.0.0.1:${port}`);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    }

    function preflight(base, origin) {
        return fetch(`${base}/api/gemini/title`, {
            method: "OPTIONS",
            headers: {
                Origin: origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        });
    }

    test("drifted localhost:5174 preflight succeeds with ACAO", async () => {
        await withApp(() => {}, async (base) => {
            const res = await preflight(base, "http://localhost:5174");
            assert.equal(res.status, 204);
            assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5174");
        });
    });

    test("disallowed origin preflight is a logged 403 JSON, not an HTML 500", async () => {
        const warns = [];
        await withApp((message) => warns.push(message), async (base) => {
            const res = await preflight(base, "http://malicious.com");
            assert.equal(res.status, 403);
            assert.equal(res.headers.get("access-control-allow-origin"), null);
            assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
            assert.deepEqual(await res.json(), { error: "Origin not allowed" });
            assert.deepEqual(warns, ["[server] CORS rejected origin: http://malicious.com"]);
        });
    });
});
