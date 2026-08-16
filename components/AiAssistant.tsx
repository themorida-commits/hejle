import React, { useState, useRef, useEffect } from 'react';
import type { Personnel, ShiftType, ChatMessage, AiGenerationSettings } from '../types';
import { getAiChatResponse } from '../services/geminiService';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AiAssistantProps {
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    aiSettings: AiGenerationSettings;
    setAiSettings: React.Dispatch<React.SetStateAction<AiGenerationSettings>>;
}

const suggestionPrompts = [
    "چطور می‌توانم یک شیفت را به صورت دستی برای یک پرستار ثبت کنم؟",
    "یک برنامه شیفت برای ماه آینده با توزیع عادلانه شیفت شب برایم ایجاد کن.",
    "شیفت‌های آخر هفته را بین پرسنل چطور تقسیم می‌کنی؟"
];

const distributionDescriptions: Record<AiGenerationSettings['distributionAlgorithm'], string> = {
    even: 'شیفت‌های سخت‌تر مانند شب و عصر را تا حد امکان به صورت عادلانه بین همه پرسنل توزیع می‌کند.',
    seniority: 'در تخصیص شیفت‌ها، پرسنل با سطح ارشدیت بالاتر را در اولویت قرار می‌دهد.',
    random: 'شیفت‌ها را به صورت تصادفی تخصیص می‌دهد که می‌تواند برای شکستن الگوها مفید باشد اما ممکن است منجر به برنامه نامتعادل شود.'
};

const weekendDistributionDescriptions: Record<AiGenerationSettings['weekendDistribution'], string> = {
    even: 'شیفت‌های آخر هفته (جمعه‌ها) را به صورت مساوی بین پرسنل توزیع می‌کند.',
    seniority: 'اولویت شیفت‌های آخر هفته با پرسنل ارشد است.',
    none: 'هیچ قانون خاصی برای توزیع شیفت‌های آخر هفته در نظر گرفته نمی‌شود.'
};


function AiSettings({ settings, setSettings }: { settings: AiGenerationSettings, setSettings: React.Dispatch<React.SetStateAction<AiGenerationSettings>> }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-gray-100 rounded-lg mb-6">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-right p-3 font-semibold text-gray-700 flex justify-between items-center"
            >
                <span>تنظیمات پیشرفته تولید برنامه</span>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isOpen && (
                <div className="p-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <label htmlFor="distribution-algo" className="block text-sm font-medium text-gray-700 mb-1">
                                الگوریتم توزیع شیفت
                            </label>
                            <select
                                id="distribution-algo"
                                value={settings.distributionAlgorithm}
                                onChange={(e) => setSettings(prev => ({ ...prev, distributionAlgorithm: e.target.value as any }))}
                                className="w-full p-2 border border-gray-300 rounded-md"
                            >
                                <option value="even">توزیع یکنواخت</option>
                                <option value="seniority">اولویت با ارشدیت</option>
                                <option value="random">توزیع تصادفی</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1 h-10">
                                {distributionDescriptions[settings.distributionAlgorithm]}
                            </p>
                        </div>
                        <div>
                            <label htmlFor="weekend-distribution" className="block text-sm font-medium text-gray-700 mb-1">
                                توزیع شیفت آخر هفته
                            </label>
                            <select
                                id="weekend-distribution"
                                value={settings.weekendDistribution}
                                onChange={(e) => setSettings(prev => ({ ...prev, weekendDistribution: e.target.value as any }))}
                                className="w-full p-2 border border-gray-300 rounded-md"
                            >
                                <option value="even">توزیع یکنواخت</option>
                                <option value="seniority">اولویت با ارشدیت</option>
                                <option value="none">بدون اولویت</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1 h-10">
                                {weekendDistributionDescriptions[settings.weekendDistribution]}
                            </p>
                        </div>
                        <div>
                            <label htmlFor="min-rest" className="block text-sm font-medium text-gray-700 mb-1">
                                حداقل استراحت بین شیفت (ساعت)
                            </label>
                            <input
                                type="number"
                                id="min-rest"
                                value={settings.minRestHours}
                                onChange={(e) => setSettings(prev => ({ ...prev, minRestHours: Number(e.target.value) }))}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                min="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">حداقل فاصله زمانی بین پایان یک شیفت و شروع شیفت بعدی.</p>
                        </div>
                        <div>
                            <label htmlFor="max-consecutive-work" className="block text-sm font-medium text-gray-700 mb-1">
                                حداکثر روزهای کاری متوالی
                            </label>
                            <input
                                type="number"
                                id="max-consecutive-work"
                                value={settings.maxConsecutiveWorkDays}
                                onChange={(e) => setSettings(prev => ({ ...prev, maxConsecutiveWorkDays: Number(e.target.value) }))}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                min="1"
                            />
                            <p className="text-xs text-gray-500 mt-1">حداکثر تعداد روزهایی که یک فرد می‌تواند پشت سر هم کار کند.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


export function AiAssistant({ personnel, shiftTypes, messages, setMessages, aiSettings, setAiSettings }: AiAssistantProps) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent, prompt: string = input) => {
        e.preventDefault();
        if (!prompt.trim() || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: prompt };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        try {
            const history = updatedMessages;
            const aiResponse = await getAiChatResponse(prompt, history, personnel, shiftTypes);
            const modelMessage: ChatMessage = { role: 'model', content: aiResponse };
            setMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error("Failed to get AI response:", error);
            const errorMessage: ChatMessage = { role: 'model', content: 'خطا در برقراری ارتباط با سرور. لطفا دوباره تلاش کنید.' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestionClick = (prompt: string) => {
        // We need a dummy event object for handleSubmit
        const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSubmit(dummyEvent, prompt);
    };

    return (
        <div className="p-6 bg-gray-50 flex-grow h-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0">
                <h1 className="text-3xl font-bold text-gray-800">دستیار هوش مصنوعی</h1>
                <p className="text-gray-600 mt-2 mb-6">از هوش مصنوعی برای ایجاد برنامه‌ها یا دریافت راهنمایی استفاده کنید.</p>
            </div>
            
            <AiSettings settings={aiSettings} setSettings={setAiSettings} />

            <div className="flex-grow bg-white rounded-lg shadow p-4 flex flex-col overflow-hidden">
                <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-3xl p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                {msg.role === 'model' ? (
                                    <MarkdownRenderer content={msg.content} />
                                ) : (
                                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="max-w-xl p-3 rounded-lg bg-gray-200 text-gray-800">
                                <div className="flex items-center space-x-2 space-x-reverse">
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                                    <span className="text-sm">در حال پردازش...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {messages.length <= 1 && !isLoading && (
                    <div className="mb-4">
                        <p className="text-sm text-gray-500 mb-2">پیشنهادها:</p>
                        <div className="flex flex-wrap gap-2">
                            {suggestionPrompts.map(prompt => (
                                <button key={prompt} onClick={() => handleSuggestionClick(prompt)} className="bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full hover:bg-gray-200">
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="flex-shrink-0 mt-auto">
                    <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="پیام خود را اینجا بنویسید..."
                            className="flex-grow p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            disabled={isLoading}
                        />
                        <button type="submit" disabled={isLoading} className="bg-blue-600 text-white px-6 py-2 rounded-md font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                            {isLoading ? '...' : 'ارسال'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}