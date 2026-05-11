'use client';

import { User, Package, MapPin, Clock, Calendar } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '@/types/chatbot';

export function ChatMessage({ message }: { message: ChatMessageType }) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex gap-2 min-w-0 items-start ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar shown beside assistant replies only — same violet User
                icon as the header. User messages don't need an avatar; the
                right-aligned blue bubble is enough to identify them. */}
            {isUser ? (
                <div className="shrink-0 w-1" aria-hidden="true" />
            ) : (
                <div
                    className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300 flex items-center justify-center ring-1 ring-violet-200/60 dark:ring-violet-800/40"
                    aria-hidden="true"
                >
                    <User className="h-3.5 w-3.5" />
                </div>
            )}

            <div className={`min-w-0 max-w-[82%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
                {message.card?.type === 'tracking' ? (
                    <TrackingCard card={message.card} />
                ) : null}

                {message.content || message.streaming ? (
                    <div
                        className={`min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.55] ${
                            isUser
                                ? 'bg-blue-600 text-white rounded-tr-md shadow-sm shadow-blue-600/10'
                                : 'bg-white text-slate-800 rounded-tl-md border border-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700/60'
                        }`}
                    >
                        {isUser ? (
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-slate-200/70 dark:prose-code:bg-slate-700/70 prose-code:before:content-none prose-code:after:content-none prose-code:break-all prose-pre:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:text-xs prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:overflow-x-auto prose-headings:my-1.5 prose-a:break-words">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                                {message.streaming && message.content && (
                                    <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-slate-500 dark:bg-slate-400 animate-pulse align-middle" />
                                )}
                            </div>
                        )}
                    </div>
                ) : null}

                {message.streaming && !message.content ? (
                    <div className="rounded-2xl px-3.5 py-3 bg-slate-100 dark:bg-slate-800 rounded-tl-sm flex gap-1">
                        <Dot delay={0} />
                        <Dot delay={150} />
                        <Dot delay={300} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function Dot({ delay }: { delay: number }) {
    return (
        <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce"
            style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
        />
    );
}

function TrackingCard({
    card,
}: {
    card: {
        type: 'tracking';
        awb: string;
        courier: string;
        status: string;
        lastLocation?: string;
        lastActivity?: string;
        lastUpdated?: string;
        eta?: string;
    };
}) {
    return (
        <div className="w-full rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Package className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {card.courier}
                    </div>
                    <div className="font-mono text-sm font-semibold truncate">
                        AWB {card.awb}
                    </div>
                </div>
            </div>
            <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {card.status}
            </div>
            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {card.lastLocation ? (
                    <div className="flex items-start gap-1.5">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{card.lastLocation}</span>
                    </div>
                ) : null}
                {card.lastActivity ? (
                    <div className="flex items-start gap-1.5">
                        <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{card.lastActivity}</span>
                    </div>
                ) : null}
                {card.lastUpdated ? (
                    <div className="flex items-start gap-1.5">
                        <Clock className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>Updated {card.lastUpdated}</span>
                    </div>
                ) : null}
                {card.eta ? (
                    <div className="flex items-start gap-1.5">
                        <Calendar className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>ETA {card.eta}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
