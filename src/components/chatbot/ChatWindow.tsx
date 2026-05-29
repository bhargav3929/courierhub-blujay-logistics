'use client';

// The chat window that mounts inside the floating widget. Owns the
// message list, sends user messages to /api/chat, and consumes the SSE
// stream chunk-by-chunk to render typed-out assistant responses.
import { useState, useRef, useEffect, useCallback } from 'react';
import { User, X, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';
import { LabelCapture } from './LabelCapture';
import type { ChatMessage as ChatMessageType, ChatCard } from '@/types/chatbot';

const MAX_HISTORY = 8;

function newId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatWindow({ onClose }: { onClose: () => void }) {
    const [messages, setMessages] = useState<ChatMessageType[]>([]);
    const [sending, setSending] = useState(false);
    const [labelCaptureOpen, setLabelCaptureOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Auto-scroll to bottom on new content.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages]);

    // Cleanup pending stream on unmount.
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const send = useCallback(
        async (text: string) => {
            if (sending) return;
            const userMsg: ChatMessageType = {
                id: newId(),
                role: 'user',
                content: text,
                createdAt: Date.now(),
            };
            const assistantId = newId();
            const assistantMsg: ChatMessageType = {
                id: assistantId,
                role: 'assistant',
                content: '',
                createdAt: Date.now(),
                streaming: true,
            };

            // Append both immediately — assistant shows the typing indicator
            // until the first text chunk arrives.
            const historyForApi = messages
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .slice(-MAX_HISTORY)
                .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

            setMessages((prev) => [...prev, userMsg, assistantMsg]);
            setSending(true);

            const ctrl = new AbortController();
            abortRef.current = ctrl;

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, history: historyForApi }),
                    signal: ctrl.signal,
                });
                if (!res.ok || !res.body) {
                    throw new Error(`Chat request failed: HTTP ${res.status}`);
                }
                await consumeSse(res.body, (evt) => {
                    setMessages((prev) =>
                        prev.map((m) => {
                            if (m.id !== assistantId) return m;
                            if (evt.type === 'text') {
                                return { ...m, content: m.content + evt.text };
                            }
                            if (evt.type === 'card') {
                                return { ...m, card: evt.card as ChatCard };
                            }
                            if (evt.type === 'intent') {
                                return { ...m, intent: evt.intent as ChatMessageType['intent'] };
                            }
                            if (evt.type === 'done') {
                                return { ...m, streaming: false };
                            }
                            if (evt.type === 'error') {
                                return {
                                    ...m,
                                    content:
                                        m.content ||
                                        'Sorry, I hit a temporary error. Please try again.',
                                    streaming: false,
                                };
                            }
                            return m;
                        })
                    );
                });
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                console.error('[chat] send failed:', err);
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {
                                  ...m,
                                  content:
                                      "I couldn't reach the server. Please check your connection and try again.",
                                  streaming: false,
                              }
                            : m
                    )
                );
            } finally {
                setSending(false);
            }
        },
        [messages, sending]
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="fixed bottom-24 right-4 sm:right-6 z-[60] flex flex-col w-[calc(100vw-2rem)] max-w-[400px] h-[min(80vh,640px)] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden overscroll-contain"
            role="dialog"
            aria-label="Blujay AI assistant"
            // Trap mouse-wheel and touch scrolling inside the widget so the
            // background page doesn't move while the user interacts with the
            // chatbot. Combined with `overscroll-contain` + `touch-pan-y` on
            // the inner messages container, this isolates scrolling fully.
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 leading-tight">
                        <div className="font-semibold text-sm tracking-tight">Blujay AI</div>
                        <div className="text-[11px] text-blue-100/90 flex items-center gap-1.5 mt-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Online · usually replies instantly</span>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close chat"
                    className="shrink-0 h-8 w-8 rounded-full hover:bg-white/15 active:bg-white/20 flex items-center justify-center transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Messages — independent scroll that doesn't leak to the page.
                 - overflow-y-auto: the scroll surface itself
                 - overscroll-contain: stop scroll-chaining at top/bottom
                 - touch-pan-y: tell mobile browsers we own vertical pan gestures
                 - min-h-0: required for flex-1 to actually constrain height
                 - scrollbar-thin pattern via custom utilities-less Tailwind */}
            <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y px-4 py-5 space-y-4 bg-slate-50/60 dark:bg-slate-950/40 scroll-smooth [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-300/60 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400/70 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700/60"
            >
                {messages.length === 0 ? (
                    <EmptyState onPick={send} />
                ) : (
                    messages.map((m) => <ChatMessage key={m.id} message={m} />)
                )}
            </div>

            <ChatInput
                onSend={send}
                onScanLabel={() => setLabelCaptureOpen(true)}
                disabled={sending}
                autoFocus
                hasMessages={messages.length > 0}
            />

            {labelCaptureOpen && <LabelCapture onClose={() => setLabelCaptureOpen(false)} />}
        </motion.div>
    );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
    return (
        <div className="flex flex-col items-center text-center pt-8 pb-2 gap-4">
            <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center ring-4 ring-violet-50 dark:ring-violet-900/20">
                <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-[15px]">
                    How can I help today?
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed">
                    Ask about carriers, tracking, API integration, or pricing.
                </div>
            </div>
            <div className="w-full pt-3">
                <QuickActions onPick={onPick} />
            </div>
        </div>
    );
}

// ---- SSE parser ----
// Parses `data: {...}\n\n` lines from a fetch ReadableStream<Uint8Array>.
type SseEvent =
    | { type: 'text'; text: string }
    | { type: 'card'; card: unknown }
    | { type: 'intent'; intent: string }
    | { type: 'done' }
    | { type: 'error'; error: string };

async function consumeSse(
    body: ReadableStream<Uint8Array>,
    onEvent: (evt: SseEvent) => void
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE events are separated by `\n\n`.
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of block.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload) continue;
                try {
                    onEvent(JSON.parse(payload) as SseEvent);
                } catch {
                    // ignore malformed lines
                }
            }
        }
    }
}
