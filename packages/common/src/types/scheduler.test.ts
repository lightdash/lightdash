import {
    MAX_CAPTURE_LABEL_CHARS,
    MAX_DELIVERY_QUERIES,
} from '../ee/apps/deliveryCapture';
import {
    getSchedulerUuid,
    getSourceSchedulerUuid,
    isValidAppQuerySelections,
    type AppQuerySelection,
    type CreateSchedulerAndTargets,
    type Scheduler,
} from './scheduler';

describe('getSourceSchedulerUuid', () => {
    it('returns the transient uuid from a send-now payload', () => {
        const payload = {
            name: 'delivery',
            targets: [],
            sourceSchedulerUuid: 'source-uuid',
        } as unknown as CreateSchedulerAndTargets;

        expect(getSourceSchedulerUuid(payload)).toBe('source-uuid');
    });

    it('returns undefined when the payload has no source scheduler', () => {
        const payload = {
            name: 'delivery',
            targets: [],
        } as unknown as CreateSchedulerAndTargets;

        expect(getSourceSchedulerUuid(payload)).toBeUndefined();
    });

    it('returns undefined for saved scheduler payloads', () => {
        const saved = {
            schedulerUuid: 'saved-uuid',
            name: 'delivery',
        } as unknown as Scheduler;

        expect(getSourceSchedulerUuid(saved)).toBeUndefined();
    });
});

describe('getSchedulerUuid', () => {
    it('does not fall back to the transient source uuid', () => {
        const payload = {
            name: 'delivery',
            targets: [],
            sourceSchedulerUuid: 'source-uuid',
        } as unknown as CreateSchedulerAndTargets;

        expect(getSchedulerUuid(payload)).toBeUndefined();
    });
});

describe('isValidAppQuerySelections', () => {
    const validEntry: AppQuerySelection = {
        captureKey: 'v1:abc123',
        label: 'Revenue by month',
        exploreName: 'orders',
        excluded: false,
    };

    it('accepts null (no curation)', () => {
        expect(isValidAppQuerySelections(null)).toBe(true);
    });

    it('accepts an array of valid entries, including a null exploreName', () => {
        const entries: AppQuerySelection[] = [
            validEntry,
            { ...validEntry, exploreName: null, excluded: true },
        ];
        expect(isValidAppQuerySelections(entries)).toBe(true);
    });

    it('accepts an empty array (shape-valid; emptiness is a service-level concern)', () => {
        expect(isValidAppQuerySelections([])).toBe(true);
    });

    it('rejects undefined', () => {
        expect(isValidAppQuerySelections(undefined)).toBe(false);
    });

    it('rejects non-array, non-null values', () => {
        expect(isValidAppQuerySelections('none')).toBe(false);
        expect(isValidAppQuerySelections(42)).toBe(false);
        expect(isValidAppQuerySelections({})).toBe(false);
    });

    it('rejects an entry missing captureKey', () => {
        const { captureKey, ...rest } = validEntry;
        expect(isValidAppQuerySelections([rest])).toBe(false);
    });

    it('rejects an entry with an empty captureKey', () => {
        expect(
            isValidAppQuerySelections([{ ...validEntry, captureKey: '' }]),
        ).toBe(false);
    });

    it('rejects an entry with a non-string label', () => {
        expect(isValidAppQuerySelections([{ ...validEntry, label: 42 }])).toBe(
            false,
        );
    });

    it('rejects an entry with a non-nullable exploreName type', () => {
        expect(
            isValidAppQuerySelections([{ ...validEntry, exploreName: 42 }]),
        ).toBe(false);
    });

    it('rejects an entry with a non-boolean excluded flag', () => {
        expect(
            isValidAppQuerySelections([{ ...validEntry, excluded: 'true' }]),
        ).toBe(false);
    });

    it('rejects a malformed entry mixed in with valid ones', () => {
        expect(isValidAppQuerySelections([validEntry, { foo: 'bar' }])).toBe(
            false,
        );
    });

    it('rejects array entries that are themselves arrays', () => {
        expect(isValidAppQuerySelections([[]])).toBe(false);
    });

    // Consistent with parseCapturedQuery in deliveryCapture.ts, which
    // likewise destructures only its known fields and never rejects extras.
    it('tolerates unknown extra properties on an entry (parity with parseDeliveryCaptureManifest)', () => {
        expect(
            isValidAppQuerySelections([{ ...validEntry, unexpected: 'extra' }]),
        ).toBe(true);
    });

    describe('size bounds', () => {
        it('accepts exactly MAX_DELIVERY_QUERIES entries', () => {
            const entries: AppQuerySelection[] = Array.from(
                { length: MAX_DELIVERY_QUERIES },
                (_, i) => ({ ...validEntry, captureKey: `v1:key${i}` }),
            );
            expect(isValidAppQuerySelections(entries)).toBe(true);
        });

        it('rejects more than MAX_DELIVERY_QUERIES entries', () => {
            const entries: AppQuerySelection[] = Array.from(
                { length: MAX_DELIVERY_QUERIES + 1 },
                (_, i) => ({ ...validEntry, captureKey: `v1:key${i}` }),
            );
            expect(isValidAppQuerySelections(entries)).toBe(false);
        });

        it('accepts a label exactly MAX_CAPTURE_LABEL_CHARS long', () => {
            const label = 'a'.repeat(MAX_CAPTURE_LABEL_CHARS);
            expect(isValidAppQuerySelections([{ ...validEntry, label }])).toBe(
                true,
            );
        });

        it('rejects a label longer than MAX_CAPTURE_LABEL_CHARS', () => {
            const label = 'a'.repeat(MAX_CAPTURE_LABEL_CHARS + 1);
            expect(isValidAppQuerySelections([{ ...validEntry, label }])).toBe(
                false,
            );
        });

        it('accepts a captureKey exactly MAX_CAPTURE_LABEL_CHARS long', () => {
            const captureKey = 'v1:'.padEnd(MAX_CAPTURE_LABEL_CHARS, 'a');
            expect(
                isValidAppQuerySelections([{ ...validEntry, captureKey }]),
            ).toBe(true);
        });

        it('rejects a captureKey longer than MAX_CAPTURE_LABEL_CHARS', () => {
            const captureKey = 'v1:'.padEnd(MAX_CAPTURE_LABEL_CHARS + 1, 'a');
            expect(
                isValidAppQuerySelections([{ ...validEntry, captureKey }]),
            ).toBe(false);
        });

        it('accepts an exploreName exactly MAX_CAPTURE_LABEL_CHARS long', () => {
            const exploreName = 'a'.repeat(MAX_CAPTURE_LABEL_CHARS);
            expect(
                isValidAppQuerySelections([{ ...validEntry, exploreName }]),
            ).toBe(true);
        });

        it('rejects an exploreName longer than MAX_CAPTURE_LABEL_CHARS', () => {
            const exploreName = 'a'.repeat(MAX_CAPTURE_LABEL_CHARS + 1);
            expect(
                isValidAppQuerySelections([{ ...validEntry, exploreName }]),
            ).toBe(false);
        });
    });
});
