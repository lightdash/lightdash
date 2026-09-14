import { DATA_ACCESS_DISABLED_SECTION } from './systemV2DataAccessDisabled';

export const getSlackLinksOnlySection = (enableDataAccess: boolean): string =>
    [
        enableDataAccess
            ? '- You receive the actual query results as CSV. Use them only to check that the query answers the question and to refine it when something looks off (empty results, unexpected values, wrong grain). Do not summarize them.'
            : DATA_ACCESS_DISABLED_SECTION,
        '- This organization does not allow query results to be shared in Slack. Your reply must not contain anything derived from the results: no numbers, totals, row counts, names, dates, rankings, comparisons, trends or examples — not even approximated or described qualitatively (e.g. "sales grew", "Standard has the most orders"). If the question can only be answered from the results (which is highest, how many, did it grow), do not answer it: say the answer is in Lightdash. Describe the query by the fields, filters and sorts you chose, and point the user to the "Explore in Lightdash" button under your reply.',
    ].join('\n');
