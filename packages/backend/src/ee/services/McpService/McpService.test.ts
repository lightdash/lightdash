import { getProjectUuidForAgentList } from './McpService';

describe('McpService helpers', () => {
    describe('getProjectUuidForAgentList', () => {
        it('prefers the requested project uuid', () => {
            expect(
                getProjectUuidForAgentList({
                    requestedProjectUuid: 'requested-project',
                    activeProjectUuid: 'active-project',
                }),
            ).toBe('requested-project');
        });

        it('falls back to the active project uuid', () => {
            expect(
                getProjectUuidForAgentList({
                    activeProjectUuid: 'active-project',
                }),
            ).toBe('active-project');
        });
    });
});
