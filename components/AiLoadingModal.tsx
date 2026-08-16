
import React, { useState, useEffect } from 'react';

const loadingMessages = [
    "در حال تحلیل دقیق نیازهای پوششی (صبح، عصر، شب)...",
    "بررسی ساعت موظفی تک‌تک پرسنل برای عدالت حداکثری...",
    "اولویت‌بندی توزیع شیفت‌های مازاد بر اساس سنوات...",
    "اعمال قوانین ریکاوری و ۲۴ ساعت استراحت پس از شب...",
    "تطبیق درخواست‌های مرخصی با نیازهای عملیاتی بخش...",
    "بهینه‌سازی توزیع عادلانه برای تمامی رده‌های شغلی...",
    "در حال نهایی‌سازی چیدمان هوشمند با رعایت استانداردهای ایمنی...",
];

interface AiLoadingModalProps {
    isOpen: boolean;
}

export function AiLoadingModal({ isOpen }: AiLoadingModalProps) {
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    useEffect(() => {
        if (isOpen) {
            const interval = setInterval(() => {
                setCurrentMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
            }, 2500);

            return () => clearInterval(interval);
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100]" aria-modal="true" role="dialog">
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md text-center transform transition-all scale-100 opacity-100 border border-white/20">
                <div className="relative w-28 h-28 mx-auto mb-8">
                    <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
                    <div className="relative flex items-center justify-center w-full h-full bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full shadow-2xl border-4 border-white/50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-3">هوش مصنوعی در حال چیدمان...</h2>
                <p className="text-slate-500 text-sm font-bold mb-8 px-4 leading-relaxed">
                    در حال پردازش پیچیده‌ترین حالت برای برقراری عدالت در ساعت موظفی و پوشش کامل بخش.
                </p>
                <div className="h-14 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
                     <p className="text-blue-700 text-xs font-black transition-opacity duration-500 ease-in-out px-4">
                        {loadingMessages[currentMessageIndex]}
                    </p>
                </div>
                <div className="mt-8 flex justify-center gap-1.5">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full bg-blue-600 transition-all duration-500 ${currentMessageIndex % 4 === i ? 'scale-150 opacity-100' : 'scale-100 opacity-30'}`}></div>
                    ))}
                </div>
            </div>
        </div>
    );
}
