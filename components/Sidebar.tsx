import React, { useState } from 'react';
import { Page } from '../types';
import { ICONS, HejlehLogo } from './icons';

export interface SidebarUser {
    id: string;
    email?: string | null;
    user_metadata?: {
        full_name?: string | null;
        avatar_url?: string | null;
        name?: string | null;
    };
}

interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    activeRemindersCount: number;
    user: SidebarUser | null;
    loadingUserData: boolean;
    onGoogleSignIn: () => void;
    onSignOut: () => void;
    authError: string | null;
    onClearAuthError: () => void;
}

export function Sidebar({ 
    currentPage, 
    setCurrentPage, 
    activeRemindersCount,
    user,
    loadingUserData,
    onGoogleSignIn,
    onSignOut,
    authError,
    onClearAuthError
}: { 
    currentPage: Page, 
    setCurrentPage: (page: Page) => void, 
    activeRemindersCount: number,
    user: SidebarUser | null,
    loadingUserData: boolean,
    onGoogleSignIn: () => void,
    onSignOut: () => void,
    authError: string | null,
    onClearAuthError: () => void
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'کاربر';
    const avatarUrl = user?.user_metadata?.avatar_url || null;
    const navItems = [
        { page: Page.Scheduler, label: 'برنامه شیفت' },
        { page: Page.Personnel, label: 'پرسنل' },
        { page: Page.ShiftTypes, label: 'انواع شیفت' },
        { page: Page.DepartmentManagement, label: 'مدیریت بخش'},
        { page: Page.Rules, label: 'قوانین' },
        { page: Page.Calendar, label: 'تقویم' },
        { page: Page.Settings, label: 'تنظیمات موظفی' },
        { page: Page.AiAssistant, label: 'دستیار هوش مصنوعی' },
        { page: Page.Archive, label: 'بایگانی برنامه' },
    ];

    return (
        <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out relative overflow-hidden`}>
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-blue-900/30 via-slate-900/10 to-transparent"></div>
            </div>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute left-0 top-12 transform -translate-x-1/2 bg-slate-800 text-white p-1 rounded-full border border-slate-700 hover:bg-blue-600 shadow-lg z-50 focus:outline-hidden flex items-center justify-center w-7 h-7">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /> 
                </svg>
            </button>
            <div className={`relative z-10 flex flex-col items-center mt-6 mb-8 px-2 transition-all duration-300 overflow-hidden`}>
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-center gap-3'} transition-all duration-300`}>
                    <HejlehLogo />
                    <h1 className={`text-2xl font-bold whitespace-nowrap tracking-tight transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 scale-0 hidden' : 'w-auto opacity-100 scale-100'}`}>
                        <span className="text-amber-500">Hejleh</span> <span className="text-amber-600">App</span>
                    </h1>
                </div>
            </div>
            <nav className="flex-1 w-full px-3 pb-4 z-10 overflow-y-auto custom-scrollbar">
                <ul className="space-y-1.5">
                    {navItems.map(item => (
                        <li key={item.page} className="relative group">
                            <button onClick={() => setCurrentPage(item.page)} className={`w-full p-3 rounded-xl transition-all duration-300 flex items-center relative overflow-hidden group ${isCollapsed ? 'justify-center' : 'justify-start gap-3 text-right'} ${currentPage === item.page ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                                <div className={`shrink-0 relative z-10 transition-colors duration-300 ${currentPage === item.page ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
                                    {ICONS[item.page as Page]}
                                </div>
                                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 relative z-10 font-medium ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
                                    {item.label}
                                </span>
                                {item.page === Page.Calendar && activeRemindersCount > 0 && (
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shadow-lg border border-white/20">
                                        {activeRemindersCount}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            {/* Cloud Auth Section */}
            <div className="px-3 py-4 border-t border-slate-800/70 bg-slate-950/20">
                {user ? (
                    <div className="flex flex-col gap-2">
                        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                            <div className="flex items-center gap-2 overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full border border-teal-500/50 shadow-md shrink-0 focus:outline-hidden" referrerPolicy="no-referrer" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold shrink-0">
                                        {displayName[0] || 'U'}
                                    </div>
                                )}
                                {!isCollapsed && (
                                    <div className="flex flex-col text-right overflow-hidden">
                                        <span className="text-xs font-semibold text-slate-100 truncate">{displayName}</span>
                                        <span className="text-[10px] text-teal-400 font-medium font-mono">سرویس ابری Supabase</span>
                                    </div>
                                )}
                            </div>
                            {!isCollapsed && (
                                <button onClick={onSignOut} className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="خروج از حساب">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        {isCollapsed && (
                            <button onClick={onSignOut} className="text-slate-400 hover:text-rose-400 p-1 rounded-lg hover:bg-slate-800 transition-colors flex justify-center w-full mt-1" title="خروج از حساب">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={onGoogleSignIn} 
                            disabled={loadingUserData}
                            className={`w-full p-2.5 rounded-xl transition-all duration-350 flex items-center bg-gradient-to-r from-amber-600 to-amber-500 text-white font-medium hover:brightness-110 active:brightness-95 shadow-lg shadow-amber-500/20 overflow-hidden ${isCollapsed ? 'justify-center' : 'justify-start gap-4'}`}
                        >
                            {loadingUserData ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-5 h-5 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18 8.79 18 6 15.21 6 11.76S8.79 5.52 12.24 5.52c1.49 0 2.859.54 3.93 1.54l2.42-2.42C16.91 3.09 14.73 2 12.24 2 6.84 2 2.48 6.36 2.48 11.76s4.36 9.76 9.76 9.76c5.62 0 9.34-3.95 9.34-9.51 0-.64-.06-1.12-.18-1.73H12.24z"/>
                                </svg>
                            )}
                            {!isCollapsed && (
                                <div className="text-right">
                                    <p className="text-xs font-black text-slate-100">سرویس ابری Supabase</p>
                                    <p className="text-[9px] text-amber-200">ثبت‌نام و همگام‌سازی</p>
                                </div>
                            )}
                        </button>
                        {!isCollapsed && authError && (
                            <div className="mt-2 p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-[10px] text-rose-300 relative text-right flex flex-col gap-1 leading-relaxed">
                                <button onClick={onClearAuthError} className="absolute left-1.5 top-0.5 text-rose-400 hover:text-white font-bold text-xs">×</button>
                                <p className="font-bold text-rose-400">محدودیت پیش‌نمایش iframe مرورگر</p>
                                <p>ورود گوگل درون آی‌فریم پیش‌نمایش به دلیل مسدودسازی کوکی‌های شخص ثالث توسط مرورگر ممکن است کار نکند. لطفاً برنامه را در یک تب مجزا باز کنید:</p>
                                <a 
                                    href={window.location.href}
                                    target="_blank"
                                    className="text-amber-400 font-bold underline font-mono text-[9px] text-center hover:text-amber-300 mt-1 block py-1 bg-slate-950/40 rounded"
                                    rel="noreferrer"
                                >
                                    بازکردن در تب مستقل ↗
                                </a>
                            </div>
                        )}
                        {!isCollapsed && !authError && typeof window !== 'undefined' && window.self !== window.top && (
                            <p className="text-[9px] text-slate-400 text-right leading-relaxed mt-1 opacity-70">
                                ℹ️ برای ورود موفق، بهتر است برنامه را در <a href={window.location.href} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">یک تب مستقل ↗</a> باز کنید.
                            </p>
                        )}
                    </div>
                )}
            </div>
            <div className="p-4 z-10 border-t border-slate-800/50">
                <p className={`text-xs text-slate-500 text-center transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>نسخه ۱.۲.۰</p>
            </div>
        </div>
    );
}
