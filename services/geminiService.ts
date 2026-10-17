import type { ScheduleEntry, Personnel, ShiftType, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, RoleDutySetting, GlobalDutySettings } from '../types';
import { generateScheduleDeterministic } from './schedulerSolver';
import { GoogleGenAI } from '@google/genai';

/**
 * Generates a monthly schedule using the deterministic solver, running
 * entirely in the browser. No server round-trip is needed, so this works
 * on static hosting (e.g. Netlify) where the Express API is unavailable.
 */
export async function completeScheduleAI(
    personnel: Personnel[],
    shiftTypes: ShiftType[],
    currentSchedule: ScheduleEntry[],
    requests: StaffRequest[],
    jMonth: number,
    jYear: number,
    rules: CustomRule[],
    aiSettings: AiGenerationSettings,
    roleSettings: RoleDutySetting[] = [],
    dailyReqs?: { morning: number[], evening: number[], night: number[] },
    globalSettings: GlobalDutySettings = { employmentStatuses: [], roleDeductions: [], seniorityDeductions: [], reminderLeadDays: 1, defaultReminderMinutes: 60 },
    manualBalances: Record<string, number> = {}
): Promise<ScheduleEntry[]> {
    try {
        // Basic safety check for data integrity (mirrors the former server endpoint)
        if (!personnel || personnel.length === 0) {
            return [];
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
            manualBalances
        });

        return schedule || [];
    } catch (error: any) {
        console.error("AI Scheduling client-side solver error:", error);
        // Rethrow so the React UI can handle and display the error in a beautiful custom modal
        throw error;
    }
}

// The Gemini API key is baked into the client bundle at build time from
// GEMINI_API_KEY (see vite.config.ts), the same pattern LiveVoiceAssistant uses.
function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.API_KEY as string | undefined;
    if (!apiKey) {
        console.warn("Warning: GEMINI_API_KEY environment variable is not defined at build time.");
    }
    return new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
            headers: {
                "User-Agent": "aistudio-build",
            },
        },
    });
}

// Calls the generative model with an automatic fallback mechanism.
// If the primary model (gemini-3.5-flash) fails, it automatically falls back
// to 'gemini-3.1-flash-lite' to utilize a separate free tier model quota.
async function getGenerativeResponseWithFallback(contents: any[]) {
    const ai = getGeminiClient();
    try {
        return await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents
        });
    } catch (err: any) {
        const errStr = String(err.message || err);
        console.warn("Primary model 'gemini-3.5-flash' failed, falling back to 'gemini-3.1-flash-lite':", errStr);
        try {
            return await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents
            });
        } catch (fallbackErr: any) {
            const fallbackErrStr = String(fallbackErr.message || fallbackErr);
            console.error("Fallback model 'gemini-3.1-flash-lite' also failed:", fallbackErrStr);
            const isQuotaError = errStr.includes("limit") || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("429") ||
                fallbackErrStr.includes("limit") || fallbackErrStr.includes("quota") || fallbackErrStr.includes("RESOURCE_EXHAUSTED") || fallbackErrStr.includes("429");
            if (isQuotaError) {
                throw new Error(
                    "سهمیه رایگان درخواست‌های هوش مصنوعی (Quota Limit) برای سرور موقتاً به پایان رسیده است. لطفا چند دقیقه بعد دوباره امتحان کنید یا از پنل تنظیمات یک کلید تجاری فعال نمایید."
                );
            }
            throw fallbackErr;
        }
    }
}

/**
 * Gets a conversational logistic support response by calling Gemini directly
 * from the browser. No server round-trip is needed, so this works on static
 * hosting (e.g. Netlify) where the Express API is unavailable.
 */
export async function getAiChatResponse(
    prompt: string,
    history: ChatMessage[],
    personnel: Personnel[],
    shiftTypes: ShiftType[]
): Promise<string> {
    try {
        const context = `
You are Hejleh Logistics Assistant. A professional, polite assistant specializing in Iranian nurse shift logistics and Jalali calendar coordination.
Current state of the ward:
- Regular staff size: ${personnel?.length || 0}
- Configured Shift Types: ${(shiftTypes || []).map((s: any) => `${s.name} (${s.symbol})`).join(", ")}

Previous Conversation Context:
${(history || []).map((m: any) => `${m.role}: ${m.content}`).join("\n")}

Respond accurately in Persian (Farsi), offering excellent feedback.
`;

        const result = await getGenerativeResponseWithFallback([
            { text: context },
            { text: prompt }
        ]);

        return result.text || "خروجی نامعتبر از هوش مصنوعی.";
    } catch (e: any) {
        console.error("AI Assistant chat error:", e);
        return `متأسفانه خطایی در ارتباط با هوش مصنوعی رخ داده است: ${e.message || e}`;
    }
}
