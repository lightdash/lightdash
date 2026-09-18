import { ProjectType, toolListProjectsOutputSchema } from '@lightdash/common';
import { getListProjects } from './listProjects';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const execute = async (tool: ReturnType<typeof getListProjects>) => {
    if (!tool.execute) {
        throw new Error('listProjects tool has no execute function');
    }
    const output = await tool.execute(
        {},
        { messages: [], toolCallId: 'tool-call-1' },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('listProjects tool must not stream its output');
    }
    return output;
};

describe('getListProjects', () => {
    it('lists every accessible project and flags the active one', async () => {
        const output = await execute(
            getListProjects({
                listProjects: vi.fn().mockResolvedValue([
                    {
                        projectUuid: 'uuid-1',
                        name: 'Production',
                        type: ProjectType.DEFAULT,
                        isActive: true,
                    },
                    {
                        projectUuid: 'uuid-2',
                        name: 'Staging',
                        type: ProjectType.PREVIEW,
                        isActive: false,
                    },
                ]),
            }),
        );

        expect(output.result).toBe(
            [
                'You have access to 2 project(s):',
                '• Production (the project you are currently working in)',
                '• Staging',
            ].join('\n'),
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            projects: [
                { name: 'Production', isActive: true },
                { name: 'Staging', isActive: false },
            ],
        });
        expect(toolListProjectsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('reports an empty project list as an empty structured list', async () => {
        const output = await execute(
            getListProjects({ listProjects: vi.fn().mockResolvedValue([]) }),
        );

        expect(output.result).toBe(
            "You don't have access to any projects in this organization.",
        );
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({ projects: [] });
        expect(toolListProjectsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors the error text in structuredContent when listing fails', async () => {
        const output = await execute(
            getListProjects({
                listProjects: vi
                    .fn()
                    .mockRejectedValue(new Error('database unavailable')),
            }),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error listing projects.');
        expect(output.result).toContain('database unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolListProjectsOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
