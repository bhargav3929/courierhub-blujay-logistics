import type { Clock } from '@/types/b2b/ports';

export class SystemClock implements Clock {
    now(): Date {
        return new Date();
    }
}
