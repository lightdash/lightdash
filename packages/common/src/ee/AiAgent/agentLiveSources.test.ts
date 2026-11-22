import { ExploreType } from '../../types/explore';
import {
    isExploreAvailableToAgentLiveSources,
    isLiveSourceAvailableToAgent,
} from './agentLiveSources';

const liveExplore = (connectionUuid: string) => ({
    type: ExploreType.API_SOURCE,
    apiSource: { connectionUuid },
});

describe('isLiveSourceAvailableToAgent', () => {
    it('allows every integration when the agent has no setting', () => {
        expect(isLiveSourceAvailableToAgent(null, 'ga4')).toBe(true);
    });

    it('allows no integration when the agent has none', () => {
        expect(isLiveSourceAvailableToAgent([], 'ga4')).toBe(false);
    });

    it('allows only the chosen integrations', () => {
        expect(isLiveSourceAvailableToAgent(['ga4'], 'ga4')).toBe(true);
        expect(isLiveSourceAvailableToAgent(['ga4'], 'hubspot')).toBe(false);
    });
});

describe('isExploreAvailableToAgentLiveSources', () => {
    it('never hides a dbt explore', () => {
        expect(
            isExploreAvailableToAgentLiveSources(
                { type: ExploreType.DEFAULT },
                [],
            ),
        ).toBe(true);
    });

    it('hides an integration explore the agent cannot use', () => {
        expect(
            isExploreAvailableToAgentLiveSources(liveExplore('hubspot'), [
                'ga4',
            ]),
        ).toBe(false);
        expect(
            isExploreAvailableToAgentLiveSources(liveExplore('ga4'), ['ga4']),
        ).toBe(true);
    });

    it('shows every integration explore under "All"', () => {
        expect(
            isExploreAvailableToAgentLiveSources(liveExplore('hubspot'), null),
        ).toBe(true);
    });
});
