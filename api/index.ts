import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { generateScheduleDeterministic } from "../src/services/schedulerSolver";

const app = express();
app.use(express.json({ limit: "30mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const apiKey = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const currentApiKey = process.env.GEMINI_API_KEY || apiKey;
    if (!currentApiKey) {
      console.warn("Warning: GEMINI_API_KEY environment variable is not defined.");
    }
    aiClient = new GoogleGenAI({
      apiKey: currentApiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

async function getGenerativeResponseWithFallback(params: {
  contents: any;
  config?: any;
}) {
  const ai = getGeminiClient();
  try {
    console.log("Attempting generation with primary model: gemini-3.5-flash");
    return await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: params.contents,
      config: params.config,
    });
  } catch (err: any) {
    const errStr = String(err.message || err);
    console.warn("Primary model 'gemini-3.5-flash' failed. Error details:", errStr);

    console.log("Automatically falling back to: gemini-3.1-flash-lite");
    try {
      return await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: params.contents,
        config: params.config,
      });
    } catch (fallbackErr: any) {
      const fallbackErrStr = String(fallbackErr.message || fallbackErr);
      console.error("Fallback model 'gemini-3.1-flash-lite' also failed. Error details:", fallbackErrStr);

      const isQuotaError =
        errStr.includes("limit") ||
        errStr.includes("quota") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("429") ||
        fallbackErrStr.includes("limit") ||
        fallbackErrStr.includes("quota") ||
        fallbackErrStr.includes("RESOURCE_EXHAUSTED") ||
        fallbackErrStr.includes("429");

      if (isQuotaError) {
        throw new Error(
          "سهمیه رایگان درخواست‌های هوش مصنوعی (Quota Limit) برای سرور موقتاً به پایان رسیده است. لطفا چند دقیقه بعد دوباره امتحان کنید یا از پنل تنظیمات یک کلید تجاری فعال نمایید."
        );
      }
      throw fallbackErr;
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", fsd: "healthy" });
});

app.post("/api/generate-schedule", async (req, res) => {
  try {
    const {
      personnel,
      shiftTypes,
      currentSchedule,
      requests,
      jMonth,
      jYear,
      rules,
      aiSettings,
      dailyReqs,
      globalSettings,
      manualBalances,
    } = req.body;

    if (!personnel || personnel.length === 0) {
      return res.json({ success: true, schedule: [] });
    }

    const schedule = generateScheduleDeterministic({
      personnel,
      shiftTypes,
      currentSchedule,
      requests,
      jMonth,
      jYear,
      rules,
      aiSettings,
      dailyReqs,
      globalSettings,
      manualBalances,
    });

    res.json({ success: true, schedule });
  } catch (error: any) {
    console.error("Server Deterministic Scheduling Error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to generate schedule due to internal solver error" });
  }
});

app.post("/api/get-chat-response", async (req, res) => {
  try {
    const { prompt, history, personnel, shiftTypes } = req.body;

    const context = `
You are Hejleh Logistics Assistant. A professional, polite assistant specializing in Iranian nurse shift logistics and Jalali calendar coordination.
Current state of the ward:
- Regular staff size: ${personnel?.length || 0}
- Configured Shift Types: ${(shiftTypes || []).map((s: any) => `${s.name} (${s.symbol})`).join(", ")}

Previous Conversation Context:
${(history || []).map((m: any) => `${m.role}: ${m.content}`).join("\n")}

Respond accurately in Persian (Farsi), offering excellent feedback.
`;

    const result = await getGenerativeResponseWithFallback({
      contents: [
        { text: context },
        { text: prompt },
      ],
    });

    res.json({ success: true, text: result.text || "" });
  } catch (error: any) {
    console.error("Server AI Chat Error:", error);
    res.status(500).json({ success: false, error: error.message || "Could not retrieve answer from AI assistant" });
  }
});

const distPath = path.join(process.cwd(), "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get("*", (req, res) => {
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
