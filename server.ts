import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import {
    handleChatResponse,
    handleGenerateSchedule,
    handleHealth,
    applyApiHeaders,
    MAX_BODY_BYTES,
} from "./services/apiCore";

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

async function startServer() {
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;

    // سقف بدنه یکسان با مسیر Vercel: ۴.۵ مگابایت (body-parser عدد را بایت می‌گیرد)
    app.use(express.json({ limit: MAX_BODY_BYTES }));

    app.use((req, res, next) => {
        if (applyApiHeaders(req as any, res as any)) {
            return;
        }
        next();
    });

    app.get("/api/health", handleHealth);
    app.post("/api/generate-schedule", handleGenerateSchedule);
    app.post("/api/get-chat-response", handleChatResponse);

    // خطای سقف حجم بدنه (body-parser) به‌صورت JSON برمی‌گردد
    app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err?.type === "entity.too.large") {
            return res.status(413).json({
                success: false,
                error: "حجم داده‌های درخواست بیش از حد مجاز (۴.۵ مگابایت) است.",
            });
        }
        if (err?.type === "entity.parse.failed") {
            return res.status(400).json({ success: false, error: "بدنه‌ی درخواست JSON نامعتبر است." });
        }
        return next(err);
    });

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
