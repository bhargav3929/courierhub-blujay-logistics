// FAQ retrieval — cheap keyword + pattern scoring against data/faq.json.
//
// For the current FAQ size (~25 entries) a simple lexical match works fine
// and stays sub-millisecond. If the FAQ grows past ~150 entries, swap in a
// vector index (Pinecone, Firebase vector search). The retrieval contract
// (input: string, output: ranked FaqEntry[]) doesn't change.

import faqRaw from '../../../data/faq.json';
import type { FaqEntry } from '@/types/chatbot';

const FAQ: FaqEntry[] = faqRaw as FaqEntry[];

// Pre-compile regex patterns at load time — done once per server boot.
const COMPILED = FAQ.map((entry) => ({
    entry,
    patterns: (entry.patterns ?? []).map((p) => new RegExp(p, 'i')),
}));

export interface FaqMatch {
    entry: FaqEntry;
    score: number;
}

/** Score every FAQ entry against a user message. */
export function findRelevantFaqs(message: string, limit = 3): FaqMatch[] {
    const lower = message.toLowerCase();

    const matches: FaqMatch[] = [];

    for (const { entry, patterns } of COMPILED) {
        let score = 0;

        // Regex hits are the strongest signal.
        for (const re of patterns) {
            if (re.test(message)) score += 3;
        }

        // Keyword hits — count distinct matches.
        for (const kw of entry.keywords) {
            if (lower.includes(kw.toLowerCase())) score += 1;
        }

        if (score > 0) {
            matches.push({ entry, score });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
}

/** Build a compact `<knowledge>...</knowledge>` block to inject into the LLM
 *  system prompt — gives the model authoritative answers to draw from. */
export function buildKnowledgeBlock(matches: FaqMatch[]): string {
    if (matches.length === 0) return '';
    const parts = matches.map((m) => `Q: ${m.entry.question}\nA: ${m.entry.answer}`);
    return `<knowledge>\nUse the following authoritative FAQ entries to answer the user. If the user's question isn't covered, say you don't have that information rather than inventing details.\n\n${parts.join('\n\n---\n\n')}\n</knowledge>`;
}

/** Direct FAQ answer — returned as-is when intent confidence is high
 *  enough that we don't need the LLM at all (saves a round-trip). */
export function getDirectAnswer(matches: FaqMatch[]): string | null {
    if (matches.length === 0) return null;
    const top = matches[0];
    // Require a strong score to skip the LLM (regex or 2+ keyword hits).
    if (top.score < 2) return null;
    return top.entry.answer;
}
