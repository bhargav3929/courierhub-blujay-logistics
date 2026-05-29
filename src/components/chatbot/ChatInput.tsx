'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, Mic, MicOff, X, Sparkles, ScanLine } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const MAX_LENGTH = 500;
const EMOJIS = ['👍', '👋', '❤️', '🎉', '🙏', '✅', '📦', '🚚', '⚡', '🔥', '😊', '🤔'];
const SUGGESTIONS = ['Track order', 'Pricing', 'Carriers', 'API docs'];

const ICON_BTN =
    'h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export function ChatInput({
    onSend,
    onScanLabel,
    disabled = false,
    autoFocus = false,
    hasMessages = false,
}: {
    onSend: (text: string) => void;
    /** Tap-to-scan handler — opens the label-capture overlay. When omitted the button is hidden. */
    onScanLabel?: () => void;
    disabled?: boolean;
    autoFocus?: boolean;
    hasMessages?: boolean;
}) {
    // Label-scan is gated to authenticated non-admin users — the booking
    // flow it lands on only exists in the client portal.
    const { isAuthenticated, currentUser } = useAuth();
    const canScanLabel =
        !!onScanLabel &&
        isAuthenticated &&
        !!currentUser &&
        currentUser.role !== 'admin' &&
        currentUser.role !== 'super_admin';

    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<string[]>([]);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [recording, setRecording] = useState(false);
    const [speechAvailable, setSpeechAvailable] = useState(false);

    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (autoFocus) taRef.current?.focus();
    }, [autoFocus]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        setSpeechAvailable(!!SR);
    }, []);

    // Auto-grow textarea, capped at ~3 lines.
    useEffect(() => {
        const el = taRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }, [text]);

    useEffect(() => {
        if (!emojiOpen) return;
        const onClick = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setEmojiOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [emojiOpen]);

    const trimmed = text.trim();
    const canSend = (trimmed.length > 0 || attachments.length > 0) && !disabled;

    const submit = () => {
        if (!canSend) return;
        const note =
            attachments.length > 0
                ? (trimmed ? '\n\n' : '') +
                  attachments.map((n) => `📎 ${n}`).join('\n')
                : '';
        onSend((trimmed + note).trim());
        setText('');
        setAttachments([]);
        setEmojiOpen(false);
    };

    const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setAttachments((prev) => [...prev, ...files.map((f) => f.name)].slice(0, 4));
        if (e.target) e.target.value = '';
    };

    const addEmoji = (emoji: string) => {
        setText((prev) => (prev + emoji).slice(0, MAX_LENGTH));
        setEmojiOpen(false);
        taRef.current?.focus();
    };

    const toggleMic = () => {
        if (!speechAvailable) return;
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (recording) {
            recognitionRef.current?.stop();
            setRecording(false);
            return;
        }
        const rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = (e: any) => {
            const transcript = e.results?.[0]?.[0]?.transcript ?? '';
            if (transcript) {
                setText((prev) =>
                    (prev + (prev ? ' ' : '') + transcript).slice(0, MAX_LENGTH)
                );
            }
        };
        rec.onend = () => setRecording(false);
        rec.onerror = () => setRecording(false);
        recognitionRef.current = rec;
        try {
            rec.start();
            setRecording(true);
        } catch {
            setRecording(false);
        }
    };

    return (
        <div
            ref={wrapRef}
            className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
            {hasMessages && (
                <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => !disabled && onSend(s)}
                            disabled={disabled}
                            className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:hover:border-violet-700 dark:hover:bg-violet-900/30 dark:hover:text-violet-300 disabled:opacity-50 transition-colors"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            <div className="px-3 pt-2 pb-2">
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                        {attachments.map((name, i) => (
                            <span
                                key={`${name}-${i}`}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50"
                            >
                                <Paperclip className="h-3 w-3" />
                                <span className="max-w-[140px] truncate">{name}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setAttachments((prev) =>
                                            prev.filter((_, idx) => idx !== i)
                                        )
                                    }
                                    aria-label={`Remove ${name}`}
                                    className="ml-0.5 hover:text-violet-900 dark:hover:text-violet-100"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <div className="relative">
                    {emojiOpen && (
                        <div className="absolute bottom-full mb-2 right-20 z-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2 grid grid-cols-6 gap-1">
                            {EMOJIS.map((e) => (
                                <button
                                    key={e}
                                    type="button"
                                    onClick={() => addEmoji(e)}
                                    className="h-7 w-7 rounded-md hover:bg-violet-50 dark:hover:bg-violet-900/30 text-lg leading-none flex items-center justify-center transition-colors"
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Single-row composer — every control is h-9, items-center
                        keeps icons + placeholder text on the same baseline. */}
                    <div className="flex items-center gap-0.5 rounded-full border border-slate-200/80 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/70 focus-within:border-violet-400 dark:focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 dark:focus-within:ring-violet-900/30 transition-all pl-1 pr-1">
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={disabled}
                            aria-label="Attach file"
                            title="Attach"
                            className={`${ICON_BTN} text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30`}
                        >
                            <Paperclip className="h-[18px] w-[18px]" />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            accept="image/*,application/pdf"
                            onChange={handleFiles}
                            className="hidden"
                        />

                        {canScanLabel && (
                            <button
                                type="button"
                                onClick={onScanLabel}
                                disabled={disabled}
                                aria-label="Scan shipping label"
                                title="Scan a shipping label"
                                className={`${ICON_BTN} text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30`}
                            >
                                <ScanLine className="h-[18px] w-[18px]" />
                            </button>
                        )}

                        <textarea
                            ref={taRef}
                            value={text}
                            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                            placeholder={
                                disabled
                                    ? 'Thinking...'
                                    : recording
                                    ? 'Listening...'
                                    : 'Ask anything...'
                            }
                            disabled={disabled}
                            rows={1}
                            aria-label="Chat message"
                            className="flex-1 min-w-0 bg-transparent resize-none outline-none text-[13px] leading-5 placeholder:text-slate-400 disabled:opacity-60 max-h-24 px-1.5 py-2"
                        />

                        <button
                            type="button"
                            onClick={() => setEmojiOpen((v) => !v)}
                            disabled={disabled}
                            aria-label="Emoji"
                            title="Emoji"
                            className={`${ICON_BTN} ${
                                emojiOpen
                                    ? 'text-violet-600 bg-violet-50 dark:bg-violet-900/30'
                                    : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30'
                            }`}
                        >
                            <Smile className="h-[18px] w-[18px]" />
                        </button>

                        <button
                            type="button"
                            onClick={toggleMic}
                            disabled={disabled || !speechAvailable}
                            aria-label={recording ? 'Stop recording' : 'Voice input'}
                            title={
                                speechAvailable
                                    ? recording
                                        ? 'Stop'
                                        : 'Voice'
                                    : 'Voice input not supported'
                            }
                            className={`${ICON_BTN} ${
                                recording
                                    ? 'text-white bg-red-500 hover:bg-red-600 animate-pulse'
                                    : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30'
                            }`}
                        >
                            {recording ? (
                                <MicOff className="h-[18px] w-[18px]" />
                            ) : (
                                <Mic className="h-[18px] w-[18px]" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={submit}
                            disabled={!canSend}
                            aria-label="Send"
                            title="Send"
                            className={`${ICON_BTN} ${
                                canSend
                                    ? 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm hover:shadow active:scale-95'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                            }`}
                        >
                            <Send className="h-[18px] w-[18px]" />
                        </button>
                    </div>
                </div>

                <div className="mt-1.5 flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 px-2">
                    <span className="flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5 text-violet-500" />
                        <span>Powered by Blujay AI</span>
                    </span>
                    {text.length > 0 ? (
                        <span
                            className={
                                text.length > MAX_LENGTH * 0.9
                                    ? 'text-amber-500 font-medium'
                                    : ''
                            }
                        >
                            {text.length}/{MAX_LENGTH}
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
