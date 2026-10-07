import {
    AiPrincipalKind,
    AiTransportKind,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { aiAccessApi } from './api';
vi.mock('../../api', () => ({ lightdashApi: vi.fn().mockResolvedValue({}) }));
describe('AI access API URLs', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([null, 'connection / one'])(
        'builds connection-scoped URLs for %s',
        async (connection) => {
            const suffix = connection ? '?connection=connection+%2F+one' : '';
            await aiAccessApi.capabilities('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    version: 'v2',
                    method: 'GET',
                    url: `/projects/project/ai-access/capabilities${suffix}`,
                }),
            );
            const policy: UpsertAiAccessPolicy = {
                enabled: true,
                principalKind: AiPrincipalKind.GROUP,
                transport: { kind: AiTransportKind.DIRECT },
                sharedRef: null,
                twinNameTemplate: null,
                policySource: null,
                groupMappings: [],
            };
            await aiAccessApi.upsertPolicy('project', connection, policy);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    method: 'PUT',
                    url: `/projects/project/ai-access/policy${suffix}`,
                    body: JSON.stringify(policy),
                }),
            );
            await aiAccessApi.policy('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/policy${suffix}`,
                }),
            );
            await aiAccessApi.principals('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/principals${suffix}`,
                }),
            );
            await aiAccessApi.me('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/me${suffix}`,
                }),
            );
            await aiAccessApi.setupScript('project', connection, null);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/setup-script${suffix}`,
                }),
            );
            await aiAccessApi.setupScript('project', connection, 'principal');
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/setup-script?principal=principal${connection ? '&connection=connection+%2F+one' : ''}`,
                }),
            );
            await aiAccessApi.test('project', connection, 'principal');
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    url: `/projects/project/ai-access/principals/principal/test${suffix}`,
                }),
            );
            await aiAccessApi.regenerateSecret(
                'project',
                connection,
                'principal',
            );
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    url: `/projects/project/ai-access/principals/principal/regenerate-secret${suffix}`,
                }),
            );
            await aiAccessApi.deletePrincipal(
                'project',
                connection,
                'principal',
            );
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    method: 'DELETE',
                    url: `/projects/project/ai-access/principals/principal${suffix}`,
                }),
            );
        },
    );
});
