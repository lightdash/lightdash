import { AgentActorSurface } from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { type AgentPermissionService } from './AgentPermissionService';
import {
    assertAgentOperation,
    isAgentOperationOff,
} from './assertAgentOperation';

const organizationUuid = defaultSessionUser.organizationUuid!;
const operation = {
    account: fromSession(defaultSessionUser),
    organizationUuid,
    projectUuid: 'project',
    kind: 'agent_tool' as const,
    key: 'runSql',
    surface: AgentActorSurface.MCP,
};

const setup = (enforcementMode: 'off' | 'admission' | 'managed') => {
    const request = { enforcementMode };
    const permissions = {
        loadRequest: vi.fn().mockResolvedValue(request),
        assertOperationWithRequest: vi.fn().mockResolvedValue(undefined),
    };
    return {
        request,
        permissions,
        typedPermissions: permissions as unknown as Pick<
            AgentPermissionService,
            'loadRequest' | 'assertOperationWithRequest'
        >,
    };
};

describe('isAgentOperationOff', () => {
    it.each([
        ['off', true],
        ['admission', false],
        ['managed', false],
    ] as const)('%s is off: %s', (enforcementMode, expected) => {
        expect(isAgentOperationOff({ enforcementMode })).toBe(expected);
    });
});

describe('assertAgentOperation', () => {
    it('skips the operation and the assert when enforcement is off', async () => {
        const { permissions, typedPermissions } = setup('off');
        const buildOperation = vi.fn(() => operation);

        await assertAgentOperation(
            typedPermissions,
            organizationUuid,
            buildOperation,
        );

        expect(permissions.loadRequest).toHaveBeenCalledWith(organizationUuid);
        expect(buildOperation).not.toHaveBeenCalled();
        expect(permissions.assertOperationWithRequest).not.toHaveBeenCalled();
    });

    it.each(['admission', 'managed'] as const)(
        'asserts the built operation with the loaded request in %s mode',
        async (enforcementMode) => {
            const { request, permissions, typedPermissions } =
                setup(enforcementMode);

            await assertAgentOperation(
                typedPermissions,
                organizationUuid,
                () => operation,
            );

            expect(permissions.assertOperationWithRequest).toHaveBeenCalledWith(
                { request, operation },
            );
        },
    );

    it('propagates a refusal from the assert', async () => {
        const { permissions, typedPermissions } = setup('managed');
        const refusal = new Error('refused');
        permissions.assertOperationWithRequest.mockRejectedValue(refusal);

        await expect(
            assertAgentOperation(
                typedPermissions,
                organizationUuid,
                () => operation,
            ),
        ).rejects.toBe(refusal);
    });

    it('propagates an error thrown while building the operation', async () => {
        const { permissions, typedPermissions } = setup('managed');
        const invalid = new Error('invalid account');

        await expect(
            assertAgentOperation(typedPermissions, organizationUuid, () => {
                throw invalid;
            }),
        ).rejects.toBe(invalid);
        expect(permissions.assertOperationWithRequest).not.toHaveBeenCalled();
    });
});
