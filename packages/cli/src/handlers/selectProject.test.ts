import { LightdashError, ProjectType } from '@lightdash/common';
import inquirer from 'inquirer';
import type { MockedFunction, MockInstance } from 'vitest';
import { Config, unsetPreviewProject } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { logSelectedProject, selectProject } from './selectProject';

vi.mock('inquirer');
vi.mock('../analytics/analytics');
vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
}));
vi.mock('../config', () => ({
    unsetPreviewProject: vi.fn().mockResolvedValue(undefined),
}));

const mockLightdashApi = lightdashApi as MockedFunction<typeof lightdashApi>;

const PREVIEW_UUID = '00000000-0000-0000-0000-000000000001';
const MAIN_UUID = '00000000-0000-0000-0000-000000000002';

const mockPreviewProjectResponse = (uuid: string) => {
    mockLightdashApi.mockResolvedValueOnce({
        projectUuid: uuid,
        type: ProjectType.PREVIEW,
        // The rest of the Project shape is irrelevant for this test
    } as never);
};

describe('selectProject', () => {
    beforeEach(() => {
        vi.stubEnv('LIGHTDASH_PROJECT', undefined);
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it.each([true, false])(
        'uses LIGHTDASH_PROJECT instead of an active preview and warns (non-interactive: %s)',
        async (nonInteractive) => {
            vi.stubEnv('LIGHTDASH_PROJECT', MAIN_UUID);
            vi.spyOn(GlobalState, 'isNonInteractive').mockReturnValue(
                nonInteractive,
            );
            const log = vi
                .spyOn(GlobalState, 'log')
                .mockImplementation(() => {});
            mockPreviewProjectResponse(PREVIEW_UUID);
            const config: Config = {
                context: {
                    project: MAIN_UUID,
                    previewProject: PREVIEW_UUID,
                    previewName: 'My preview',
                },
            };

            expect(await selectProject(config)).toEqual({
                projectUuid: MAIN_UUID,
                isPreview: false,
            });
            expect(inquirer.prompt).not.toHaveBeenCalled();
            expect(log).toHaveBeenCalledTimes(1);
            const warning = String(log.mock.calls[0][0]);
            expect(warning).toContain(
                `Using project ${MAIN_UUID} from LIGHTDASH_PROJECT`,
            );
            expect(warning).toContain('active preview "My preview" ignored');
            expect(warning).toContain(`--project ${PREVIEW_UUID}`);
        },
    );

    it('clears a deleted preview instead of warning when LIGHTDASH_PROJECT is set', async () => {
        vi.stubEnv('LIGHTDASH_PROJECT', MAIN_UUID);
        const log = vi.spyOn(GlobalState, 'log').mockImplementation(() => {});
        mockLightdashApi.mockRejectedValueOnce(
            new LightdashError({
                message: 'Not found',
                name: 'NotFoundError',
                statusCode: 404,
                data: {},
            }),
        );

        expect(
            await selectProject({
                context: { project: MAIN_UUID, previewProject: PREVIEW_UUID },
            }),
        ).toEqual({ projectUuid: MAIN_UUID, isPreview: false });
        expect(unsetPreviewProject).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
    });

    it.each<[string, NonNullable<Config['context']>]>([
        ['no preview is active', { project: MAIN_UUID }],
        [
            'LIGHTDASH_PROJECT points at the preview itself',
            { project: MAIN_UUID, previewProject: PREVIEW_UUID },
        ],
    ])('does not warn when %s', async (_label, context) => {
        const envProject = context.previewProject ?? MAIN_UUID;
        vi.stubEnv('LIGHTDASH_PROJECT', envProject);
        const log = vi.spyOn(GlobalState, 'log').mockImplementation(() => {});
        mockPreviewProjectResponse(PREVIEW_UUID);

        expect(await selectProject({ context })).toEqual({
            projectUuid: envProject,
            isPreview: false,
        });
        expect(log).not.toHaveBeenCalled();
    });

    it('returns the preview project (without prompting) when the stored main and preview UUIDs are the same', async () => {
        // This is the misconfigured state produced by an older `set-project`
        // that allowed selecting a preview project as the default. Both
        // entries point at the same preview UUID, so the prompt would
        // otherwise label the same project as both "Preview" and "Production".
        mockPreviewProjectResponse(PREVIEW_UUID);

        const config: Config = {
            context: {
                project: PREVIEW_UUID,
                projectName: 'my-preview',
                previewProject: PREVIEW_UUID,
                previewName: 'my-preview',
            },
        };

        const result = await selectProject(config);

        expect(result).toEqual({
            projectUuid: PREVIEW_UUID,
            isPreview: true,
        });
    });

    it.each([undefined, MAIN_UUID])(
        'uses an explicit --project UUID ahead of the environment (%s) and active preview',
        async (envProject) => {
            vi.stubEnv('LIGHTDASH_PROJECT', envProject);
            const config: Config = {
                context: {
                    project: MAIN_UUID,
                    previewProject: PREVIEW_UUID,
                },
            } as Config;
            const explicitUuid = '00000000-0000-0000-0000-000000000003';

            const selection = await selectProject(config, explicitUuid);

            expect(selection).toEqual({
                projectUuid: explicitUuid,
                isPreview: false,
            });
            expect(mockLightdashApi).not.toHaveBeenCalled();
        },
    );

    it.each(['flag', 'env'])(
        'resolves a project slug from the %s through the org projects list',
        async (source) => {
            if (source === 'env')
                vi.stubEnv('LIGHTDASH_PROJECT', 'jaffle-shop');
            const config: Config = {
                context: { project: MAIN_UUID },
            } as Config;
            mockLightdashApi.mockResolvedValueOnce([
                { projectUuid: PREVIEW_UUID, slug: 'other', name: 'Other' },
                { projectUuid: MAIN_UUID, slug: 'jaffle-shop', name: 'Jaffle' },
            ] as never);

            const selection = await selectProject(
                config,
                source === 'flag' ? 'jaffle-shop' : undefined,
            );

            expect(selection).toEqual({
                projectUuid: MAIN_UUID,
                isPreview: false,
            });
        },
    );

    it.each([undefined, ''])(
        'keeps the active preview default without an environment override (%s)',
        async (envProject) => {
            vi.stubEnv('LIGHTDASH_PROJECT', envProject);
            vi.spyOn(GlobalState, 'isNonInteractive').mockReturnValue(true);
            mockPreviewProjectResponse(PREVIEW_UUID);

            expect(
                await selectProject({
                    context: {
                        project: MAIN_UUID,
                        previewProject: PREVIEW_UUID,
                    },
                }),
            ).toEqual({ projectUuid: PREVIEW_UUID, isPreview: true });
            expect(inquirer.prompt).not.toHaveBeenCalled();
        },
    );

    it('returns the main project when only the main project is configured', async () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        const result = await selectProject(config);

        expect(result).toEqual({
            projectUuid: MAIN_UUID,
            isPreview: false,
        });
        expect(mockLightdashApi).not.toHaveBeenCalled();
    });
});

describe('logSelectedProject', () => {
    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    const getLoggedMessage = (): string =>
        consoleErrorSpy.mock.calls.map((call) => String(call[0])).join('\n');

    it('shows the config project name when the selected UUID matches the config project', () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        logSelectedProject(
            { projectUuid: MAIN_UUID, isPreview: false },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to project:');
        expect(output).toContain('"main"');
    });

    it('shows the UUID (not the config project name) when --project overrides to a different project', () => {
        const OVERRIDE_UUID = '00000000-0000-0000-0000-000000000099';
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        logSelectedProject(
            { projectUuid: OVERRIDE_UUID, isPreview: false },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to project:');
        expect(output).toContain(OVERRIDE_UUID);
        expect(output).not.toContain('"main"');
    });

    it('shows the preview name when selection is a preview', () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
                previewProject: PREVIEW_UUID,
                previewName: 'my-preview',
            },
        };

        logSelectedProject(
            { projectUuid: PREVIEW_UUID, isPreview: true },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to preview project:');
        expect(output).toContain('"my-preview"');
    });
});
