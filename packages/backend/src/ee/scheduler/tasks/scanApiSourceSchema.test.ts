import { NotFoundError, type SessionUser } from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { scanApiSourceSchema } from './scanApiSourceSchema';

const payload = {
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
    userUuid: 'user-1',
    externalConnectionUuid: 'conn-1',
};

const sessionUser = defaultSessionUser;

const buildDeps = (getSession: () => Promise<SessionUser>) => ({
    userService: { getSessionByUserUuidAndOrg: vi.fn(getSession) },
    externalConnectionService: {
        scanApiSourceSchema: vi.fn().mockResolvedValue(undefined),
    },
    externalConnectionModel: {
        setApiSourceSchema: vi.fn().mockResolvedValue(undefined),
    },
});

describe('scanApiSourceSchema task', () => {
    it('scans as the user who saved the connection', async () => {
        const deps = buildDeps(async () => sessionUser);

        await scanApiSourceSchema(deps)(payload);

        expect(
            deps.userService.getSessionByUserUuidAndOrg,
        ).toHaveBeenCalledWith('user-1', 'org-1');
        expect(
            deps.externalConnectionService.scanApiSourceSchema,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                user: expect.objectContaining({
                    id: defaultSessionUser.userUuid,
                }),
            }),
            'proj-1',
            'conn-1',
        );
        expect(
            deps.externalConnectionModel.setApiSourceSchema,
        ).not.toHaveBeenCalled();
    });

    it('marks the scan failed when the user is gone', async () => {
        const deps = buildDeps(async () => {
            throw new NotFoundError('User not found');
        });

        await expect(scanApiSourceSchema(deps)(payload)).rejects.toThrow(
            'User not found',
        );
        expect(
            deps.externalConnectionModel.setApiSourceSchema,
        ).toHaveBeenCalledWith(
            'conn-1',
            expect.objectContaining({
                status: 'failed',
                error: 'User not found',
            }),
        );
        expect(
            deps.externalConnectionService.scanApiSourceSchema,
        ).not.toHaveBeenCalled();
    });
});
