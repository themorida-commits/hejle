
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import type { Department, Personnel, ShiftType, ScheduleEntry, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, ChangeLog, GlobalDutySettings, ArchivedSchedule, CalendarEvent } from './types';
import { Page } from './types';
import { MOCK_DEPARTMENTS, MOCK_PERSONNEL, MOCK_SHIFT_TYPES, INITIAL_SCHEDULE, DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_SCHEDULE_NOTES, DEFAULT_GLOBAL_SETTINGS } from './constants';
import { Sidebar, type SidebarUser } from './components/Sidebar';

// بارگذاری تنبل صفحه‌ها برای کاهش حجم اولیه (code splitting)
const Scheduler = lazy(() => import('./components/Scheduler').then((m) => ({ default: m.Scheduler })));
const PersonnelManager = lazy(() => import('./components/PersonnelManager').then((m) => ({ default: m.PersonnelManager })));
const ShiftTypeManager = lazy(() => import('./components/ShiftTypeManager').then((m) => ({ default: m.ShiftTypeManager })));
const ArchiveViewer = lazy(() => import('./components/ArchiveViewer').then((m) => ({ default: m.ArchiveViewer })));
const RulesManager = lazy(() => import('./components/RulesManager').then((m) => ({ default: m.RulesManager })));
const CalendarManager = lazy(() => import('./components/CalendarManager').then((m) => ({ default: m.CalendarManager })));
const AiAssistant = lazy(() => import('./components/AiAssistant').then((m) => ({ default: m.AiAssistant })));
const DepartmentManager = lazy(() => import('./components/DepartmentManager').then((m) => ({ default: m.DepartmentManager })));
const SettingsManager = lazy(() => import('./components/SettingsManager').then((m) => ({ default: m.SettingsManager })));

import { supabase, isSupabaseConfigured } from './services/supabase';
import { loadUserDataFromSupabase, saveUserDataToSupabase, stableSignature, type CollectionName, type UserDataPayload } from './services/supabaseData';

type SupabaseUser = SidebarUser;

function PageLoadingFallback() {
    return (
        <div className="flex flex-1 items-center justify-center bg-gray-100" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-bold text-slate-500">در حال بارگذاری...</p>
            </div>
        </div>
    );
}

function HejlehApp() {
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
    const isSyncingFromCloud = useRef(false);
    // Signatures of the last payload successfully exchanged with Supabase,
    // used to push only the collections that actually changed.
    const syncedSignatures = useRef<Partial<Record<keyof UserDataPayload, string>>>({});

    const buildSupabasePayload = (): UserDataPayload => ({
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

    const rememberSyncedSignatures = (payload: UserDataPayload) => {
        (Object.keys(payload) as (keyof UserDataPayload)[]).forEach((key) => {
            syncedSignatures.current[key] = stableSignature(payload[key]);
        });
    };

    const seedLocalToSupabase = async (uid: string, payload: UserDataPayload) => {
        await saveUserDataToSupabase(uid, payload);
        rememberSyncedSignatures(payload);
    };

    const fetchAllFromSupabase = async (uid: string) => {
        setLoadingUserData(true);
        isSyncingFromCloud.current = true;
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
                rememberSyncedSignatures(payload);
            } else {
                await seedLocalToSupabase(uid, buildSupabasePayload());
            }
        } catch (e) {
            console.warn('Unable to load data from Supabase yet, using local state.', e);
        } finally {
            isSyncingFromCloud.current = false;
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
        if (!isSupabaseConfigured) {
            alert('سرویس ابری Supabase هنوز با کلیدهای اختصاصی شما در متغیرهای محیطی (.env) پیکربندی نشده است. کلیه اطلاعات و تغییرات شما در حافظه محلی ذخیره و بارگذاری می‌شود.');
            return;
        }
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
                    queryParams: {
                        prompt: 'select_account',
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
                Object.keys(localStorage)
                    .filter((key) => key.startsWith('hejleh_'))
                    .forEach((key) => localStorage.removeItem(key));
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

    // High performance debounced automatic Cloud mirroring via Supabase.
    // Only collections whose content actually changed since the last successful
    // sync are written, and the write itself is a single transactional RPC that
    // also removes rows deleted locally.
    useEffect(() => {
        if (!user || isSyncingFromCloud.current) return;

        const timeoutId = setTimeout(async () => {
            if (isSyncingFromCloud.current) return;

            const payload = buildSupabasePayload();
            const dirtyCollections = (Object.keys(payload) as (keyof UserDataPayload)[]).filter((key) => {
                if (key === 'globalSettings' || key === 'manualBalances') return false;
                return syncedSignatures.current[key] !== stableSignature(payload[key]);
            }) as CollectionName[];

            const singletonsDirty =
                syncedSignatures.current.globalSettings !== stableSignature(payload.globalSettings) ||
                syncedSignatures.current.manualBalances !== stableSignature(payload.manualBalances);

            if (dirtyCollections.length === 0 && !singletonsDirty) {
                return;
            }

            try {
                await saveUserDataToSupabase(user.id, payload, dirtyCollections, singletonsDirty);
                rememberSyncedSignatures(payload);
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
                await seedLocalToSupabase(user.id, buildSupabasePayload());
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

export default function App() {
    return (
        <Suspense fallback={<PageLoadingFallback />}>
            <HejlehApp />
        </Suspense>
    );
}
