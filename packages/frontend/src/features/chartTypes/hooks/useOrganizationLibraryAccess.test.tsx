import { FeatureFlags } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationChartTypesSetting } from '../../../hooks/organization/useOrganizationChartTypesSetting';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useOrganizationLibraryAccess } from './useOrganizationLibraryAccess';

const mocks = vi.hoisted(() => ({
    allowedActions: new Set<string>(),
}));

vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({
        can: (
            action: string,
            subject: { __caslSubjectType__: string; organizationUuid: string },
        ) =>
            subject.__caslSubjectType__ === 'OrganizationChartType' &&
            subject.organizationUuid === 'org-1' &&
            mocks.allowedActions.has(action),
    }),
}));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org-1' } } }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('../../../hooks/organization/useOrganizationChartTypesSetting', () => ({
    useOrganizationChartTypesSetting: vi.fn(),
}));

const setup = ({
    flag,
    setting,
    actions,
}: {
    flag: boolean;
    setting: boolean | undefined;
    actions: string[];
}) => {
    mocks.allowedActions = new Set(actions);
    vi.mocked(useServerFeatureFlag).mockImplementation(
        (flagId) =>
            ({
                data: {
                    id: flagId,
                    enabled:
                        flagId === FeatureFlags.OrganizationChartTypes && flag,
                },
            }) as ReturnType<typeof useServerFeatureFlag>,
    );
    vi.mocked(useOrganizationChartTypesSetting).mockReturnValue({
        data: setting === undefined ? undefined : { enabled: setting },
    } as ReturnType<typeof useOrganizationChartTypesSetting>);
    return renderHook(() => useOrganizationLibraryAccess()).result.current;
};

describe('useOrganizationLibraryAccess', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the library to chart builders when the flag and setting are on', () => {
        expect(setup({ flag: true, setting: true, actions: ['view'] })).toEqual(
            { isVisible: true, canManage: false },
        );
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: true,
        });
    });

    it('hides the library when the flag is off', () => {
        expect(
            setup({ flag: false, setting: true, actions: ['view', 'manage'] }),
        ).toEqual({ isVisible: false, canManage: false });
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: false,
        });
    });

    it('hides the library when the organization setting is off', () => {
        expect(
            setup({ flag: true, setting: false, actions: ['view', 'manage'] }),
        ).toEqual({ isVisible: false, canManage: true });
    });

    it('hides the library while the setting is loading', () => {
        expect(
            setup({ flag: true, setting: undefined, actions: ['view'] }),
        ).toEqual({ isVisible: false, canManage: false });
    });

    it('hides the library from users who cannot view it', () => {
        expect(setup({ flag: true, setting: true, actions: [] })).toEqual({
            isVisible: false,
            canManage: false,
        });
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: false,
        });
    });
});
