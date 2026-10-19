import {
    ForbiddenError,
    ParameterError,
    QueryHistoryStatus,
    type AiAgentSuggestionContext,
    type SessionUser,
} from '@lightdash/common';
import { type Request } from 'express';
import { fromSession } from '../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';
import { AiAgentController } from './aiAgentController';

describe('AiAgentController getAgentSuggestions', () => {
    const getAgentSuggestions = vi.fn<AiAgentService['getAgentSuggestions']>(
        async () => ({ chips: [] }),
    );
    const controller = new AiAgentController({
        getAiAgentService: () => ({ getAgentSuggestions }),
    } as unknown as ServiceRepository);
    const request = {
        account: {
            user: { type: 'registered', id: 'user-1' },
            organization: {
                organizationUuid: 'org-1',
                name: 'Org',
                createdAt: new Date('2024-01-01'),
            },
            authentication: { type: 'session' },
        },
    } as unknown as Request;

    it.each<AiAgentSuggestionContext>([
        { type: 'chart', chartUuid: 'chart-1' },
        { type: 'dashboard', dashboardUuid: 'dashboard-1' },
    ])('forwards $type context to the service', async (context) => {
        await controller.getAgentSuggestions(
            request,
            'project-1',
            'agent-1',
            undefined,
            undefined,
            false,
            JSON.stringify(context),
        );

        expect(getAgentSuggestions).toHaveBeenCalledWith(
            expect.anything() as SessionUser,
            {
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                threadUuid: undefined,
                afterMessageUuid: undefined,
                enableSqlMode: false,
                context,
            },
        );
    });

    it('rejects malformed context before calling the service', async () => {
        getAgentSuggestions.mockClear();

        await expect(
            controller.getAgentSuggestions(
                request,
                'project-1',
                'agent-1',
                undefined,
                undefined,
                false,
                JSON.stringify({ type: 'chart' }),
            ),
        ).rejects.toThrow(ParameterError);

        expect(getAgentSuggestions).not.toHaveBeenCalled();
    });
});

describe('AiAgentController artifact query results', () => {
    const getArtifactQueryResults = vi.fn<
        AiAgentService['getArtifactQueryResults']
    >(async () => ({ status: QueryHistoryStatus.PENDING, queryUuid: 'query' }));
    const controller = new AiAgentController({
        getAiAgentService: () => ({ getArtifactQueryResults }),
    } as unknown as ServiceRepository);

    beforeEach(() => getArtifactQueryResults.mockClear());

    it('forwards the artifact scope and pagination to the service', async () => {
        const request = {
            account: fromSession(defaultSessionUser),
        } as unknown as Request;
        const response = await controller.getArtifactQueryResults(
            request,
            'project',
            'agent',
            'artifact',
            'version',
            'query',
            true,
            2,
            100,
        );
        expect(response).toEqual({
            status: 'ok',
            results: { status: QueryHistoryStatus.PENDING, queryUuid: 'query' },
        });
        expect(getArtifactQueryResults).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ userUuid: defaultSessionUser.userUuid }),
            {
                projectUuid: 'project',
                agentUuid: 'agent',
                artifactUuid: 'artifact',
                versionUuid: 'version',
                queryUuid: 'query',
                cached: true,
                page: 2,
                pageSize: 100,
            },
            request.account,
        );
    });

    it('refuses embed requests before the artifact result service', async () => {
        const request = {
            account: buildAccount({ accountType: 'jwt' }),
        } as unknown as Request;
        await expect(
            controller.getArtifactQueryResults(
                request,
                'project',
                'agent',
                'artifact',
                'version',
                'query',
                true,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getArtifactQueryResults).not.toHaveBeenCalled();
    });
});
