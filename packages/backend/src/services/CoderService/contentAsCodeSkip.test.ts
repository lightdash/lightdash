import {
    getInstanceAheadSkipWarning,
    shouldSkipInstanceAheadUpload,
} from './contentAsCodeSkip';

const lastApplied = 'last-applied-hash';
const incoming = 'incoming-hash';
const instance = 'instance-hash';

describe('shouldSkipInstanceAheadUpload', () => {
    it('applies when there is no last-applied marker', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: undefined,
                incomingHash: incoming,
                instanceHash: instance,
            }),
        ).toBe(false);
    });

    it('applies when the instance document is missing', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: lastApplied,
                incomingHash: incoming,
                instanceHash: undefined,
            }),
        ).toBe(false);
    });

    it('uses the existing no-changes path when instance matches incoming', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: lastApplied,
                incomingHash: instance,
                instanceHash: instance,
            }),
        ).toBe(false);
    });

    it('applies git when the instance matches last-applied and incoming differs', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: lastApplied,
                incomingHash: incoming,
                instanceHash: lastApplied,
            }),
        ).toBe(false);
    });

    it('skips when the instance is ahead and incoming also differs', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: lastApplied,
                incomingHash: incoming,
                instanceHash: instance,
            }),
        ).toBe(true);
    });

    it('skips when the instance drifted and git still matches last-applied', () => {
        expect(
            shouldSkipInstanceAheadUpload({
                lastAppliedHash: lastApplied,
                incomingHash: lastApplied,
                instanceHash: instance,
            }),
        ).toBe(true);
    });
});

describe('getInstanceAheadSkipWarning', () => {
    it('names the skipped slug and tells the operator about --force', () => {
        expect(getInstanceAheadSkipWarning('chart', 'orders')).toContain(
            'chart "orders"',
        );
        expect(getInstanceAheadSkipWarning('dashboard', 'overview')).toContain(
            '--force',
        );
    });
});
