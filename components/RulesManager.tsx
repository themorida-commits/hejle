
import React, { useState, useMemo, useEffect } from 'react';
import type { CustomRule } from '../types';

interface RulesManagerProps {
    rules: CustomRule[];
    setRules: React.Dispatch<React.SetStateAction<CustomRule[]>>;
}

const getRuleTooltipText = (rule: CustomRule): string => {
    switch (rule.type) {
        case 'head_nurse_morning':
            return 'هوش مصنوعی به طور خودکار سرپرستار را در شیفت صبح قرار می‌دهد، مگر اینکه شیفت دیگری به صورت دستی برای او ثبت شده باشد.';
        case 'max_consecutive_nights':
            return `هوش مصنوعی تضمین می‌کند که هیچ فردی بیش از ${rule.value} شیفت شب پشت سر هم نداشته باشد.`;
        case 'national_holidays':
            return 'در روزهای تعطیل رسمی که در سیستم تعریف شده‌اند، هوش مصنوعی به طور خودکار برای همه پرسنل شیفت تعطیل ثبت می‌کند.';
        case 'custom':
            return 'این یک قانون سفارشی است. هوش مصنوعی تلاش می‌کند تا این دستورالعمل متنی را در نظر بگیرد.';
        default:
            return 'این قانون بر نحوه تولید برنامه توسط هوش مصنوعی تأثیر می‌گذارد.';
    }
};

