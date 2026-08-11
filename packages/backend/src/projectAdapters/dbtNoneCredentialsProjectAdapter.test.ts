import {
    DEFAULT_SPOTLIGHT_CONFIG,
    type WarehouseClient,
} from '@lightdash/common';
import { DbtNoneCredentialsProjectAdapter } from './dbtNoneCredentialsProjectAdapter';

const mockProjectAdapter = new DbtNoneCredentialsProjectAdapter({
    warehouseClient: vi.fn() as unknown as WarehouseClient,
});

describe('getLightdashProjectConfig', () => {
    it('should return the default lightdash project config', async () => {
        const config = await mockProjectAdapter.getLightdashProjectConfig();
        expect(config).toEqual({
            spotlight: DEFAULT_SPOTLIGHT_CONFIG,
        });
    });
});

describe('getProjectContext', () => {
    it('should return null: the file is unavailable, never an explicit clear', async () => {
        const context = await mockProjectAdapter.getProjectContext();
        expect(context).toBeNull();
    });
});
