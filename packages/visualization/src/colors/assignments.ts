import { ASSIGNMENT_IDX_KEY, type ColorMappings } from './mappings';

/**
 * Which palette colour each group value got, per group (a field, usually):
 * the same value keeps the same colour across the charts of a page. Plain
 * data, so it can be kept, sent and compared; `renderChart` takes the
 * assignments so far and returns them with this chart's added.
 */
export type ColorAssignments = Readonly<
    Record<
        string,
        {
            /** The palette index each value of the group got. */
            readonly byValue: Readonly<Record<string, number>>;
            /** The palette index the group assigned last. */
            readonly last: number;
        }
    >
>;

/** The working map the colour resolver fills, from the assignments so far. */
export const toColorMappings = (
    assignments: ColorAssignments | undefined,
): ColorMappings =>
    new Map(
        Object.entries(assignments ?? {}).map(([group, { byValue, last }]) => [
            group,
            new Map([
                ...Object.entries(byValue),
                [ASSIGNMENT_IDX_KEY, last] as const,
            ]),
        ]),
    );

/** The assignments the working map holds, as plain data. */
export const toColorAssignments = (mappings: ColorMappings): ColorAssignments =>
    Object.fromEntries(
        [...mappings.entries()].map(([group, values]) => [
            group,
            {
                byValue: Object.fromEntries(
                    [...values.entries()].filter(
                        ([value]) => value !== ASSIGNMENT_IDX_KEY,
                    ),
                ),
                last: values.get(ASSIGNMENT_IDX_KEY) ?? -1,
            },
        ]),
    );
