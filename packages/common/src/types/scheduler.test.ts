import {
    getSchedulerUuid,
    getSourceSchedulerUuid,
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
