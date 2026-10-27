import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    AiAccessRefusedError,
    FeatureFlags,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { buildAccount } from '../../auth/account/account.mock';
import { createOAuthScopedAbility } from '../../auth/oauthScopes/scopedAbility';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../AiAccessService/agentExecutionContext';
import {
    assertHumanAgentPolicyMutation,
    getManagedAgentPolicy,
} from './assertHumanManagedMutation';

describe.each(['managed', 'admission', 'people-only'] as const)(
    'human policy changes in %s mode',
    (mode) => {
        const setup = (enabled = true) => {
            const account = buildAccount();
            const ability = new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]);
            const policy = {
                mode:
                    mode === 'managed'
                        ? ('managed' as const)
                        : ('legacy' as const),
                allowedGroupUuids:
                    mode === 'admission' ? ['allowed-group'] : null,
                version: 7,
                allowedCapabilities: null,
                systemRoleMatrix: {} as never,
            };
            const getPolicy = vi
                .spyOn(AgentCapabilityPolicyModel.prototype, 'get')
                .mockResolvedValue(policy);
            const context = {
                organizationUuid: account.organization.organizationUuid,
                ability,
                oauth: false,
                database: {} as Knex,
                featureFlagModel: {
                    get: vi.fn().mockResolvedValue({
                        id: FeatureFlags.AgentIdentity,
                        enabled,
                    }),
                },
            };
            return { account, context, getPolicy, policy };
        };

        afterEach(() => vi.restoreAllMocks());

        test.each([
            'oauth',
            'scoped-ability',
            'agent-connection',
            'agent',
        ] as const)('refuses %s changes before any mutation', async (actor) => {
            const f = setup();
            if (actor === 'oauth') f.context.oauth = true;
            if (actor === 'scoped-ability')
                f.context.ability = createOAuthScopedAbility(
                    f.context.ability,
                    {
                        mode: 'log',
                        scopes: ['read', 'write'],
                        clientId: 'agent',
                        getRequest: () => ({
                            method: null,
                            routeTemplate: null,
                        }),
                    },
                );
            const mutate = () => assertHumanAgentPolicyMutation(f.context);
            const result =
                actor === 'agent' || actor === 'agent-connection'
                    ? agentExecutionContext.run(
                          createAgentExecutionContext({
                              account: f.account,
                              surface: AgentActorSurface.CLI,
                              clientId: 'lightdash-cli',
                              agentUuid: null,
                              agentIdentityEnabled: true,
                              agentConnectionExecution:
                                  actor === 'agent-connection'
                                      ? {
                                            grantUuid: 'grant',
                                            revision: 1,
                                            subjectUserUuid: f.account.user.id,
                                            organizationUuid:
                                                f.context.organizationUuid!,
                                            clientId: 'lightdash-cli',
                                            resource:
                                                'https://lightdash.example',
                                            refreshFamilyUuid: 'family',
                                            scopes: ['read', 'write'],
                                            operation: {
                                                kind: 'rest',
                                                key: 'GroupController.updateGroup',
                                            },
                                        }
                                      : null,
                          }),
                          mutate,
                      )
                    : mutate();
            await expect(result).rejects.toBeInstanceOf(AiAccessRefusedError);
        });

        test('allows a human without reading policy', async () => {
            const f = setup();
            await expect(
                assertHumanAgentPolicyMutation(f.context),
            ).resolves.toBeUndefined();
            expect(f.getPolicy).not.toHaveBeenCalled();
        });

        test('keeps flag-off behavior without reading policy', async () => {
            const f = setup(false);
            f.context.oauth = true;
            await expect(
                assertHumanAgentPolicyMutation(f.context),
            ).resolves.toBeUndefined();
            expect(f.getPolicy).not.toHaveBeenCalled();
        });

        test('preserves managed-only policy lookup for content operations', async () => {
            const f = setup();
            f.context.oauth = true;
            await expect(getManagedAgentPolicy(f.context)).resolves.toEqual(
                mode === 'managed' ? f.policy : null,
            );
        });
    },
);
