import { testHelpers } from './preAggregateAudit';

jest.mock('./dbt/apiClient', () => ({
    lightdashApi: jest.fn(),
    checkLightdashVersion: jest.fn(),
}));

const { renderSingle, exitIfFailOnMiss } = testHelpers;

type MockAudit = Parameters<typeof renderSingle>[0];

const makeAudit = (partial: Partial<MockAudit> = {}): MockAudit => ({
    dashboardUuid: 'd-1',
    dashboardSlug: 'd1',
    dashboardName: 'D1',
    tabs: [{ tabUuid: null, tabName: null, tiles: [] }],
    summary: { hitCount: 0, missCount: 0, ineligibleCount: 0 },
    ...partial,
});

describe('renderSingle JSON mode', () => {
    it('prints DashboardPreAggregateAudit as JSON', () => {
        const audit = makeAudit({
            summary: { hitCount: 2, missCount: 1, ineligibleCount: 0 },
        });
        const spy = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        renderSingle(audit, { json: true, verbose: false });
        expect(spy).toHaveBeenCalledWith(`${JSON.stringify(audit, null, 2)}\n`);
        spy.mockRestore();
    });
});

describe('exitIfFailOnMiss', () => {
    it('does nothing if flag unset', () => {
        const spy = jest
            .spyOn(process, 'exit')
            .mockImplementation(() => undefined as never);
        exitIfFailOnMiss(
            [
                makeAudit({
                    summary: { hitCount: 0, missCount: 5, ineligibleCount: 0 },
                }),
            ],
            false,
        );
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
    it('exits 1 when flag set and any miss present', () => {
        const spy = jest
            .spyOn(process, 'exit')
            .mockImplementation(() => undefined as never);
        exitIfFailOnMiss(
            [
                makeAudit({
                    summary: { hitCount: 1, missCount: 2, ineligibleCount: 0 },
                }),
            ],
            true,
        );
        expect(spy).toHaveBeenCalledWith(1);
        spy.mockRestore();
    });
    it('does not exit when flag set and no misses', () => {
        const spy = jest
            .spyOn(process, 'exit')
            .mockImplementation(() => undefined as never);
        exitIfFailOnMiss(
            [
                makeAudit({
                    summary: { hitCount: 3, missCount: 0, ineligibleCount: 2 },
                }),
            ],
            true,
        );
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
