import { getConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';
import { exportChartImageHandler } from './exportChartImage';

vi.mock('../config', () => ({ getConfig: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('../globalState', () => ({
    default: {
        setVerbose: vi.fn(),
        startSpinner: vi.fn(() => ({ warn: vi.fn() })),
    },
}));

describe('exportChartImageHandler', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('scopes a slug to the selected project', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                project: '22222222-2222-4222-8222-222222222222',
            },
        } as never);

        await exportChartImageHandler('shared-slug', { output: 'chart.png' });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v1/saved/shared-slug/export?projectUuid=22222222-2222-4222-8222-222222222222',
            body: undefined,
        });
    });

    it('does not scope UUID exports to the selected project', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                project: '22222222-2222-4222-8222-222222222222',
            },
        } as never);

        await exportChartImageHandler('11111111-1111-4111-8111-111111111111', {
            output: 'chart.png',
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v1/saved/11111111-1111-4111-8111-111111111111/export',
            body: undefined,
        });
        expect(getConfig).not.toHaveBeenCalled();
    });

    it('rejects a slug without project context', async () => {
        vi.mocked(getConfig).mockResolvedValue({} as never);

        await expect(
            exportChartImageHandler('shared-slug', { output: 'chart.png' }),
        ).rejects.toThrow('A project is required when exporting by slug');
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
