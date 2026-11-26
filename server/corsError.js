export function createCorsErrorHandler({ warn = console.warn } = {}) {
    return (err, req, res, next) => {
        if (err?.message !== "Not allowed by CORS") {
            return next(err);
        }

        const origin = req?.headers?.origin ?? "(none)";
        warn(`[server] CORS rejected origin: ${origin}`);
        return res.status(403).json({ error: "Origin not allowed" });
    };
}
