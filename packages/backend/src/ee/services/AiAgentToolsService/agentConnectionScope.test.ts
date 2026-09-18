import { ConflictError } from '@lightdash/common';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    AGENT_SEVERAL_CONNECTIONS_MESSAGE,
    assertAgentConnectionIsUnambiguous,
} from './agentConnectionScope';

const PROJECT_UUID = 'project-uuid';

const projectModelWith = (connections: [string, string][]) =>
    ({
        getConnectionNamesByUuid: vi.fn(async () => new Map(connections)),
    }) as unknown as ProjectModel;

describe('assertAgentConnectionIsUnambiguous', () => {
    it('allows a project with one connection', async () => {
        await expect(
            assertAgentConnectionIsUnambiguous(
                projectModelWith([['connection-postgres', 'postgres']]),
                PROJECT_UUID,
            ),
        ).resolves.toBeUndefined();
    });

    it('allows a project with no connection row yet', async () => {
        await expect(
            assertAgentConnectionIsUnambiguous(
                projectModelWith([]),
                PROJECT_UUID,
            ),
        ).resolves.toBeUndefined();
    });

    it('says the agent cannot choose when the project has several', async () => {
        const projectModel = projectModelWith([
            ['connection-postgres', 'postgres'],
            ['connection-finance', 'finance'],
        ]);

        await expect(
            assertAgentConnectionIsUnambiguous(projectModel, PROJECT_UUID),
        ).rejects.toThrow(ConflictError);
        await expect(
            assertAgentConnectionIsUnambiguous(projectModel, PROJECT_UUID),
        ).rejects.toThrow(AGENT_SEVERAL_CONNECTIONS_MESSAGE);
    });

    it('names the limitation rather than the generic conflict', () => {
        expect(AGENT_SEVERAL_CONNECTIONS_MESSAGE).toContain(
            'the agent cannot pick one yet',
        );
        expect(AGENT_SEVERAL_CONNECTIONS_MESSAGE).not.toContain(
            'upgrade the client',
        );
    });
});
