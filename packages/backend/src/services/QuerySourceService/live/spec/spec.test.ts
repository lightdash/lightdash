import { ApiConnectorType } from '@lightdash/common';
import { crossToolSpec, getLiveAuthScore, LIVE_SPECS } from '.';

describe('live integration specs', () => {
    test('question and chart ids are unique', () => {
        const ids = [...Object.values(LIVE_SPECS), crossToolSpec].flatMap(
            ({ questions, dashboards }) => [
                ...questions.map(({ id }) => id),
                ...dashboards.flatMap(({ id, charts }) => [
                    id,
                    ...charts.map((chart) => chart.id),
                ]),
            ],
        );
        expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual(
            [],
        );
    });

    test('auth scores follow from the spec and how each integration signs in', () => {
        expect(
            Object.fromEntries(
                Object.values(ApiConnectorType).map((connector) => [
                    connector,
                    getLiveAuthScore(connector),
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
