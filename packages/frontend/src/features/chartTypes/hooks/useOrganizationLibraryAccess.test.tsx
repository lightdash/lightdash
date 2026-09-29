import { FeatureFlags } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationChartTypesSetting } from '../../../hooks/organization/useOrganizationChartTypesSetting';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useOrganizationChartTypeManageAccess,
    useOrganizationLibraryAccess,
} from './useOrganizationLibraryAccess';

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

const mockFlags = (flags: { organization: boolean; dataApps: boolean }) =>
    vi.mocked(useServerFeatureFlag).mockImplementation(
        (flagId) =>
            ({
                isLoading: false,
                data: {
                    id: flagId,
                    enabled:
                        (flagId === FeatureFlags.OrganizationChartTypes &&
                            flags.organization) ||
                        (flagId === FeatureFlags.EnableDataApps &&
                            flags.dataApps),
                },
            }) as ReturnType<typeof useServerFeatureFlag>,
    );

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
    mockFlags({ organization: flag, dataApps: true });
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
            { isVisible: true },
        );
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: true,
        });
    });

    it('hides the library when the flag is off', () => {
        expect(
            setup({ flag: false, setting: true, actions: ['view', 'manage'] }),
        ).toEqual({ isVisible: false });
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: false,
        });
    });

    it('hides the library when the organization setting is off', () => {
        expect(
            setup({ flag: true, setting: false, actions: ['view', 'manage'] }),
        ).toEqual({ isVisible: false });
    });

    it('hides the library while the setting is loading', () => {
        expect(
            setup({ flag: true, setting: undefined, actions: ['view'] }),
        ).toEqual({ isVisible: false });
    });

    it('hides the library from users who cannot view it', () => {
        expect(setup({ flag: true, setting: true, actions: [] })).toEqual({
            isVisible: false,
        });
        expect(useOrganizationChartTypesSetting).toHaveBeenCalledWith({
            enabled: false,
        });
    });
});

describe('useOrganizationChartTypeManageAccess', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const access = ({
        organization = true,
        dataApps = true,
        setting = { data: { enabled: true }, isInitialLoading: false },
        actions = ['view', 'manage'],
    }: {
        organization?: boolean;
        dataApps?: boolean;
        setting?: {
            data: { enabled: boolean } | undefined;
            isInitialLoading: boolean;
        };
        actions?: string[];
    } = {}) => {
        mocks.allowedActions = new Set(actions);
        mockFlags({ organization, dataApps });
        vi.mocked(useOrganizationChartTypesSetting).mockReturnValue(
            setting as ReturnType<typeof useOrganizationChartTypesSetting>,
        );
        return renderHook(() => useOrganizationChartTypeManageAccess()).result
            .current;
    };

    it('lets managers manage when the flags and the library setting are on', () => {
        expect(access()).toEqual({ canManage: true, isLoading: false });
    });

    it('needs data apps, which every organization chart type write asserts', () => {
        expect(access({ dataApps: false }).canManage).toBe(false);
    });

    it('needs the rollout flag', () => {
        expect(access({ organization: false }).canManage).toBe(false);
    });

    it('needs the organization library setting', () => {
        expect(
            access({
                setting: { data: { enabled: false }, isInitialLoading: false },
            }),
        ).toEqual({ canManage: false, isLoading: false });
    });

    it('is loading while the setting loads', () => {
        expect(
            access({
                setting: { data: undefined, isInitialLoading: true },
            }),
        ).toEqual({ canManage: false, isLoading: true });
    });

    it('needs manage OrganizationChartType', () => {
        expect(access({ actions: ['view'] }).canManage).toBe(false);
    });
});