export function RulesManager({ rules, setRules }: RulesManagerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [ruleToDeleteId, setRuleToDeleteId] = useState<string | null>(null);
    const [isSorted, setIsSorted] = useState(false);
    
    const [ruleType, setRuleType] = useState<CustomRule['type']>('custom');
    const [ruleValue, setRuleValue] = useState<number>(2);
    const [ruleDescription, setRuleDescription] = useState<string>('');

    useEffect(() => {
        if (isModalOpen && !editingRule) {
            setRuleType('custom');
            setRuleValue(2);
            setRuleDescription('');
        }
    }, [isModalOpen, editingRule]);

    const openModal = (rule: CustomRule | null = null) => {
        if (rule) {
            setEditingRule(rule);
            setRuleType(rule.type);
            setRuleValue(rule.value || 2);
            setRuleDescription(rule.description);
        } else {
            setEditingRule(null);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingRule(null);
    };

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        let newRule: CustomRule;
        const id = editingRule?.id || `rule-${Date.now()}`;
        const isEnabled = editingRule?.isEnabled ?? true;

        if (ruleType === 'max_consecutive_nights') {
            newRule = {
                id,
                description: `یک فرد نمی‌تواند بیش از ${ruleValue} شیفت شب متوالی کار کند.`,
                isEnabled,
                type: 'max_consecutive_nights',
                value: ruleValue,
                priority: editingRule?.priority || 'IMPORTANT',
                category: editingRule?.category || 'PATIENT_SAFETY',
            };
        } else if (ruleType === 'national_holidays') {
            newRule = {
                id,
                description: "در روزهای تعطیل رسمی، برای تمام پرسنل شیفت 'تعطیل' ثبت شود.",
                isEnabled,
                type: 'national_holidays',
                priority: editingRule?.priority || 'CRITICAL',
                category: editingRule?.category || 'LABOR_LAW',
            };
        } else if (ruleType === 'head_nurse_morning') {
            newRule = {
                id,
                description: "سرپرستار همیشه شیفت صبح می‌باشد مگر با تغییر دستی.",
                isEnabled,
                type: 'head_nurse_morning',
                priority: editingRule?.priority || 'IMPORTANT',
                category: editingRule?.category || 'PATIENT_SAFETY',
            };
        } else {
            newRule = {
                id,
                description: ruleDescription,
                isEnabled,
                type: 'custom',
                priority: editingRule?.priority || 'RECOMMENDED',
                category: editingRule?.category || 'FAIRNESS',
            };
        }

        if (editingRule) {
            setRules(prev => prev.map(r => r.id === id ? newRule : r));
        } else {
            setRules(prev => [...prev, newRule]);
        }
        closeModal();
    };
    
    const openConfirmModal = (id: string) => {
        setRuleToDeleteId(id);
        setIsConfirmModalOpen(true);
    };

    const closeConfirmModal = () => {
        setRuleToDeleteId(null);
        setIsConfirmModalOpen(false);
    };

    const confirmDelete = () => {
        if (ruleToDeleteId) {
            setRules(prev => prev.filter(r => r.id !== ruleToDeleteId));
        }
        closeConfirmModal();
    };

    const toggleRule = (id: string) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, isEnabled: !r.isEnabled } : r));
    };

    const displayedRules = useMemo(() => {
        let result = [...rules];
        if (isSorted) {
            result.sort((a, b) => a.description.localeCompare(b.description, 'fa'));
        }
        return result;
    }, [rules, isSorted]);

    return (
        <div className="p-6 bg-slate-50 flex-grow h-full overflow-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h1 className="text-3xl font-black text-slate-800">قوانین هوشمند چیدمان</h1>
                        <span className="bg-slate-200 text-slate-600 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">مدیریت مدیر</span>
                    </div>
                    <p className="text-slate-500">تنها مدیر سیستم مجاز به تغییر یا حذف قوانین پایه است.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSorted(prev => !prev)}
                        className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ${isSorted ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                        {isSorted ? 'لغو ترتیب' : 'مرتب‌سازی'}
                    </button>
                    <button onClick={() => openModal()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                        افزودن قانون
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {displayedRules.map((rule, index) => (
                    <div key={rule.id} className={`group bg-white rounded-2xl border transition-all duration-300 border-slate-300 ${rule.isEnabled ? 'shadow-sm' : 'border-slate-200 opacity-60'}`}>
                        <div className="p-5 flex items-center justify-between">
                            <div className="flex items-start gap-4 flex-grow">
                                <div className={`mt-1 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${rule.isEnabled ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    {rule.type === 'custom' ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1.001.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    )}
                                </div>
                                <div className="flex-grow">
                                    <h3 className={`font-black text-sm mb-1 ${rule.isEnabled ? 'text-slate-800' : 'text-slate-500'}`}>
                                        <span className="ml-2 text-blue-600">{index + 1}.</span>
                                        {rule.description}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {rule.type === 'custom' ? 'سفارشی' : 'سیستمی'}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        <button className="text-[10px] font-bold text-blue-500 hover:underline relative group/tooltip">
                                            مشاهده راهنما
                                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-800 text-white text-[10px] p-2 rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-20 shadow-xl border border-slate-700">
                                                {getRuleTooltipText(rule)}
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 transition-opacity">
                                    <button onClick={() => openModal(rule)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    <button onClick={() => openConfirmModal(rule.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                </div>
                                <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
                                <button 
                                    onClick={() => toggleRule(rule.id)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${rule.isEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.isEnabled ? '-translate-x-6' : '-translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                {rules.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-300">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <h3 className="text-lg font-black text-slate-800">هنوز قانونی ثبت نشده است</h3>
                        <p className="text-slate-400 text-sm mt-1">برای شروع دکمه افزودن قانون را بزنید</p>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-300">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-black text-slate-800">{editingRule ? 'ویرایش قانون' : 'تعریف قانون جدید'}</h2>
                                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                            
                            <form onSubmit={handleSave} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">نوع قانون</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'custom', label: 'سفارشی' },
                                            { id: 'max_consecutive_nights', label: 'شب متوالی' },
                                            { id: 'national_holidays', label: 'تعطیلات' },
                                            { id: 'head_nurse_morning', label: 'سرپرستار' }
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                disabled={!!editingRule}
                                                onClick={() => setRuleType(t.id as any)}
                                                className={`p-3 rounded-xl border-2 font-black text-sm transition-all ${ruleType === t.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500 hover:border-slate-200'} ${editingRule ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {ruleType === 'custom' ? (
                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">شرح قانون</label>
                                        <textarea
                                            value={ruleDescription}
                                            onChange={(e) => setRuleDescription(e.target.value)}
                                            className="w-full p-4 bg-slate-50 border border-slate-300 rounded-2xl h-32 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                            placeholder="مثلاً: پرستارانی که شیفت شب هستند نباید روز بعد شیفت صبح باشند..."
                                            required
                                        ></textarea>
                                    </div>
                                ) : ruleType === 'max_consecutive_nights' ? (
                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">حداکثر تعداد مجاز</label>
                                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-300">
                                            <input
                                                type="number"
                                                value={ruleValue}
                                                onChange={(e) => setRuleValue(Number(e.target.value))}
                                                className="w-20 p-2 bg-white border border-slate-300 rounded-xl text-center font-black outline-none focus:border-blue-500"
                                                min="1"
                                                required
                                            />
                                            <span className="text-sm font-black text-slate-600">شب پشت سر هم</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                        <p className="text-xs font-black text-blue-700 leading-relaxed">
                                            {ruleType === 'national_holidays' 
                                                ? "این قانون سیستمی است و به صورت خودکار تمام تعطیلات رسمی تقویم را به عنوان شیفت آف لحاظ می‌کند."
                                                : "این قانون به صورت هوشمند همیشه سرپرستار بخش را در اولویت شیفت صبح قرار می‌دهد."}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={closeModal} className="flex-1 py-4 bg-slate-200 text-slate-700 border border-slate-300 rounded-2xl font-black text-sm hover:bg-slate-300 transition-all">انصراف</button>
                                    <button type="submit" className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all">ذخیره قانون</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
                    <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-sm text-center border border-slate-300">
                        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-100">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </div>
                        <h2 className="text-xl font-black text-slate-800 mb-2">حذف این قانون؟</h2>
                        <p className="text-slate-500 text-sm mb-8">این قانون از محاسبات هوش مصنوعی حذف خواهد شد. آیا مطمئن هستید؟</p>
                        <div className="flex gap-3">
                            <button onClick={closeConfirmModal} className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-black text-sm hover:bg-slate-300 transition-all border border-slate-300">خیر، بماند</button>
                            <button onClick={confirmDelete} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-sm hover:bg-rose-700 transition-all">بله، حذف کن</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
