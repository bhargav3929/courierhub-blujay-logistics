'use client';

// Floating "Ask Blujay AI" button + chat window controller.
// Mounted globally from root layout. Hides itself on auth pages and
// inside the merchant/admin route groups (Phase 1 is public-only).
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatWindow } from './ChatWindow';

// Path prefixes where the chatbot should NOT appear.
//
// Hidden only on the auth flow — those pages need focused attention and the
// floating widget would be a distraction. Everywhere else (landing, public
// docs, AND logged-in client/admin pages) the widget is available so users
// can ask FAQ + tracking questions while doing other work. Phase 2 will add
// merchant-aware features that only activate when logged in.
const HIDDEN_PATH_PREFIXES = [
    '/client-login',
    '/white-label-onboarding',
];

export function ChatbotWidget() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Don't render on logged-in / auth-flow pages.
    if (pathname && HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
        return null;
    }

    return (
        <>
            <AnimatePresence>{open && <ChatWindow onClose={() => setOpen(false)} />}</AnimatePresence>

            <motion.button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? 'Close Blujay AI' : 'Open Blujay AI'}
                aria-expanded={open}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-5 right-4 sm:right-6 z-[61] flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white pl-3 pr-4 sm:pl-3.5 sm:pr-5 py-3 shadow-xl shadow-blue-600/30 transition-shadow"
            >
                <span className="relative h-7 w-7 rounded-full bg-white/15 flex items-center justify-center backdrop-blur">
                    <AnimatePresence initial={false} mode="wait">
                        {open ? (
                            <motion.span
                                key="close"
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <X className="h-4 w-4" />
                            </motion.span>
                        ) : (
                            <motion.span
                                key="open"
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <MessageCircle className="h-4 w-4" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </span>
                <span className="text-sm font-semibold whitespace-nowrap">
                    {open ? 'Close' : 'Ask Blujay AI'}
                </span>
            </motion.button>
        </>
    );
}
