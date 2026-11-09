import { LIVE_SOURCE_INTEGRATION_PROFILES } from '@lightdash/common';
import type { AgentLiveSource } from '../types/aiAgent';
import { xmlBuilder } from '../xmlBuilder';

export const getLiveSourcesSection = (
    liveSources: AgentLiveSource[],
): string => {
    if (liveSources.length === 0) {
        return '';
    }
    return [
        '## Live data sources',
        '',
        "- A live data source's explore reads its integration live, one request per query. Query it like any other explore: by its fields, with a date filter for the period asked about.",
        '- It answers metrics broken down by dimensions. Funnels, retention and user paths are not available on live data sources yet: say so plainly, and never approximate them from event counts.',
        "- Its explore has only the fields in use, and those are the only fields you can see or query. When a question needs a field the explore lacks, say so and that an admin can add fields from the source's Fields page in project settings. Never guess at fields beyond the explore.",
        '',
        xmlBuilder(
            'live_data_sources',
            null,
            ...liveSources.map(({ name, connector }) =>
                xmlBuilder('live_data_source', {
                    name,
                    integration:
                        LIVE_SOURCE_INTEGRATION_PROFILES[connector].agentLabel,
                }),
            ),
        ).toString(),
    ].join('\n');
};
