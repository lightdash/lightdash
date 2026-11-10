import {
    ComposerChartNotSupportedError,
    NotComposerChartError,
    type SavedChartWithAccessVariant,
} from '@lightdash/common';
import type express from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { ProjectSavedChartControllerV2 } from './ProjectSavedChartController';

const classicVariant = {
    queryType: 'semantic',
    chart: { uuid: 'classic-uuid', tableName: 'orders' },
} as SavedChartWithAccessVariant;
const composerVariant = {
    queryType: 'composer',
    chart: { uuid: 'composer-uuid', pipeline: {} },
} as SavedChartWithAccessVariant;

describe('ProjectSavedChartControllerV2', () => {
    const get = vi.fn();
    const getComposer = vi.fn();
    const getForViewer = vi.fn();
    const controller = new ProjectSavedChartControllerV2({
        getSavedChartService: () => ({ get, getComposer, getForViewer }),
    } as unknown as ConstructorParameters<
        typeof ProjectSavedChartControllerV2
    >[0]);
    const req = { account: buildAccount() } as express.Request;

    beforeEach(() => {
        get.mockReset();
        getComposer.mockReset();
        getForViewer.mockReset();
    });

    it('serves a classic chart and passes the project scope on', async () => {
        get.mockResolvedValue(classicVariant.chart);
        await expect(
            controller.get('project', 'orders-by-status', req),
        ).resolves.toEqual({ status: 'ok', results: classicVariant.chart });
        expect(get).toHaveBeenCalledWith('orders-by-status', req.account, {
            projectUuid: 'project',
        });
    });

    it('refuses a composer chart on the classic route by name', async () => {
        get.mockRejectedValue(
            new ComposerChartNotSupportedError('composer-uuid'),
        );
        await expect(
            controller.get('project', 'composer-uuid', req),
        ).rejects.toBeInstanceOf(ComposerChartNotSupportedError);
    });

    it('refuses a composer chart on the classic draft route by name', async () => {
        getForViewer.mockResolvedValue(composerVariant);
        await expect(
            controller.get('project', 'composer-uuid', req, true),
        ).rejects.toBeInstanceOf(ComposerChartNotSupportedError);
        expect(get).not.toHaveBeenCalled();
    });

    it('serves a composer chart on the composer route', async () => {
        getComposer.mockResolvedValue(composerVariant.chart);
        await expect(
            controller.getComposer('project', 'composer-uuid', req),
        ).resolves.toEqual({ status: 'ok', results: composerVariant.chart });
        expect(getComposer).toHaveBeenCalledWith('composer-uuid', req.account, {
            projectUuid: 'project',
        });
    });

    it('refuses a classic chart on the composer route by name', async () => {
        getComposer.mockRejectedValue(
            new NotComposerChartError('classic-uuid'),
        );
        await expect(
            controller.getComposer('project', 'classic-uuid', req),
        ).rejects.toBeInstanceOf(NotComposerChartError);
    });
});
