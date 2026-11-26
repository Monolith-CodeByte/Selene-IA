import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("P3 - server wiring", () => {
    test("server/index.js registers the CORS error handler immediately after cors()", () => {
        const src = readFileSync(join(root, "server/index.js"), "utf8");
        const corsAt = src.indexOf("app.use(cors(corsOptions));");
        const handlerAt = src.indexOf("app.use(createCorsErrorHandler());");
        assert.notEqual(corsAt, -1);
        assert.notEqual(handlerAt, -1);
        assert.ok(handlerAt > corsAt, "handler must follow cors()");
        assert.ok(
            !src.slice(corsAt, handlerAt).includes("express.json"),
            "no layer may sit between cors() and the CORS error handler",
        );
    });

    test("module-level corsOptions honours NODE_ENV and ALLOWED_ORIGINS at import", () => {
        const script = `import { corsOptions } from ${JSON.stringify(join(root, "server/proxyAuth.js"))};
const out = {};
for (const o of ["https://a.example", "http://localhost:5174", "https://seleneai2-0.web.app"]) {
    let r;
    corsOptions.origin(o, (e) => { r = e ? "REJECT" : "ALLOW"; });
    out[o] = r;
}
console.log(JSON.stringify(out));`;
        const raw = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
            env: { ...process.env, NODE_ENV: "production", ALLOWED_ORIGINS: "https://a.example" },
            encoding: "utf8",
        });
        assert.deepEqual(JSON.parse(raw.trim().split("\n").pop()), {
            "https://a.example": "ALLOW",
            "http://localhost:5174": "REJECT",
            "https://seleneai2-0.web.app": "REJECT",
        });
    });
});
