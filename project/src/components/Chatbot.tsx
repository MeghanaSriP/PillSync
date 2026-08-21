import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Sparkles, Globe, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { supabase, Medication, Schedule, DoseLog, MedicineDb } from '@/lib/supabase';
import {
  ChatMessage,
  Language,
  LANGUAGES,
  generateResponse,
  generateResponseAsync,
  generateGreeting,
  translate,
} from '@/lib/chatbot';

const STORAGE_KEY = 'pillsync-chat-language';
const MESSAGE_STORAGE_KEY = 'pillsync-chat-messages';

function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved as Language;
  } catch {}
  return 'en';
}

function loadMessages(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(MESSAGE_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export function Chatbot() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [medicineDb, setMedicineDb] = useState<MedicineDb[]>([]);
  const [unreadBadge, setUnreadBadge] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setUnreadBadge(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  useEffect(() => {
    if (!open && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') setUnreadBadge(true);
    }
  }, [messages, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadContext = useCallback(async () => {
    if (!user) return;
    let [{ data: meds, error: medErr }, { data: rawScheds, error: schedErr }, { data: logs }, { data: db }] = await Promise.all([
      supabase.from('medications').select('*, medicine_db(*)').eq('user_id', user.id).eq('active', true),
      supabase.from('schedules').select('*, medication(*)').eq('user_id', user.id),
      supabase.from('dose_logs').select('*').eq('user_id', user.id).order('scheduled_time', { ascending: false }).limit(200),
      supabase.from('medicines_db').select('*').limit(500),
    ]);

    if (medErr) {
      const { data: plainMeds } = await supabase.from('medications').select('*').eq('user_id', user.id).eq('active', true);
      meds = plainMeds;
    }

    if (schedErr) {
      const { data: plainScheds } = await supabase.from('schedules').select('*').eq('user_id', user.id);
      rawScheds = plainScheds;
    }

    const medicationList = (meds as Medication[]) || [];
    const scheduleList = ((rawScheds as Schedule[]) || []).map((s) => {
      if (s.medication) return s;
      const attachedMed = medicationList.find((m) => m.id === s.medication_id);
      return { ...s, medication: attachedMed };
    });

    setMedications(medicationList);
    setSchedules(scheduleList);
    setDoseLogs((logs as DoseLog[]) || []);
    setMedicineDb((db as MedicineDb[]) || []);
  }, [user]);

  useEffect(() => {
    if (user && open) loadContext();
  }, [user, open, loadContext]);

  useEffect(() => {
    if (messages.length === 0) {
      const greeting = generateGreeting(profile, language);
      const greetingMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toISOString(),
        language,
      };
      setMessages([greetingMsg]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {}
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    const response = await generateResponseAsync(text, {
      medications,
      schedules,
      doseLogs,
      profile,
      medicineDb,
      language,
    });

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      language,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setThinking(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    setShowLangMenu(false);
    const langName = LANGUAGES.find((l) => l.code === lang)?.nativeName || lang;
    const switchMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: translate(lang, 'languageChanged', { language: langName }),
      timestamp: new Date().toISOString(),
      language: lang,
    };
    setMessages((prev) => [...prev, switchMsg]);
  };

  const quickPrompts: Record<Language, string[]> = {
    en: ['What is your name?', 'All medicines & schedules', 'My schedule today', 'Do I need refills?', 'My adherence'],
    hi: ['आपका नाम क्या है?', 'सभी दवाएं और शेड्यूल', 'आज का शेड्यूल', 'रिफिल जरूरी?', 'मेरी अनुपालन'],
    ta: ['உங்கள் பெயர் என்ன?', 'அனைத்து மருந்துகளும் அட்டவணைகளும்', 'இன்றைய அட்டவணை', 'ரீஃபில் தேவையா?', 'எனது இணக்கம்'],
    te: ['మీ పేరేమిటి?', 'అన్ని మందులు మరియు షెడ్యూల్స్', 'నేటి షెడ్యూల్', 'రీఫిల్ అవసరం?', 'నా అనుపాలన'],
  };

  const clearChat = () => {
    const greeting = generateGreeting(profile, language);
    setMessages([{
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: greeting,
      timestamp: new Date().toISOString(),
      language,
    }]);
  };

  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-xl shadow-teal-600/30 flex items-center justify-center hover:scale-105 transition-transform"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="PillSync AI"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-6 h-6" />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} className="relative">
              <Sparkles className="w-6 h-6" />
              {unreadBadge && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-24 right-6 z-50 w-[calc(100vw-3rem)] sm:w-96 h-[32rem] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">PillSync AI</p>
                  <p className="text-[11px] text-white/80 leading-tight">{activeLang.nativeName} · Online</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div ref={langRef} className="relative">
                  <button
                    onClick={() => setShowLangMenu((v) => !v)}
                    className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                    aria-label="Change language"
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                  {showLangMenu && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-10 animate-[slideDown_0.15s_ease-out]">
                      {LANGUAGES.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => changeLanguage(l.code)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                            language === l.code ? 'bg-teal-50 text-teal-700 font-medium' : 'text-slate-700'
                          }`}
                        >
                          <span className="text-lg">{l.flag}</span>
                          <span>{l.nativeName}</span>
                          {language === l.code && <span className="ml-auto text-teal-600">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={clearChat} className="p-2 rounded-lg hover:bg-white/20 transition-colors" aria-label="Clear chat">
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-teal-600 text-white rounded-br-md'
                        : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {msg.role === 'assistant' && msg.content.includes('refill') && msg.content.includes('URGENT') && (
                      <div className="flex items-center gap-1.5 text-rose-600 font-semibold text-xs mb-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        Urgent
                      </div>
                    )}
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {thinking && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Quick prompts */}
            {messages.length <= 2 && (
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts[language].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={async () => {
                        const userMsg: ChatMessage = {
                          id: `msg-${Date.now()}`,
                          role: 'user',
                          content: prompt,
                          timestamp: new Date().toISOString(),
                        };
                        setMessages((prev) => [...prev, userMsg]);
                        setInput('');
                        setThinking(true);
                        const response = await generateResponseAsync(prompt, {
                          medications, schedules, doseLogs, profile, medicineDb, language,
                        });
                        setMessages((prev) => [...prev, {
                          id: `msg-${Date.now()}-a`,
                          role: 'assistant',
                          content: response,
                          timestamp: new Date().toISOString(),
                          language,
                        }]);
                        setThinking(false);
                      }}
                      className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-all"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-3 bg-white border-t border-slate-200">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`PillSync AI · ${activeLang.nativeName}`}
                  className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-slate-100 border border-transparent focus:bg-white focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all text-slate-800 placeholder:text-slate-400"
                  disabled={thinking}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || thinking}
                  className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
