/**
 * POST /api/chat
 *
 * The chatbot endpoint. Streams responses as Server-Sent Events (SSE).
 *
 * Body: {
 *   message: string,                                // current user message
 *   history?: Array<{ role: 'user'|'assistant', content: string }>  // last 8 turns
 * }
 *
 * Flow (deterministic first, LLM second):
 *   1. Rate-limit by client IP
 *   2. Sanitise + injection-check the user message
 *   3. Detect intent (regex/keyword)
 *   4. If tracking + AWB present → carrier lookup, return as structured card
 *   5. If high-confidence FAQ match → stream the FAQ answer directly
 *   6. Otherwise → stream from Claude Haiku 4.5 with FAQ knowledge injected
 *
 * SSE event shape (lines prefixed `data: `):
 *   { "type": "text",  "text": "partial chunk" }
 *   { "type": "card",  "card": <ChatCard> }
 *   { "type": "intent","intent": "tracking" }
 *   { "type": "done" }
 *   { "type": "error", "error": "message" }
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { classifyIntent } from '@/lib/chatbot/intents';
import { findRelevantFaqs, buildKnowledgeBlock, getDirectAnswer } from '@/lib/chatbot/faq';
import { sanitiseUserMessage, wrapUserContent, MAX_HISTORY_MESSAGES } from '@/lib/chatbot/promptGuards';
import { checkRateLimit, clientIpFrom } from '@/lib/chatbot/rateLimit';
import { streamChat, SYSTEM_PROMPT } from '@/services/server/aiClient';
import { lookupAwb } from '@/services/server/trackingProxy';
import type { ChatCard, ChatIntent } from '@/types/chatbot';

export const dynamic = 'force-dynamic';

const Body = z.object({
    message: z.string().min(1).max(2000),
    history: z
        .array(
            z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string().max(4000),
            })
        )
        .max(MAX_HISTORY_MESSAGES)
        .optional(),
});

// SSE helpers.
function sseEvent(payload: unknown): Uint8Array {
    return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamFromAsyncGenerator(gen: AsyncGenerator<Uint8Array>): ReadableStream {
    return new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of gen) {
                    controller.enqueue(chunk);
                }
                controller.close();
            } catch (err) {
                console.error('[chat] stream error:', err);
                controller.enqueue(
                    sseEvent({ type: 'error', error: 'Chat stream failed' })
                );
                controller.close();
            }
        },
    });
}

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering if behind proxy
};

export async function POST(request: NextRequest) {
    // 1. Rate limit (by IP).
    const ip = clientIpFrom(request.headers);
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
        return new Response(
            sseEvent({ type: 'text', text: limit.reason ?? 'Rate limit exceeded.' }) +
                new TextDecoder().decode(sseEvent({ type: 'done' })),
            { status: 200, headers: SSE_HEADERS }
        );
    }

    // 2. Parse + validate body.
    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
        return new Response(
            JSON.stringify({ error: 'Invalid body', issues: parsed.error.flatten() }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    const { message: rawMessage, history = [] } = parsed.data;

    // 3. Sanitise user input.
    const sanitised = sanitiseUserMessage(rawMessage);
    if (sanitised.blocked) {
        return new Response(
            sseEvent({ type: 'text', text: sanitised.blockedReason }) +
                new TextDecoder().decode(sseEvent({ type: 'done' })),
            { status: 200, headers: SSE_HEADERS }
        );
    }

    // 4. Classify intent.
    const intent = classifyIntent(sanitised.text);
    console.log(
        `[chat] ip=${ip} intent=${intent.intent} confidence=${intent.confidence}${intent.awb ? ` awb=${intent.awb}` : ''}`
    );

    // 5. Branch — tracking, then direct FAQ, then LLM.
    const generator = (async function* (): AsyncGenerator<Uint8Array> {
        yield sseEvent({ type: 'intent', intent: intent.intent satisfies ChatIntent });

        // -------- Tracking branch --------
        if (intent.intent === 'tracking' && intent.awb) {
            try {
                const result = await lookupAwb(intent.awb);
                if (result.found) {
                    const card: ChatCard = {
                        type: 'tracking',
                        awb: result.awb,
                        courier: result.carrierLabel,
                        status: result.status ?? 'Unknown',
                        lastLocation: result.lastLocation,
                        lastActivity: result.lastActivity,
                        lastUpdated: result.lastUpdated,
                        eta: result.eta,
                    };
                    yield sseEvent({ type: 'card', card });
                    yield sseEvent({
                        type: 'text',
                        text: `Found your shipment with **${result.carrierLabel}**. Latest status: **${result.status ?? 'in progress'}**.`,
                    });
                } else {
                    yield sseEvent({
                        type: 'text',
                        text: `I couldn't find AWB **${intent.awb}** with any of our carriers (Blue Dart, Delhivery, DTDC). Double-check the number, or this shipment may not be on Blujay.`,
                    });
                }
                yield sseEvent({ type: 'done' });
                return;
            } catch (err: any) {
                console.error('[chat] tracking lookup failed:', err?.message || err);
                yield sseEvent({
                    type: 'text',
                    text: "I couldn't fetch tracking right now — please try again in a moment, or check the carrier's own tracking page.",
                });
                yield sseEvent({ type: 'done' });
                return;
            }
        }

        if (intent.intent === 'tracking' && !intent.awb) {
            yield sseEvent({
                type: 'text',
                text: 'Sure — just paste the **AWB number** (or tracking ID) and I\'ll fetch the live status. It usually looks like a 9-12 digit number.',
            });
            yield sseEvent({ type: 'done' });
            return;
        }

        // -------- FAQ branch (deterministic) --------
        const faqMatches = findRelevantFaqs(sanitised.text);
        const directAnswer = getDirectAnswer(faqMatches);
        if (directAnswer && intent.intent !== 'greeting') {
            // High-confidence FAQ hit — return the canonical answer verbatim,
            // chunked for SSE so the UI still feels live.
            for (const chunk of chunkForSse(directAnswer)) {
                yield sseEvent({ type: 'text', text: chunk });
                await new Promise((r) => setTimeout(r, 18));
            }
            yield sseEvent({ type: 'done' });
            return;
        }

        // -------- LLM branch --------
        const knowledgeBlock = buildKnowledgeBlock(faqMatches);
        const systemPrompt = knowledgeBlock
            ? `${SYSTEM_PROMPT}\n\n${knowledgeBlock}`
            : SYSTEM_PROMPT;

        const turns = [
            ...history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
                role: m.role,
                content: m.role === 'user' ? wrapUserContent(m.content) : m.content,
            })),
            { role: 'user' as const, content: wrapUserContent(sanitised.text) },
        ];

        if (sanitised.injectionSuspected) {
            console.warn(`[chat] possible prompt-injection from ip=${ip}`);
        }

        try {
            for await (const delta of streamChat(systemPrompt, turns)) {
                yield sseEvent({ type: 'text', text: delta });
            }
            yield sseEvent({ type: 'done' });
        } catch (err: any) {
            console.error('[chat] groq stream error:', err?.message || err);
            yield sseEvent({
                type: 'text',
                text: 'I hit a temporary issue. Try again in a moment — or for urgent help, use the support icon in the dashboard.',
            });
            yield sseEvent({ type: 'done' });
        }
    })();

    return new Response(streamFromAsyncGenerator(generator), {
        status: 200,
        headers: SSE_HEADERS,
    });
}

/** Break a string into ~30-char chunks for SSE so direct-FAQ replies still
 *  visibly "stream" instead of arriving as a wall of text. */
function chunkForSse(text: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < text.length) {
        // Try to break at a space near the target size.
        let end = Math.min(i + 30, text.length);
        if (end < text.length) {
            const space = text.lastIndexOf(' ', end);
            if (space > i + 10) end = space + 1;
        }
        out.push(text.slice(i, end));
        i = end;
    }
    return out;
}
