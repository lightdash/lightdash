import { type DataAppVizSchema } from '@lightdash/common';
import { type AppModel } from '../../../models/AppModel';
import { resolveDataAppVizRenderMetadata } from './dataAppVizRender';

const APP_UUID = 'data-app-viz-1';

const vizSchema: DataAppVizSchema = {
    fields: [],
    configOptions: [],
    colorPalette: null,
};

const makeVersion = (overrides: Record<string, unknown> = {}) => ({
    app_id: APP_UUID,
    version: 3,
    status: 'ready',
    viz_schema: vizSchema,
    ...overrides,
});

const makeAppModel = (
    latestVersion: unknown,
    latestRenderableVersion: unknown,
) =>
    ({
        getLatestVersion: vi.fn().mockResolvedValue(latestVersion),
        getLatestRenderableDataAppVizVersion: vi
            .fn()
            .mockResolvedValue(latestRenderableVersion),
    }) as unknown as AppModel;

describe('resolveDataAppVizRenderMetadata', () => {
    it('reports ready when the version bundle is still in storage', async () => {
        const isBundleServable = vi.fn().mockResolvedValue(true);

        await expect(
            resolveDataAppVizRenderMetadata(
                makeAppModel(makeVersion(), makeVersion()),
                APP_UUID,
                isBundleServable,
            ),
        ).resolves.toEqual({
            state: 'ready',
            version: 3,
            schema: vizSchema,
            latestBuildInProgress: false,
        });
        expect(isBundleServable).toHaveBeenCalledWith(APP_UUID, 3);
    });

    // Distinct from `failed`: the build succeeded, the artifact went missing.
    it('reports unavailable when the version is ready but its bundle is gone', async () => {
        await expect(
            resolveDataAppVizRenderMetadata(
                makeAppModel(makeVersion(), makeVersion()),
                APP_UUID,
                vi.fn().mockResolvedValue(false),
            ),
        ).resolves.toEqual({
            state: 'unavailable',
            latestBuildInProgress: false,
        });
    });

    it('reports building when the bundle is gone and a newer build is running', async () => {
        await expect(
            resolveDataAppVizRenderMetadata(
                makeAppModel(
                    makeVersion({ version: 4, status: 'generating' }),
                    makeVersion(),
                ),
                APP_UUID,
                vi.fn().mockResolvedValue(false),
            ),
        ).resolves.toEqual({
            state: 'building',
            latestBuildInProgress: true,
        });
    });

    it('skips the storage check when no version is renderable', async () => {
        const isBundleServable = vi.fn();

        await expect(
            resolveDataAppVizRenderMetadata(
                makeAppModel(makeVersion({ status: 'error' }), null),
                APP_UUID,
                isBundleServable,
            ),
        ).resolves.toEqual({
            state: 'failed',
            latestBuildInProgress: false,
        });
        expect(isBundleServable).not.toHaveBeenCalled();
    });

    it('skips the storage check when the renderable version has no schema', async () => {
        const isBundleServable = vi.fn();

        await expect(
            resolveDataAppVizRenderMetadata(
                makeAppModel(makeVersion(), makeVersion({ viz_schema: null })),
                APP_UUID,
                isBundleServable,
            ),
        ).resolves.toMatchObject({ state: 'failed' });
        expect(isBundleServable).not.toHaveBeenCalled();
    });
});
