import { discoverFieldsResultSchema } from '@lightdash/common';
import { tool } from 'ai';

export const getSubmitDiscoverFieldsResult = () =>
    tool({
        description:
            'Submit the final discovery handoff. Call this as your LAST step after deciding the explore + fields (or that the query is ambiguous / has no match). The arguments are returned to the parent agent verbatim.',
        inputSchema: discoverFieldsResultSchema,
        execute: async (input) => input,
    });
