import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    type PossibleAbilities,
    type RegisteredAccount,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type PreflightModel } from '../../models/PreflightModel';
import { PreflightService } from './PreflightService';

const adminAccount = {
    organization: { organizationUuid: 'org-uuid', name: 'Acme' },
    user: {
        id: 'user-uuid',
        userUuid: 'user-uuid',
        ability: new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'manage' },
        ]),
    },
    authentication: { type: 'session' },
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
} as unknown as RegisteredAccount;

const viewerAccount = {
    ...adminAccount,
    user: {
        ...adminAccount.user,
        ability: new Ability<PossibleAbilities>([]),
    },
} as unknown as RegisteredAccount;

const buildService = (allowMultiOrgs: boolean, probeEnabled = true) => {
    const preflightModel = {
        getLockState: vi.fn(async () => ({
            isLocked: false,
            lastMigrationAgeSeconds: 3600,
        })),
        getTableStats: vi.fn(async () => []),
        getActivity: vi.fn(async () => []),
    } as unknown as PreflightModel;

    const service = new PreflightService({
        lightdashConfig: {
            ...lightdashConfigMock,
            allowMultiOrgs,
            preflight: { probeEnabled },
        },
        preflightModel,
    });
    return { service, preflightModel };
};

describe('PreflightService — probe', () => {
    it('refuses when the probe is not enabled by environment variable', async () => {
        const { service, preflightModel } = buildService(false, false);
        await expect(service.probe(adminAccount, ['users'])).rejects.toThrow(
            /not enabled/,
        );
        expect(preflightModel.getLockState).not.toHaveBeenCalled();
    });

    it('refuses outright on multi-organization instances', async () => {
        const { service, preflightModel } = buildService(true);
        await expect(service.probe(adminAccount, ['users'])).rejects.toThrow(
            ForbiddenError,
        );
        expect(preflightModel.getLockState).not.toHaveBeenCalled();
    });

    it('refuses non-admin accounts', async () => {
        const { service } = buildService(false);
        await expect(service.probe(viewerAccount, ['users'])).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects invalid table names', async () => {
        const { service } = buildService(false);
        await expect(
            service.probe(adminAccount, ['users; DROP TABLE users']),
        ).rejects.toThrow(ParameterError);
    });

    it('probes single-org instances with query text included', async () => {
        const { service, preflightModel } = buildService(false);
        const probe = await service.probe(adminAccount, ['users', 'users']);
        expect(probe.lock).toEqual({
            isLocked: false,
            lastMigrationAgeSeconds: 3600,
        });
        expect(preflightModel.getTableStats).toHaveBeenCalledWith(['users']);
        expect(preflightModel.getActivity).toHaveBeenCalledWith({
            includeQueryText: true,
        });
    });
});
