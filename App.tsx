
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Department, Personnel, ShiftType, ScheduleEntry, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, ChangeLog, RoleDutySetting, GlobalDutySettings, ArchivedSchedule, CalendarEvent } from './types';
import { Page } from './types';
import { MOCK_DEPARTMENTS, MOCK_PERSONNEL, MOCK_SHIFT_TYPES, INITIAL_SCHEDULE, DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_SCHEDULE_NOTES, DEFAULT_GLOBAL_SETTINGS } from './constants';
import { Scheduler } from './components/Scheduler';
import { PersonnelManager } from './components/PersonnelManager';
import { ShiftTypeManager } from './components/ShiftTypeManager';
import { ArchiveViewer } from './components/ArchiveViewer';
import { RulesManager } from './components/RulesManager';
import { CalendarManager } from './components/CalendarManager';
import { AiAssistant } from './components/AiAssistant';
import { DepartmentManager } from './components/DepartmentManager';
import { SettingsManager } from './components/SettingsManager';

import { auth, db, handleFirestoreError, OperationType } from './services/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { supabase } from './services/supabase';
import { loadUserDataFromSupabase, saveUserDataToSupabase } from './services/supabaseData';

type SupabaseUser = {
    id: string;
    email?: string | null;
    user_metadata?: {
        full_name?: string | null;
        avatar_url?: string | null;
        name?: string | null;
    };
};

const ICONS: Record<Page, React.ReactElement> = {
    [Page.Scheduler]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    [Page.Personnel]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197m0 0A5.995 5.995 0 0112 13a5.995 5.995 0 013 1.003m-3-1.003A4.002 4.002 0 0112 4.354M7 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
    [Page.ShiftTypes]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a4 4 0 014-4h10a4 4 0 014 4v12a4 4 0 01-4 4H7zM12 9v6m-3-3h6" /></svg>,
    [Page.DepartmentManagement]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    [Page.Rules]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    [Page.Calendar]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    [Page.AiAssistant]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    [Page.Archive]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
    [Page.Settings]: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
};

function HejlehLogo() {
    const [imgError, setImgError] = useState(false);
    if (imgError) {
        return (
            <svg viewBox="0 0 100 100" className="w-12 h-12 flex-shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 88.5C50 88.5 88 65 88 42C88 25 75 15 60 15C50 15 45 20 45 20C45 20 40 15 30 15C15 15 2 25 2 42C2 65 40 88.5 40 88.5" stroke="#EF4444" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="30" cy="25" r="10" fill="#22C55E" />
                <path d="M12 60C12 60 22 40 62 30" stroke="#22C55E" strokeWidth="8" strokeLinecap="round" />
            </svg>
        );
    }
    return <img src="/logo.png" alt="Hejleh Logo" className="w-12 h-12 object-contain relative z-10" onError={() => setImgError(true)} />;
}

