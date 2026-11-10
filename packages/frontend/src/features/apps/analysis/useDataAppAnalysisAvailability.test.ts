import { describe, expect, it } from 'vitest';
import {
    isAnalysisEntryVisible,
    type DataAppAnalysisAvailability,
} from './useDataAppAnalysisAvailability';

const available: DataAppAnalysisAvailability = {
    status: 'available',
    canContinueInAskAi: true,
};
const orgSettingOff: DataAppAnalysisAvailability = {
    status: 'unavailable',
    reason: 'org_setting_off',
};
const copilotOff: DataAppAnalysisAvailability = {
    status: 'unavailable',
    reason: 'copilot_off',
};

describe('isAnalysisEntryVisible', () => {
    it.each([
        ['available, viewer', available, false, true],
        ['available, admin', available, true, true],
        ['turned off, viewer', orgSettingOff, false, false],
        ['turned off, admin', orgSettingOff, true, true],
        ['no AI, viewer', copilotOff, false, false],
        ['no AI, admin', copilotOff, true, false],
        ['loading, admin', { status: 'loading' } as const, true, false],
    ])('%s', (_, availability, canManageOrganization, expected) => {
        expect(
            isAnalysisEntryVisible(availability, canManageOrganization),
        ).toBe(expected);
    });
});
