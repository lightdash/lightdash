import {
    ForbiddenError,
    type AiAgent,
    type SessionUser,
} from '@lightdash/common';
import { type SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { AiAgentService } from './AiAgentService';

describe('AiAgentService getAgentSuggestions', () => {
    it('applies prompt-context chart access checks before loading suggestion metadata', async () => {
        const hasAccess = vi.fn<SavedChartService['hasAccess']>(async () => {
            throw new ForbiddenError('Chart is not visible');
        });
        const get = vi.fn<SavedChartService['get']>();
        const service = new AiAgentService({
            savedChartService: { hasAccess, get },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        vi.spyOn(service, 'getAgent').mockResolvedValue({
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
        } as AiAgent);
        const user = {
            userUuid: 'user-1',
            organizationUuid: 'org-1',
        } as SessionUser;

        await expect(
            service.getAgentSuggestions(user, {
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                context: { type: 'chart', chartUuid: 'chart-1' },
            }),
        ).rejects.toThrow('Chart is not visible');

        expect(hasAccess).toHaveBeenCalledWith(
            'view',
            { user, projectUuid: 'project-1' },
            { savedChartUuid: 'chart-1' },
        );
        expect(get).not.toHaveBeenCalled();
    });
});
