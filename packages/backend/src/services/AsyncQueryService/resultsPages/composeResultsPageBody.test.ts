import { getMomentDateWithCustomStartOfWeek, WeekDay } from '@lightdash/common';
import moment from 'moment';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import { composeResultsPageBody } from './composeResultsPageBody';
import {
    buildResultsPageEnvelope,
    formatCases,
    formatInline,
    resultsPageLines,
    todaysResponseBytes,
} from './resultsPageFixtures.mock';

describe('composed results page body', () => {
    test.each(formatCases)(
        'is byte for byte the body res.json sends today for %s',
        (_name, format) => {
            const envelope = buildResultsPageEnvelope(
                resultsPageLines.length,
                format.timezone,
            );
            const rows = Buffer.from(
                buildResultsPageRowsJson(resultsPageLines, format),
            );

            const body = composeResultsPageBody(rows, envelope);

            expect(
                body.equals(
                    todaysResponseBytes(
                        formatInline(resultsPageLines, format),
                        envelope,
                    ),
                ),
            ).toBe(true);
        },
    );

    test('keeps U+2028 and U+2029 as raw characters, like JSON.stringify', () => {
        const [, format] = formatCases[0];
        const rows = buildResultsPageRowsJson(resultsPageLines, format);

        expect(rows).toContain('\u2028');
        expect(rows).toContain('\u2029');
        expect(rows).toBe(
            JSON.stringify(formatInline(resultsPageLines, format)),
        );
    });

    test('composes an empty page', () => {
        const envelope = buildResultsPageEnvelope(0, null);

        expect(
            composeResultsPageBody(Buffer.from('[]'), envelope).equals(
                todaysResponseBytes([], envelope),
            ),
        ).toBe(true);
    });

    test('does not depend on the global moment locale a week start sets', () => {
        const [, format] = formatCases[2];
        const before = buildResultsPageRowsJson(resultsPageLines, format);
        const globalLocale = () =>
            getMomentDateWithCustomStartOfWeek(null).locale();
        const previousLocale = globalLocale();
        try {
            getMomentDateWithCustomStartOfWeek(WeekDay.WEDNESDAY);

            expect(globalLocale()).toBe('lightdash-start-of-week-2');
            expect(buildResultsPageRowsJson(resultsPageLines, format)).toBe(
                before,
            );
        } finally {
            moment.locale(previousLocale);
        }
        expect(globalLocale()).toBe(previousLocale);
    });
});
