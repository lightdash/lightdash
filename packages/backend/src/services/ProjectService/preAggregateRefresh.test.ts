import {
    ForbiddenError,
    UnexpectedServerError,
    type Explore,
} from '@lightdash/common';
import {
    assertPreAggregateRefresh,
    type StoredPreAggregateRefresh,
} from './preAggregateRefresh';
import { refreshShapes } from './preAggregateRefresh.shapes.mock';

const clean: StoredPreAggregateRefresh = {
    hasScheduledDefinition: false,
    hasScheduledRefresh: false,
    hasMalformedPreAggregates: false,
};
const storedMessage =
    'This agent connection cannot deploy to, refresh or change parameters of this project, because the project has pre-aggregates with a scheduled refresh. A person can do this, or use a project without scheduled pre-aggregate refreshes.';
const incomingMessage =
    'This agent connection cannot add a pre-aggregate with a scheduled refresh. A person can add it.';
const malformedMessage =
    'Explores for this project have an invalid pre-aggregate definition.';

test.each(refreshShapes)(
    'incoming $name',
    ({ fields, scheduled, malformed }) => {
        const run = () =>
            assertPreAggregateRefresh(clean, [fields as unknown as Explore]);
        if (scheduled) {
            expect(run).toThrow(ForbiddenError);
            expect(run).toThrow(incomingMessage);
        } else if (malformed) {
            expect(run).toThrow(UnexpectedServerError);
            expect(run).toThrow(malformedMessage);
        } else expect(run).not.toThrow();
    },
);

test.each([
    { ...clean, hasScheduledDefinition: true },
    { ...clean, hasScheduledRefresh: true },
    { ...clean, hasScheduledRefresh: true, hasMalformedPreAggregates: true },
])('stored schedule takes precedence: %j', (stored) => {
    const run = () =>
        assertPreAggregateRefresh(stored, [
            { preAggregates: [null] } as unknown as Explore,
        ]);
    expect(run).toThrow(ForbiddenError);
    expect(run).toThrow(storedMessage);
});

test('stored malformed takes precedence over incoming schedule', () => {
    const run = () =>
        assertPreAggregateRefresh(
            { ...clean, hasMalformedPreAggregates: true },
            [{ preAggregates: [{ refresh: { cron: '' } }] } as Explore],
        );
    expect(run).toThrow(UnexpectedServerError);
    expect(run).toThrow(malformedMessage);
});

test.each([false, true])(
    'incoming schedule takes precedence in either order: %s',
    (reverse) => {
        const incoming = [
            { preAggregates: [null] },
            { preAggregates: [{ refresh: { cron: {} } }] },
        ];
        if (reverse) incoming.reverse();
        expect(() =>
            assertPreAggregateRefresh(clean, incoming as unknown as Explore[]),
        ).toThrow(incomingMessage);
    },
);
