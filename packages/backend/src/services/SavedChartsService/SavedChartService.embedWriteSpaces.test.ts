import { type Account, type CreateSavedChart } from '@lightdash/common';
import { SavedChartService } from './SavedChartService';

const writeActor = { userUuid: 'write-actor-uuid' };

const buildEmbedAccount = (writeSpaceUuids: string[]) =>
    ({
        isJwtUser: () => true,
        embedWriteUser: writeActor,
        authentication: {
            type: 'jwt',
            data: {
                content: { type: 'dashboard' },
                writeActions: {
                    userUuid: writeActor.userUuid,
                    writeSpaceUuids,
                },
            },
        },
    }) as unknown as Account;

const getCreateSavedChartContext = (
    SavedChartService as unknown as {
        getCreateSavedChartContext: (
            account: Account,
            savedChart: CreateSavedChart,
        ) => { savedChart: CreateSavedChart };
    }
).getCreateSavedChartContext.bind(SavedChartService);

const chart = (spaceUuid: string | undefined) =>
    ({ name: 'chart', spaceUuid }) as unknown as CreateSavedChart;

describe('SavedChartService embed write spaces', () => {
    const account = buildEmbedAccount(['default-space', 'second-space']);

    test('saves into the requested write space', () => {
        expect(
            getCreateSavedChartContext(account, chart('second-space'))
                .savedChart.spaceUuid,
        ).toBe('second-space');
    });

    test.each([
        ['a space outside the write spaces', 'other-space'],
        ['no space', undefined],
    ])('falls back to the default write space for %s', (_label, spaceUuid) => {
        expect(
            getCreateSavedChartContext(account, chart(spaceUuid)).savedChart
                .spaceUuid,
        ).toBe('default-space');
    });
});
