import { type HydraApiSource } from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

type HydraBehaviour = Omit<HydraApiSource, 'connector'>;

/** A Hydra source that behaves like a healthy, unhurried API. */
export const HYDRA_DEFAULT_SETTINGS: HydraApiSource = {
    connector: ApiConnectorType.HYDRA,
    latencyMs: 0,
    errorRate: 0,
    retryAfterEvery: 0,
    retryAfterSeconds: 1,
    failAuth: false,
    rowCount: 1_000,
    callsPerMinute: 30,
    callsPerHour: 300,
};

const KEYS = Object.keys(HYDRA_DEFAULT_SETTINGS).filter(
    (key): key is keyof HydraBehaviour => key !== 'connector',
);

const isKey = (key: string): key is keyof HydraBehaviour =>
    (KEYS as string[]).includes(key);

/** Hydra's settings as one line of `key=value` pairs, as the setup form shows them. */
export const formatHydraBehaviour = (settings: HydraApiSource): string =>
    KEYS.filter((key) => settings[key] !== HYDRA_DEFAULT_SETTINGS[key])
        .map((key) => `${key}=${settings[key]}`)
        .join(' ');

/**
 * Reads `key=value` pairs separated by spaces or commas; keys left out keep
 * their defaults. Null when a key is unknown or a value doesn't fit it.
 */
export const parseHydraBehaviour = (text: string): HydraApiSource | null => {
    const settings: HydraApiSource = { ...HYDRA_DEFAULT_SETTINGS };
    const pairs = text.split(/[\s,]+/).filter(Boolean);
    for (const pair of pairs) {
        const [key, value, ...rest] = pair.split('=');
        if (!key || value === undefined || rest.length > 0 || !isKey(key)) {
            return null;
        }
        if (key === 'failAuth') {
            if (value !== 'true' && value !== 'false') return null;
            settings.failAuth = value === 'true';
        } else {
            const number = Number(value);
            if (value === '' || !Number.isFinite(number) || number < 0) {
                return null;
            }
            if (key === 'errorRate') {
                if (number > 1) return null;
            } else if (!Number.isInteger(number)) {
                return null;
            }
            settings[key] = number;
        }
    }
    return settings.callsPerMinute >= 1 && settings.callsPerHour >= 1
        ? settings
        : null;
};
