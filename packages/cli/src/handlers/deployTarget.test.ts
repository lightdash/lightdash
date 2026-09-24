import { getDbtContext } from '../dbt/context';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../dbt/profile';
import { CliProjectType } from '../lightdash/projectType';
import { getDeployTarget } from './deploy';

vi.mock('../dbt/context', () => ({
    getDbtContext: vi.fn(),
}));
vi.mock('../dbt/profile', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../dbt/profile')>()),
    loadDbtTarget: vi.fn(),
    warehouseCredentialsFromDbtTarget: vi.fn(),
}));

const options = {
    projectDir: '/tmp/project',
    targetPath: undefined,
    profilesDir: '/tmp/profiles',
    profile: undefined,
    target: undefined,
};

describe('getDeployTarget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getDbtContext).mockResolvedValue({
            profileName: 'jaffle',
        } as never);
        vi.mocked(loadDbtTarget).mockResolvedValue({
            target: { type: 'postgres' },
        } as never);
        vi.mocked(warehouseCredentialsFromDbtTarget).mockResolvedValue({
            type: 'postgres',
            dbname: 'jaffle',
            schema: 'public',
        } as never);
    });

    it.each([['single'], [undefined]] as const)(
        'reads no dbt target for a project whose route is %s',
        async (connectionRoute) => {
            await expect(
                getDeployTarget(options, CliProjectType.Dbt, connectionRoute),
            ).resolves.toBeUndefined();
            expect(loadDbtTarget).not.toHaveBeenCalled();
        },
    );

    it('reads the dbt target database for a project that routes multi', async () => {
        await expect(
            getDeployTarget(options, CliProjectType.Dbt, 'multi'),
        ).resolves.toEqual({ database: 'jaffle' });
    });
});
