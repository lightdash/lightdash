import { SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import { dbtList, type DbtCompileOptions } from './compile';
import { DBT1060_META_HINT } from './fusionMeta';

vi.mock('execa');
vi.mock('./getDbtVersion', () => ({
    getDbtVersion: vi.fn().mockResolvedValue({
        versionOption: SupportedDbtVersions.V1_10,
    }),
}));

const options = {} as DbtCompileOptions;

describe('dbtList errors', () => {
    it('puts the config meta hint first for a dbt1060 meta error', async () => {
        vi.mocked(execa).mockRejectedValueOnce(
            new Error(
                '[error] [UnusedConfigKey (dbt1060)]: While parsing config: Ignored unexpected key `"meta"`.',
            ),
        );
        const error = await dbtList(options).catch((e: Error) => e);
        expect((error as Error).message.startsWith(DBT1060_META_HINT)).toBe(
            true,
        );
        expect((error as Error).message).not.toContain('--use-dbt-list');
    });

    it('keeps the dbt list advice for other errors', async () => {
        vi.mocked(execa).mockRejectedValueOnce(new Error('boom'));
        const error = await dbtList(options).catch((e: Error) => e);
        expect((error as Error).message).toContain('--use-dbt-list=false');
        expect((error as Error).message).not.toContain(DBT1060_META_HINT);
    });
});
