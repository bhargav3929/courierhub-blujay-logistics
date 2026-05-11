// Chatbot data types. Public-facing (visitors on landing pages can see
// these field names if they inspect network responses), so keep field
// names plain and non-leaky.

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    createdAt: number;       // epoch ms
    streaming?: boolean;     // assistant message currently being streamed
    intent?: ChatIntent;
    /** Structured payload rendered as a card alongside the text. */
    card?: ChatCard;
}

export type ChatIntent =
    | 'greeting'
    | 'tracking'
    | 'pricing'
    | 'carrier_support'
    | 'api_integration'
    | 'shipment_booking'
    | 'cod_support'
    | 'support_contact'
    | 'faq'
    | 'unknown';

/** Optional structured card rendered alongside a message — e.g. tracking. */
export type ChatCard =
    | {
          type: 'tracking';
          awb: string;
          courier: string;
          status: string;
          lastLocation?: string;
          lastActivity?: string;
          lastUpdated?: string;
          eta?: string;
      }
    | {
          type: 'quick_actions';
          actions: Array<{ label: string; prompt: string }>;
      };

/** FAQ entry shape used by data/faq.json. */
export interface FaqEntry {
    id: string;
    /** Keywords used to match user intent (lowercase). */
    keywords: string[];
    /** Optional regex patterns for stronger matches. Compiled at load time. */
    patterns?: string[];
    question: string;
    /** Answer body in markdown. Kept short — chatbot will lightly rephrase. */
    answer: string;
    intent?: ChatIntent;
}
