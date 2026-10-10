import type { ScheduleEntry, Personnel, ShiftType, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, RoleDutySetting, GlobalDutySettings } from '../types';

/**
 * آدرس پایه‌ی API.
 * - اگر VITE_API_BASE_URL تنظیم شده باشد (مثلاً Supabase Edge Functions):
 *   https://<project-ref>.supabase.co/functions/v1
 * - در غیر این صورت همان origin سرور می‌شود: /api/...
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

function buildEndpoint(name: 'generate-schedule' | 'get-chat-response'): string {
    return API_BASE_URL ? `${API_BASE_URL}/${name}` : `/api/${name}`;
}

async function resolveErrorMessage(response: Response, defaultMessage: string): Promise<string> {
    try {
        const errorData = await response.json();
        if (typeof errorData?.error === 'string') return errorData.error;
        if (errorData?.error && typeof errorData.error.message === 'string') return errorData.error.message;
        if (typeof errorData?.message === 'string') return errorData.message;
        if (typeof errorData?.error === 'object') return JSON.stringify(errorData.error);
    } catch {
        // پاسخ JSON نداشت
    }
    return defaultMessage;
}

/**
 * Generates a monthly schedule securely utilizing the server-side full stack API.
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
        const response = await fetch(buildEndpoint('generate-schedule'), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                personnel,
                shiftTypes,
                currentSchedule,
                requests,
                jMonth,
                jYear,
                rules,
                aiSettings,
                roleSettings,
                dailyReqs,
                globalSettings,
                manualBalances,
            }),
        });

        if (!response.ok) {
            const errMsg = await resolveErrorMessage(response, "خطای نامشخص در سمت سرور");
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.schedule || [];
    } catch (error: any) {
        console.error("AI Scheduling client-side fetch error:", error);
        // Rethrow so the React UI can handle and display the error in a beautiful custom modal
        throw error;
    }
}

/**
 * Gets conversational logistic support response securely through the server-side API.
 */
export async function getAiChatResponse(
    prompt: string,
    history: ChatMessage[],
    personnel: Personnel[],
    shiftTypes: ShiftType[]
): Promise<string> {
    try {
        const response = await fetch(buildEndpoint('get-chat-response'), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                history,
                personnel,
                shiftTypes,
            }),
        });

        if (!response.ok) {
            const errMsg = await resolveErrorMessage(response, "خطا در برقراری ارتباط با پورتال پشتیبانی هوش مصنوعی");
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.text || "خروجی نامعتبر از سرور.";
    } catch (e: any) {
        console.error("AI Assistant chat fetch error:", e);
        return `متأسفانه خطایی در ارتباط با سرور رخ داده است: ${e.message || e}`;
    }
}
