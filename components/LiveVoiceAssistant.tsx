
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import type { Personnel, ShiftType, Department } from '../types';

interface LiveVoiceAssistantProps {
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    departments: Department[];
}

// Encoding/Decoding Utility Functions
function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

export function LiveVoiceAssistant({ personnel, shiftTypes, departments }: LiveVoiceAssistantProps) {
    const [isActive, setIsActive] = useState(false);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'error'>('idle');
    const [transcription, setTranscription] = useState<string>('');
    
    const audioContexts = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
    const sessionRef = useRef<any>(null);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const toggleSession = async () => {
        if (isActive) {
            stopSession();
        } else {
            startSession();
        }
    };

    const stopSession = () => {
        if (sessionRef.current) {
            sessionRef.current.close();
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
        for (const source of sourcesRef.current) {
            source.stop();
        }
        sourcesRef.current.clear();
        setIsActive(false);
        setStatus('idle');
    };

    const startSession = async () => {
        setStatus('connecting');
        // Initialize GoogleGenAI with apiKey from process.env.API_KEY as per guidelines
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        try {
            if (!audioContexts.current) {
                audioContexts.current = {
                    input: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }),
                    output: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 })
                };
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const systemInstruction = `
                شما دستیار صوتی هوشمند اپلیکیشن "حجله" (Hejleh) هستید. 
                این اپلیکیشن مخصوص مدیریت شیفت‌های بیمارستانی برای سرپرستاران است.
                اطلاعات فعلی بخش:
                - تعداد پرسنل: ${personnel.length} نفر
                - نام بخش‌ها: ${departments.map(d => d.name).join('، ')}
                - انواع شیفت‌ها: ${shiftTypes.map(s => s.name).join('، ')}
                وظیفه شما راهنمایی صوتی کاربر برای چیدمان بهتر، بررسی قوانین و پاسخ به سوالات مربوط به پرستاران است.
                پاسخ‌ها را کوتاه، محترمانه و به زبان فارسی ارائه دهید.
            `;

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setIsActive(true);
                        setStatus('listening');
                        
                        // Start recording and sending audio
                        const source = audioContexts.current!.input.createMediaStreamSource(stream);
                        const scriptProcessor = audioContexts.current!.input.createScriptProcessor(4096, 1, 1);
                        
                        // Fix: Rename parameter 'e' to 'audioProcessingEvent' to match the variable used in the function body
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            
                            sessionPromise.then(session => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContexts.current!.input.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                            setStatus('speaking');
                            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                            const audioBuffer = await decodeAudioData(
                                decode(base64Audio),
                                audioContexts.current!.output,
                                24000,
                                1
                            );

                            const source = audioContexts.current!.output.createBufferSource();
                            source.buffer = audioBuffer;
                            const outputNode = audioContexts.current!.output.createGain();
                            source.connect(outputNode);
                            outputNode.connect(audioContexts.current!.output.destination);

                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                                if (sourcesRef.current.size === 0) {
                                    setStatus('listening');
                                }
                            });

                            const now = audioContexts.current!.output.currentTime;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }

                        if (message.serverContent?.interrupted) {
                            for (const source of sourcesRef.current) {
                                source.stop();
                            }
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            setStatus('listening');
                        }
                    },
                    onerror: (e) => {
                        console.error('Live API Error:', e);
                        setStatus('error');
                        stopSession();
                    },
                    onclose: () => {
                        stopSession();
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                    },
                    systemInstruction,
                }
            });

            sessionRef.current = await sessionPromise;

        } catch (err) {
            console.error('Failed to start Live API:', err);
            setStatus('error');
        }
    };

    return (
        <div className="flex-grow flex flex-col items-center justify-center p-8 bg-slate-950 text-white relative overflow-hidden">
            {/* Background Animation */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-20">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600 rounded-full blur-[120px] transition-all duration-1000 ${isActive ? 'scale-110 opacity-40' : 'scale-75 opacity-20'}`}></div>
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500 rounded-full blur-[100px] transition-all duration-1000 delay-300 ${isActive ? 'scale-125 opacity-30' : 'scale-50 opacity-10'}`}></div>
            </div>

            <div className="z-10 text-center max-w-lg">
                <div className="mb-12">
                    <h1 className="text-4xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">دستیار صوتی حجله</h1>
                    <p className="text-slate-400 font-medium">مشاوره صوتی، چیدمان هوشمند و رفع ابهامات قوانین به صورت در لحظه.</p>
                </div>

                {/* Avatar Visualizer */}
                <div className="relative mb-16 flex items-center justify-center">
                    <div className={`absolute inset-0 bg-blue-500 rounded-full blur-2xl transition-all duration-300 ${status === 'speaking' ? 'opacity-40 scale-110' : 'opacity-10 scale-90'}`}></div>
                    <button 
                        onClick={toggleSession}
                        className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-500 transform active:scale-90 shadow-2xl ${isActive ? 'bg-white text-slate-900' : 'bg-slate-800 text-blue-400 hover:bg-slate-700'}`}
                    >
                        {status === 'connecting' ? (
                            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-slate-900"></div>
                        ) : isActive ? (
                            <svg className={`w-20 h-20 ${status === 'speaking' ? 'animate-pulse' : ''}`} fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        ) : (
                            <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                        )}
                    </button>
                    
                    {/* Visual Waves */}
                    {status === 'speaking' && (
                        <div className="absolute -bottom-8 flex gap-1">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="w-1.5 h-8 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }}></div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 p-6 rounded-[2rem] shadow-xl">
                    <p className={`text-sm font-black transition-colors ${status === 'error' ? 'text-rose-500' : 'text-blue-400'}`}>
                        {status === 'idle' && 'برای شروع مکالمه، دکمه میکروفون را فشار دهید.'}
                        {status === 'connecting' && 'در حال برقراری اتصال امن...'}
                        {status === 'listening' && 'آماده شنیدن... سوال خود را بپرسید.'}
                        {status === 'speaking' && 'دستیار در حال پاسخگویی است...'}
                        {status === 'error' && 'خطا در اتصال. لطفا اینترنت و میکروفون خود را چک کنید.'}
                    </p>
                </div>
                
                <div className="mt-8 flex justify-center gap-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Gemini 2.5 Live</span>
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> PCM 16kHz/24kHz</span>
                </div>
            </div>
        </div>
    );
}
