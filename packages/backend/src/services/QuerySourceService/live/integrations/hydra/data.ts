import { createHash } from 'node:crypto';

/**
 * Hydra's seeded rows. The same seed word, row count and day always give
 * the same rows.
 */

export const HYDRA_EVENT_TYPES = [
    'page_view',
    'sign_up',
    'add_to_cart',
    'purchase',
] as const;
export const HYDRA_PLANS = ['free', 'pro', 'enterprise'] as const;
export const HYDRA_COUNTRIES = ['US', 'GB', 'DE', 'FR', 'BR', 'IN', 'JP'];
/** Days of events kept, ending today. */
export const HYDRA_EVENT_DAYS = 90;

export type HydraEvent = {
    date: string;
    event_type: string;
    user_id: string;
    country: string;
    plan: string;
    revenue: number;
};

export type HydraUser = {
    user_id: string;
    plan: string;
    country: string;
    signup_date: string;
    seats: number;
};

export type HydraDataset = { events: HydraEvent[]; users: HydraUser[] };

const MODULUS = 2_147_483_647;

/** A word's seed: the same word always seeds the same rows. */
export const toSeed = (text: string) =>
    (parseInt(
        createHash('sha256').update(text).digest('hex').slice(0, 12),
        16,
    ) %
        (MODULUS - 1)) +
    1;

/** Park-Miller: small, and the same on every machine. */
export const createRandom = (seed: number) => {
    let state = seed;
    return () => {
        state = (state * 48_271) % MODULUS;
        return (state - 1) / (MODULUS - 1);
    };
};

export const addDays = (isoDate: string, days: number) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const pick = <T>(random: () => number, values: readonly T[]): T =>
    values[Math.floor(random() * values.length)];

// Most events are page views; purchases are rare and carry the revenue
const pickEventType = (random: () => number) => {
    const roll = random();
    if (roll < 0.6) return 'page_view';
    if (roll < 0.75) return 'sign_up';
    if (roll < 0.92) return 'add_to_cart';
    return 'purchase';
};

export const buildHydraDataset = ({
    seed,
    rowCount,
    today,
}: {
    seed: string;
    rowCount: number;
    today: string;
}): HydraDataset => {
    const random = createRandom(toSeed(seed));
    const userCount = Math.max(10, Math.round(rowCount / 10));
    const users = Array.from(
        { length: userCount },
        (_, index): HydraUser => ({
            user_id: `user_${String(index + 1).padStart(4, '0')}`,
            plan: pick(random, HYDRA_PLANS),
            country: pick(random, HYDRA_COUNTRIES),
            signup_date: addDays(today, -Math.floor(random() * 365)),
            seats: 1 + Math.floor(random() * 50),
        }),
    );
    const events = Array.from({ length: rowCount }, (): HydraEvent => {
        const user = pick(random, users);
        const eventType = pickEventType(random);
        return {
            date: addDays(today, -Math.floor(random() * HYDRA_EVENT_DAYS)),
            event_type: eventType,
            user_id: user.user_id,
            country: user.country,
            plan: user.plan,
            revenue:
                eventType === 'purchase'
                    ? Math.round((5 + random() * 495) * 100) / 100
                    : 0,
        };
    });
    return { events, users };
};
