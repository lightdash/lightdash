import { MergeQueryErrorKind, type MergeQueryError } from '@lightdash/common';
import { render } from '@testing-library/react';
import { MergeAutoRun } from './MergeAutoRun';

type FanOut = { sourceId: string; fields: string[] };

const state = vi.hoisted(() => ({
    merge: {
        wasRestored: true,
        isRunning: false,
        mergeResults: null as { queryUuid: string } | null,
        refuseRestoredRun: vi.fn(),
    },
    setup: {
        canRun: true,
        handleRun: vi.fn(),
        mergeQuery: { sources: [] } as { sources: unknown[] } | null,
        setupStep: null as string | null,
        joinKeyErrors: [] as MergeQueryError[],
        fanOut: [] as FanOut[],
    },
}));

vi.mock('../context/useMerge', () => ({
    useMergeSafe: () => state.merge,
}));

vi.mock('../hooks/useMergeSetup', () => ({
    useMergeSetup: () => state.setup,
}));

const fanOut: FanOut[] = [
    { sourceId: 'b', fields: ['payments_payment_method'] },
];

describe('MergeAutoRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.merge.wasRestored = true;
        state.merge.isRunning = false;
        state.merge.mergeResults = null;
        state.setup.canRun = true;
        state.setup.mergeQuery = { sources: [] };
        state.setup.setupStep = null;
        state.setup.joinKeyErrors = [];
        state.setup.fanOut = [];
    });

    it('runs a restored merge that passes the rules', () => {
        render(<MergeAutoRun />);

        expect(state.setup.handleRun).toHaveBeenCalledTimes(1);
        expect(state.merge.refuseRestoredRun).not.toHaveBeenCalled();
    });

    it('refuses a restored merge that fans out instead of running it', () => {
        state.setup.canRun = false;
        state.setup.fanOut = fanOut;

        render(<MergeAutoRun />);

        expect(state.merge.refuseRestoredRun).toHaveBeenCalledTimes(1);
        expect(state.setup.handleRun).not.toHaveBeenCalled();
    });

    it('refuses a restored merge whose join key types do not match', () => {
        state.setup.canRun = false;
        state.setup.joinKeyErrors = [
            {
                kind: MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH,
                sourceId: null,
                fieldIds: ['orders_status', 'payments_amount'],
                message: 'Those hold different kinds of value.',
            },
        ];

        render(<MergeAutoRun />);

        expect(state.merge.refuseRestoredRun).toHaveBeenCalledTimes(1);
        expect(state.setup.handleRun).not.toHaveBeenCalled();
    });

    it('keeps waiting while the restored merge is still hydrating', () => {
        state.setup.canRun = false;
        state.setup.setupStep = 'Pick a field from each query to join on';
        state.setup.fanOut = fanOut;

        render(<MergeAutoRun />);

        expect(state.merge.refuseRestoredRun).not.toHaveBeenCalled();
        expect(state.setup.handleRun).not.toHaveBeenCalled();
    });

    it('leaves a merge built here alone', () => {
        state.merge.wasRestored = false;
        state.setup.canRun = false;
        state.setup.fanOut = fanOut;

        render(<MergeAutoRun />);

        expect(state.merge.refuseRestoredRun).not.toHaveBeenCalled();
        expect(state.setup.handleRun).not.toHaveBeenCalled();
    });
});
