import express from "express";
import path from "path";
import fs from "fs";
import { handleChatResponse, handleGenerateSchedule, handleHealth } from "../services/apiCore";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }
    next();
});

app.get("/api/health", handleHealth);
app.post("/api/generate-schedule", handleGenerateSchedule);
app.post("/api/get-chat-response", handleChatResponse);

const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

app.get("/*splat", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Not found");
    }
});

export default async (req: express.Request, res: express.Response) => {
    return new Promise((resolve, reject) => {
        app(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve(undefined);
        });
    });
};
