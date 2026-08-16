import type { ScheduleEntry, Personnel, ShiftType, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, RoleDutySetting, GlobalDutySettings } from '../types';

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
        const response = await fetch("/api/generate-schedule", {
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
            const errorData = await response.json().catch(() => ({}));
            let errMsg = "خطای نامشخص در سمت سرور";
            if (errorData) {
                if (typeof errorData.error === "string") {
                    errMsg = errorData.error;
                } else if (errorData.error && typeof errorData.error.message === "string") {
                    errMsg = errorData.error.message;
                } else if (typeof errorData.message === "string") {
                    errMsg = errorData.message;
                } else if (typeof errorData.error === "object") {
                    errMsg = JSON.stringify(errorData.error);
                }
            }
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
        const response = await fetch("/api/get-chat-response", {
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
            const errorData = await response.json().catch(() => ({}));
            let errMsg = "خطا در برقراری ارتباط با پورتال پشتیبانی هوش مصنوعی";
            if (errorData) {
                if (typeof errorData.error === "string") {
                    errMsg = errorData.error;
                } else if (errorData.error && typeof errorData.error.message === "string") {
                    errMsg = errorData.error.message;
                } else if (typeof errorData.message === "string") {
                    errMsg = errorData.message;
                } else if (typeof errorData.error === "object") {
                    errMsg = JSON.stringify(errorData.error);
                }
            }
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.text || "خروجی نامعتبر از سرور.";
    } catch (e: any) {
        console.error("AI Assistant chat fetch error:", e);
        return `متأسفانه خطایی در ارتباط با سرور رخ داده است: ${e.message || e}`;
    }
}
