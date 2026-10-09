import { vi } from 'vitest';
import type * as Api from '../api';

// Used by vi.mock('<path>/api'): the shared client becomes a mock and every
// other export stays real.
const actual = await vi.importActual<typeof Api>('../api');

export const { BASE_API_URL, createLightdashApi, networkHistory } = actual;

export const sharedLightdashApi = Object.assign(vi.fn(), {
    stream: vi.fn(),
    getResultsFromStream: vi.fn(),
});
