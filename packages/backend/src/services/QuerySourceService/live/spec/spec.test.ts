import { ApiConnectorType } from '@lightdash/common';
import { getLiveIntegration } from '../registry';
import { getLiveAuthScore } from './auth';
import { crossToolUseCases } from './crossToolUseCases';

const INTEGRATIONS = Object.values(ApiConnectorType).map(getLiveIntegration);

describe('live integration specs', () => {
    test('use case ids are unique', () => {
        const ids = [
            ...INTEGRATIONS.map(({ useCases }) => useCases),
            crossToolUseCases,
        ].flatMap(({ questions, dashboards }) => [
            ...questions.map(({ id }) => id),
            ...dashboards.flatMap(({ id, charts }) => [
                id,
                ...charts.map((chart) => chart.id),
            ]),
        ]);
        expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual(
            [],
        );
    });

    test('auth scores', () => {
        expect(
            Object.fromEntries(
                INTEGRATIONS.map((integration) => [
                    integration.connector,
                    getLiveAuthScore(integration),
                ]),
            ),
        ).toMatchInlineSnapshot(`
          {
            "attio": {
              "rating": "easy",
              "score": 7,
            },
            "ga4": {
              "rating": "medium",
              "score": 5,
            },
            "github": {
              "rating": "easy",
              "score": 6,
            },
            "google_ads": {
              "rating": "hard",
              "score": 1,
            },
            "hubspot": {
              "rating": "easy",
              "score": 6,
            },
            "linkedin_ads": {
              "rating": "hard",
              "score": 1,
            },
            "meta_ads": {
              "rating": "medium",
              "score": 3,
            },
            "posthog": {
              "rating": "easy",
              "score": 7,
            },
            "pylon": {
              "rating": "medium",
              "score": 5,
            },
            "salesforce": {
              "rating": "easy",
              "score": 6,
            },
            "search_console": {
              "rating": "medium",
              "score": 3,
            },
            "youtube_analytics": {
              "rating": "medium",
              "score": 3,
            },
          }
        `);
    });
});
