import { type Mock } from 'vitest';
import { sharedLightdashApi } from '../api';

// The shared client after vi.mock('<path>/api') (see src/__mocks__/api.ts).
export const mockedLightdashApi = sharedLightdashApi as unknown as Mock & {
    stream: Mock;
    getResultsFromStream: Mock;
};
