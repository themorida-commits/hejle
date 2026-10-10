import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { handleChatResponse, handleGenerateSchedule, handleHealth } from "./services/apiCore";

// بارگذاری فایل‌های .env در صورت نبود متغیرهای محیطی (اجرای محلی/سرور شخصی)
if (!process.env.GEMINI_API_KEY) {
    try {
        const envPaths = [
            path.join(process.cwd(), ".env.local"),
            path.join(process.cwd(), ".env"),
        ];
        for (const envPath of envPaths) {
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, "utf-8");
                content.split(/\r?\n/).forEach((line) => {
                    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
                    if (match) {
                        const key = match[1];
                        let value = match[2] || "";
                        if (value.startsWith('"') && value.endsWith('"')) {
                            value = value.substring(1, value.length - 1);
                        } else if (value.startsWith("'") && value.endsWith("'")) {
                            value = value.substring(1, value.length - 1);
                        }
                        process.env[key] = value.trim();
                    }
                });
                break;
            }
        }
    } catch (e) {
        console.warn("Failed to load environment variables from file:", e);
    }
}

function getAllowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}

async function startServer() {
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;
    const allowedOrigins = getAllowedOrigins();

    app.use(express.json({ limit: "5mb" }));

    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        if (req.method === "OPTIONS") {
            return res.sendStatus(204);
        }
        next();
    });

    app.get("/api/health", handleHealth);
    app.post("/api/generate-schedule", handleGenerateSchedule);
    app.post("/api/get-chat-response", handleChatResponse);

    // در حالت توسعه میان‌افزار Vite اجرا می‌شود و در تولید فایل‌های استاتیک سرو می‌شوند
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(
            express.static(distPath, {
                setHeaders: (res) => {
                    res.setHeader("X-Content-Type-Options", "nosniff");
                },
            })
        );
        app.get("/*splat", (req, res) => {
            res.sendFile(path.join(distPath, "index.html"));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Full-Stack Hejleh Server is active on port ${PORT}`);
    });
}

startServer();