function Sidebar({ 
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
    user: SupabaseUser | null,
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
        <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-900 text-white flex flex-col flex-shrink-0 shadow-2xl z-20 transition-all duration-300 ease-in-out relative overflow-hidden`}>
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-blue-900/30 via-slate-900/10 to-transparent"></div>
            </div>
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="absolute left-0 top-12 transform -translate-x-1/2 bg-slate-800 text-white p-1 rounded-full border border-slate-700 hover:bg-blue-600 shadow-lg z-50 focus:outline-none flex items-center justify-center w-7 h-7">
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
                                <div className={`flex-shrink-0 relative z-10 transition-colors duration-300 ${currentPage === item.page ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'}`}>
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
            {/* Firebase Auth Section */}
            <div className="px-3 py-4 border-t border-slate-800/70 bg-slate-950/20">
                {user ? (
                    <div className="flex flex-col gap-2">
                        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                            <div className="flex items-center gap-2 overflow-hidden">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full border border-teal-500/50 shadow-md shrink-0 focus:outline-none" referrerPolicy="no-referrer" />
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
                        {!isCollapsed && authError === 'network-error' && (
                            <div className="mt-2 p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-[10px] text-rose-300 relative text-right flex flex-col gap-1 leading-relaxed">
                                <button onClick={onClearAuthError} className="absolute left-1.5 top-0.5 text-rose-400 hover:text-white font-bold text-xs">×</button>
                                <p className="font-bold text-rose-400">محدودیت پیش‌نمایش iframe مرورگر</p>
                                <p>مرورگر دسترسی امنیتی فایربیس را درون آی‌فریم پیش‌نمایش به دلیل کوکی‌های شخص ثالث مسدود کرده است. لطفاً برنامه را در یک تب مجزا باز کنید:</p>
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

function App() {
    const [currentPage, setCurrentPage] = useState<Page>(Page.Scheduler);
    const [authError, setAuthError] = useState<string | null>(null);
    const [departments, setDepartments] = useState<Department[]>(() => {
        const saved = localStorage.getItem('hejleh_departments');
        return saved ? JSON.parse(saved) : MOCK_DEPARTMENTS;
    });
    const [personnel, setPersonnel] = useState<Personnel[]>(() => {
        const saved = localStorage.getItem('hejleh_personnel');
        return saved ? JSON.parse(saved) : MOCK_PERSONNEL;
    });
    const [shiftTypes, setShiftTypes] = useState<ShiftType[]>(() => {
        const saved = localStorage.getItem('hejleh_shiftTypes');
        return saved ? JSON.parse(saved) : MOCK_SHIFT_TYPES;
    });
    const [schedule, setSchedule] = useState<ScheduleEntry[]>(() => {
        const saved = localStorage.getItem('hejleh_schedule');
        return saved ? JSON.parse(saved) : INITIAL_SCHEDULE;
    });
    const [requests, setRequests] = useState<StaffRequest[]>(() => {
        const saved = localStorage.getItem('hejleh_requests');
        return saved ? JSON.parse(saved) : [];
    });
    const [rules, setRules] = useState<CustomRule[]>(() => {
        const saved = localStorage.getItem('hejleh_rules');
        return saved ? JSON.parse(saved) : DEFAULT_RULES;
    });
    const [manualBalances, setManualBalances] = useState<Record<string, number>>(() => {
        const saved = localStorage.getItem('hejleh_manualBalances');
        return saved ? JSON.parse(saved) : {};
    });
    const [archives, setArchives] = useState<ArchivedSchedule[]>(() => {
        const saved = localStorage.getItem('hejleh_archives');
        return saved ? JSON.parse(saved) : [];
    });
    const [aiSettings, setAiSettings] = useState<AiGenerationSettings>(DEFAULT_AI_SETTINGS);
    const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', content: 'سلام! من دستیار هوش مصنوعی شما هستم.' }]);
    const [changeLog, setChangeLog] = useState<ChangeLog>({});
    const [scheduleNotes, setScheduleNotes] = useState<string>(DEFAULT_SCHEDULE_NOTES);
    const [globalSettings, setGlobalSettings] = useState<GlobalDutySettings>(() => {
        const saved = localStorage.getItem('hejleh_globalSettings');
        return saved ? JSON.parse(saved) : DEFAULT_GLOBAL_SETTINGS;
    });
    const [events, setEvents] = useState<CalendarEvent[]>(() => {
        const saved = localStorage.getItem('hejleh_calendar_events');
        return saved ? JSON.parse(saved) : [];
    });

    // Cloud Supabase Auth State
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [loadingUserData, setLoadingUserData] = useState(false);
    const isSyncingFromFirestore = useRef(false);

    const buildSupabasePayload = () => ({
        departments,
        personnel,
        shiftTypes,
        schedule,
        requests,
        rules,
        archives,
        calendarEvents: events,
        globalSettings,
        manualBalances,
    });

    const seedLocalToSupabase = async (uid: string) => {
        try {
            await saveUserDataToSupabase(uid, buildSupabasePayload());
            console.log('Seeded current local data to Supabase successfully.');
        } catch (e) {
            console.warn('Supabase seed unavailable, falling back to local state.', e);
        }
    };

    const fetchAllFromSupabase = async (uid: string) => {
        setLoadingUserData(true);
        isSyncingFromFirestore.current = true;
        try {
            const payload = await loadUserDataFromSupabase(uid);
            const hasStoredData = Boolean(payload.departments.length || payload.personnel.length || payload.shiftTypes.length || payload.rules.length || payload.globalSettings);

            if (hasStoredData) {
                setDepartments(payload.departments);
                setPersonnel(payload.personnel);
                setShiftTypes(payload.shiftTypes);
                setSchedule(payload.schedule);
                setRequests(payload.requests);
                setRules(payload.rules);
                setArchives(payload.archives);
                setEvents(payload.calendarEvents);
                if (payload.globalSettings) {
                    setGlobalSettings(payload.globalSettings);
                }
                setManualBalances(payload.manualBalances ?? {});
            } else {
                await seedLocalToSupabase(uid);
            }
        } catch (e) {
            console.warn('Unable to load data from Supabase yet, using local state.', e);
        } finally {
            isSyncingFromFirestore.current = false;
            setLoadingUserData(false);
        }
    };

    // Seed local storage values to Firestore
    const seedLocalToFirestore = async (uid: string) => {
        try {
            const batchWrites: Promise<any>[] = [];
            
            departments.forEach(dept => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'departments', dept.id), dept));
            });
            personnel.forEach(p => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'personnel', p.id), p));
            });
            shiftTypes.forEach(st => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'shiftTypes', st.id), st));
            });
            schedule.forEach(se => {
                const docId = `${se.personnelId}_${se.date}`;
                batchWrites.push(setDoc(doc(db, 'users', uid, 'schedule', docId), se));
            });
            requests.forEach(req => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'requests', req.id), req));
            });
            rules.forEach(rule => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'rules', rule.id), rule));
            });
            archives.forEach(arc => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'archives', arc.id), arc));
            });
            events.forEach(ev => {
                batchWrites.push(setDoc(doc(db, 'users', uid, 'calendarEvents', ev.id), ev));
            });
            batchWrites.push(setDoc(doc(db, 'users', uid, 'globalSettings', 'default'), globalSettings));
            batchWrites.push(setDoc(doc(db, 'users', uid, 'manualBalances', 'all'), manualBalances));

            await Promise.all(batchWrites);
            console.log('Seeded current local data to Firestore successfully.');
        } catch (e) {
            console.error('Error seeding data to Firestore:', e);
            handleFirestoreError(e, OperationType.WRITE, `users/${uid}`);
        }
    };

    // Load user data from Firestore on login
    const fetchAllFromFirestore = async (uid: string) => {
        setLoadingUserData(true);
        isSyncingFromFirestore.current = true;
        try {
            const [
                deptsSnap,
                persSnap,
                shiftsSnap,
                schedSnap,
                reqSnap,
                rulesSnap,
                archSnap,
                calSnap,
                globalSnap,
                manualSnap
            ] = await Promise.all([
                getDocs(collection(db, 'users', uid, 'departments')),
                getDocs(collection(db, 'users', uid, 'personnel')),
                getDocs(collection(db, 'users', uid, 'shiftTypes')),
                getDocs(collection(db, 'users', uid, 'schedule')),
                getDocs(collection(db, 'users', uid, 'requests')),
                getDocs(collection(db, 'users', uid, 'rules')),
                getDocs(collection(db, 'users', uid, 'archives')),
                getDocs(collection(db, 'users', uid, 'calendarEvents')),
                getDocs(collection(db, 'users', uid, 'globalSettings')),
                getDocs(collection(db, 'users', uid, 'manualBalances'))
            ]);

            const fetchedDepts = deptsSnap.docs.map(d => d.data() as Department);
            const fetchedPers = persSnap.docs.map(d => d.data() as Personnel);
            const fetchedShifts = shiftsSnap.docs.map(d => d.data() as ShiftType);
            const fetchedSchedule = schedSnap.docs.map(d => d.data() as ScheduleEntry);
            const fetchedRequests = reqSnap.docs.map(d => d.data() as StaffRequest);
            const fetchedRules = rulesSnap.docs.map(d => d.data() as CustomRule);
            const fetchedArchives = archSnap.docs.map(d => d.data() as ArchivedSchedule);
            const fetchedEvents = calSnap.docs.map(d => d.data() as CalendarEvent);
            
            let fetchedGlobal = fetchedDepts.length > 0 ? DEFAULT_GLOBAL_SETTINGS : null;
            if (!globalSnap.empty) {
                fetchedGlobal = globalSnap.docs[0].data() as GlobalDutySettings;
            }

            let fetchedManual = {};
            if (!manualSnap.empty) {
                fetchedManual = manualSnap.docs[0].data() as Record<string, number>;
            }

            if (fetchedDepts.length > 0 || fetchedPers.length > 0 || fetchedShifts.length > 0) {
                setDepartments(fetchedDepts);
                setPersonnel(fetchedPers);
                setShiftTypes(fetchedShifts);
                setSchedule(fetchedSchedule);
                setRequests(fetchedRequests);
                setRules(fetchedRules.length > 0 ? fetchedRules : DEFAULT_RULES);
                setArchives(fetchedArchives);
                setEvents(fetchedEvents);
                if (fetchedGlobal) setGlobalSettings(fetchedGlobal);
                setManualBalances(fetchedManual);
            } else {
                // First-time signup check: upload local mock data as starter database contents
                await seedLocalToFirestore(uid);
            }
        } catch (e) {
            console.error('Error fetching user data from Firestore:', e);
            handleFirestoreError(e, OperationType.GET, `users/${uid}`);
        } finally {
            isSyncingFromFirestore.current = false;
            setLoadingUserData(false);
        }
    };

    // Listen to Supabase Auth
    useEffect(() => {
        let isMounted = true;

        const applySession = (sessionUser: SupabaseUser | null) => {
            if (!isMounted) return;
            setUser(sessionUser);
            if (sessionUser) {
                void fetchAllFromSupabase(sessionUser.id);
            } else {
                setLoadingUserData(false);
            }
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const mappedUser = session?.user ? {
                id: session.user.id,
                email: session.user.email,
                user_metadata: session.user.user_metadata as SupabaseUser['user_metadata'],
            } : null;
            applySession(mappedUser);
        });

        void supabase.auth.getSession().then(({ data: { session } }) => {
            const mappedUser = session?.user ? {
                id: session.user.id,
                email: session.user.email,
                user_metadata: session.user.user_metadata as SupabaseUser['user_metadata'],
            } : null;
            applySession(mappedUser);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleGoogleSignIn = async () => {
        setAuthError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });

            if (error) {
                throw error;
            }
        } catch (error: any) {
            console.error('Error Google SignIn:', error);
            setAuthError(error?.message || 'err');
            alert(`ورود به حساب ناموفق بود: ${error?.message || error}`);
        }
    };

    const handleSignOut = async () => {
        if (window.confirm('آیا از خروج اطمینان دارید؟ تمامی اطلاعات محلی پس از خروج بازنشانی خواهند شد.')) {
            try {
                await supabase.auth.signOut();
                setUser(null);
                localStorage.clear();
                window.location.reload();
            } catch (error) {
                console.error('Error SignOut:', error);
            }
        }
    };

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Check for calendar reminders based on lead time (days and hours)
    const activeReminders = useMemo(() => {
        const todayJ = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
        
        return events.filter(e => {
            if (e.year !== todayJ[0] || e.month !== todayJ[1]) return false;
            
            const leadMinutes = e.reminderLeadMinutes ?? globalSettings.defaultReminderMinutes;
            const diffDays = e.day - todayJ[2];

            if (diffDays < 0) return false;
            if (diffDays > globalSettings.reminderLeadDays) return false;

            if (diffDays === 0 && e.time) {
                const [eh, em] = e.time.split(':').map(Number);
                const nowH = currentTime.getHours();
                const nowM = currentTime.getMinutes();
                const eventTotalMinutes = eh * 60 + em;
                const nowTotalMinutes = nowH * 60 + nowM;
                const remaining = eventTotalMinutes - nowTotalMinutes;
                
                return remaining >= 0 && remaining <= leadMinutes;
            }

            return diffDays >= 0 && diffDays <= globalSettings.reminderLeadDays;
        });
    }, [globalSettings, currentTime, events]);

    // Robust Auto-save Persistence to Local Storage
    useEffect(() => {
        localStorage.setItem('hejleh_globalSettings', JSON.stringify(globalSettings));
    }, [globalSettings]);

    useEffect(() => {
        localStorage.setItem('hejleh_manualBalances', JSON.stringify(manualBalances));
    }, [manualBalances]);

    useEffect(() => {
        localStorage.setItem('hejleh_archives', JSON.stringify(archives));
    }, [archives]);

    useEffect(() => {
        localStorage.setItem('hejleh_requests', JSON.stringify(requests));
    }, [requests]);

    useEffect(() => {
        localStorage.setItem('hejleh_schedule', JSON.stringify(schedule));
    }, [schedule]);

    useEffect(() => {
        localStorage.setItem('hejleh_rules', JSON.stringify(rules));
    }, [rules]);

    useEffect(() => {
        localStorage.setItem('hejleh_departments', JSON.stringify(departments));
    }, [departments]);

    useEffect(() => {
        localStorage.setItem('hejleh_personnel', JSON.stringify(personnel));
    }, [personnel]);

    useEffect(() => {
        localStorage.setItem('hejleh_shiftTypes', JSON.stringify(shiftTypes));
    }, [shiftTypes]);

    useEffect(() => {
        localStorage.setItem('hejleh_calendar_events', JSON.stringify(events));
    }, [events]);

    // High performance debounced automatic Cloud mirroring via Supabase
    useEffect(() => {
        if (!user || isSyncingFromFirestore.current) return;

        const timeoutId = setTimeout(async () => {
            try {
                await saveUserDataToSupabase(user.id, buildSupabasePayload());
                console.log('Supabase data successfully updated and mirrored.');
            } catch (err) {
                console.error('Failed to auto-mirror to Supabase:', err);
            }
        }, 1500);

        return () => clearTimeout(timeoutId);
    }, [departments, personnel, shiftTypes, schedule, requests, rules, archives, events, globalSettings, manualBalances, user]);

    const handleSaveData = async () => {
        try {
            localStorage.setItem('hejleh_departments', JSON.stringify(departments));
            localStorage.setItem('hejleh_personnel', JSON.stringify(personnel));
            localStorage.setItem('hejleh_shiftTypes', JSON.stringify(shiftTypes));
            localStorage.setItem('hejleh_schedule', JSON.stringify(schedule));
            localStorage.setItem('hejleh_requests', JSON.stringify(requests));
            localStorage.setItem('hejleh_rules', JSON.stringify(rules));
            localStorage.setItem('hejleh_manualBalances', JSON.stringify(manualBalances));
            localStorage.setItem('hejleh_globalSettings', JSON.stringify(globalSettings));
            localStorage.setItem('hejleh_calendar_events', JSON.stringify(events));

            if (user) {
                await seedLocalToSupabase(user.id);
                alert('تمامی اطلاعات به همراه همگام‌سازی ابری Supabase با موفقیت ذخیره شد.');
            } else {
                alert('تمامی اطلاعات به صورت محلی با موفقیت ذخیره شد. برای همگام‌سازی ابری، از طریق دکمه گوشه وارد حساب گوگل خود شوید.');
            }
        } catch (e) {
            console.error('Failed to save data:', e);
            alert('خطا در ذخیره اطلاعات.');
        }
    };

    const handleArchiveCurrent = (deptId: string, year: number, month: number) => {
        const deptEntries = schedule.filter(entry => {
            const p = personnel.find(per => per.id === entry.personnelId);
            return p?.departmentId === deptId;
        });

        const newArchive: ArchivedSchedule = {
            id: `arc-${Date.now()}`,
            departmentId: deptId,
            year,
            month,
            entries: deptEntries,
            personnelSnapshot: personnel.filter(p => p.departmentId === deptId),
            notes: scheduleNotes,
            archivedAt: new Date().toISOString()
        };

        setArchives(prev => {
            const existingIdx = prev.findIndex(a => a.departmentId === deptId && a.year === year && a.month === month);
            if (existingIdx > -1) {
                const confirmed = window.confirm("بایگانی برنامه برای این ماه از قبل موجود است. آیا می‌خواهید آن را بروزرسانی کنید؟");
                if (!confirmed) return prev;
                const next = [...prev];
                next[existingIdx] = newArchive;
                return next;
            }
            return [...prev, newArchive];
        });
        
        alert(`برنامه ماه ${month} سال ${year} با موفقیت در بایگانی برنامه بخش ثبت شد.`);
    };

    const renderPage = () => {
        const schedulerProps = { 
            departments, personnel, shiftTypes, schedule, setSchedule, 
            requests, setRequests, rules, aiSettings, setMessages, 
            setCurrentPage, changeLog, setChangeLog, scheduleNotes, 
            setScheduleNotes, onSave: handleSaveData, 
            onArchive: handleArchiveCurrent,
            manualBalances, 
            setManualBalances, globalSettings 
        };

        switch (currentPage) {
            case Page.Scheduler:
                return <Scheduler {...schedulerProps} />;
            case Page.Personnel:
                return <PersonnelManager departments={departments} personnel={personnel} setPersonnel={setPersonnel} globalSettings={globalSettings} />;
            case Page.ShiftTypes:
                return <ShiftTypeManager departments={departments} shiftTypes={shiftTypes} setShiftTypes={setShiftTypes} />;
            case Page.DepartmentManagement:
                return <DepartmentManager departments={departments} setDepartments={setDepartments} personnel={personnel} archives={archives} shiftTypes={shiftTypes} />;
            case Page.Rules:
                return <RulesManager rules={rules} setRules={setRules} />;
            case Page.Calendar:
                return <CalendarManager settings={globalSettings} setSettings={setGlobalSettings} events={events} setEvents={setEvents} />;
            case Page.AiAssistant:
                return <AiAssistant personnel={personnel} shiftTypes={shiftTypes} messages={messages} setMessages={setMessages} aiSettings={aiSettings} setAiSettings={setAiSettings} />;
            case Page.Archive:
                return <ArchiveViewer personnel={personnel} shiftTypes={shiftTypes} schedule={schedule} globalSettings={globalSettings} />;
            case Page.Settings:
                return <SettingsManager settings={globalSettings} setSettings={setGlobalSettings} />;
            default:
                return <Scheduler {...schedulerProps} />;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-['Vazirmatn']">
            <Sidebar 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage} 
                activeRemindersCount={activeReminders.length} 
                user={user}
                loadingUserData={loadingUserData}
                onGoogleSignIn={handleGoogleSignIn}
                onSignOut={handleSignOut}
                authError={authError}
                onClearAuthError={() => setAuthError(null)}
            />
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {activeReminders.length > 0 && currentPage !== Page.Calendar && (
                    <div className="absolute top-4 left-4 z-50 animate-in slide-in-from-left duration-500">
                        <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20 backdrop-blur-md">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-bounce">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
                            </div>
                            <div className="max-w-[200px]">
                                <p className="text-xs font-black text-right">رویداد نزدیک:</p>
                                <p className="text-[10px] font-bold truncate text-right">{activeReminders[0].title}</p>
                                {activeReminders[0].time && <p className="text-[9px] opacity-70 text-right">ساعت: {activeReminders[0].time}</p>}
                                <button onClick={() => setCurrentPage(Page.Calendar)} className="text-[9px] font-bold underline mt-1 block text-right">مشاهده تقویم</button>
                            </div>
                        </div>
                    </div>
                )}
                {renderPage()}
            </main>
        </div>
    );
}

export default App;
