import {
    AgentCapability,
    FeatureFlags,
    SEED_ORG_1_ADMIN,
    type AgentAccessPreviewActionId,
    type AgentCapabilityPolicy,
    type AgentSystemRoleMatrix,
    type ApiAgentAccessPreviewResponse,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';
import { createProject, postgresWarehouseConfig } from '../helpers/projects';

const policyUrl = '/api/v2/org/agent-permissions';
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`;

describe('agent permission preview', () => {
    let admin: ApiClient;
    let editor: ApiClient;
    let projectUuid: string | undefined;
    let originalPolicy: AgentCapabilityPolicy | undefined;
    let originalFlag: boolean | undefined;
    let flagChanged = false;
    const getPolicy = async () =>
        (await admin.get<Body<AgentCapabilityPolicy>>(policyUrl)).body.results;
    const preview = (actionId: AgentAccessPreviewActionId, client = admin) =>
        client.post<ApiAgentAccessPreviewResponse>(
            `${policyUrl}/explain`,
            { personUuid: SEED_ORG_1_ADMIN.user_uuid, projectUuid, actionId },
            { failOnStatusCode: false },
        );
    const setCapabilities = async (capabilities: AgentCapability[]) => {
        const policy = await getPolicy();
        const systemRoleMatrix: AgentSystemRoleMatrix = {
            member: capabilities,
            viewer: capabilities,
            interactive_viewer: capabilities,
            editor: capabilities,
            developer: capabilities,
            admin: capabilities,
        };
        expect(
            (
                await admin.put(policyUrl, {
                    version: policy.version,
                    allowedProjectUuids: null,
                    allowedUserUuids: null,
                    systemRoleMatrix,
                })
            ).status,
        ).toBe(200);
    };

    beforeAll(async () => {
        admin = await login();
        editor = await loginAsEditor();
        originalFlag = (await admin.get<Body<{ enabled: boolean }>>(flagUrl))
            .body.results.enabled;
        if (!originalFlag) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            flagChanged = true;
        }
        originalPolicy = await getPolicy();
        projectUuid = await createProject(
            admin,
            `Agent permission preview ${Date.now()}`,
            postgresWarehouseConfig(),
        );
    });

    afterAll(async () => {
        try {
            if (originalPolicy) {
                const current = await getPolicy();
                expect(
                    (
                        await admin.put(policyUrl, {
                            version: current.version,
                            allowedProjectUuids:
                                originalPolicy.allowedProjectUuids,
                            allowedUserUuids: originalPolicy.allowedUserUuids,
                            systemRoleMatrix: originalPolicy.systemRoleMatrix,
                        })
                    ).status,
                ).toBe(200);
                if (originalPolicy.mode === 'legacy') {
                    expect(
                        (
                            await admin.post(`${policyUrl}/reset`, {
                                version: (await getPolicy()).version,
                            })
                        ).status,
                    ).toBe(200);
                }
            }
        } finally {
            try {
                if (projectUuid)
                    expect(
                        (
                            await admin.delete(
                                `/api/v1/org/projects/${projectUuid}`,
                            )
                        ).status,
                    ).toBe(200);
            } finally {
                if (flagChanged)
                    expect(
                        (await admin.post(flagUrl, { enabled: originalFlag }))
                            .status,
                    ).toBe(200);
            }
        }
    });

    it('shows both delivery requirements and the missing plain capability name', async () => {
        await setCapabilities([AgentCapability.ContentWrite]);
        const response = await preview('schedule_delivery');
        expect(response.status).toBe(200);
        expect(response.body.results.result).toBe('refused');
        expect(
            response.body.results.checks.filter(
                ({ kind }) => kind === 'capability',
            ),
        ).toMatchObject([
            { label: 'Create and edit content', status: 'allowed' },
            { label: 'Publish and share', status: 'refused' },
        ]);
        expect(response.body.results.mainReason?.message).toContain(
            'Publish and share',
        );
    });

    it('reports missing warehouse confirmation without running SQL', async () => {
        await setCapabilities([AgentCapability.RawSql]);
        const response = await preview('run_raw_sql');
        expect(response.status).toBe(200);
        expect(response.body.results).toMatchObject({
            result: 'setup_needed',
            warehouseAccess: 'not_verified',
        });
        expect(response.body.results.checks).toContainEqual(
            expect.objectContaining({
                kind: 'warehouse_confirmation',
                status: 'setup_needed',
            }),
        );
    });

    it('does not change the policy or confirmation on repeated calls', async () => {
        const before = await getPolicy();
        const confirmationUrl = `${policyUrl}/projects/${projectUuid}/warehouse-confirmation`;
        const confirmation = (await admin.get(confirmationUrl)).body;
        for (let index = 0; index < 3; index += 1) {
            expect((await preview('run_raw_sql')).status).toBe(200);
        }
        expect(await getPolicy()).toEqual(before);
        expect((await admin.get(confirmationUrl)).body).toEqual(confirmation);
    });

    it('returns legacy mode when limits are off', async () => {
        expect(
            (
                await admin.post(`${policyUrl}/reset`, {
                    version: (await getPolicy()).version,
                })
            ).status,
        ).toBe(200);
        const response = await preview('schedule_delivery');
        expect(response.status).toBe(200);
        expect(response.body.results).toMatchObject({
            mode: 'legacy',
            requiredCapabilities: [],
            policyMainReason: null,
        });
    });

    it('refuses a non-admin even when limits are off', async () => {
        expect((await preview('schedule_delivery', editor)).status).toBe(403);
    });
});
