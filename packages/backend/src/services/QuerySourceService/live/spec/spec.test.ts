import {
    crossToolUseCases,
    getLiveAuthScore,
    LIVE_SPECS,
    LIVE_USE_CASES,
} from '.';

describe('live integration specs', () => {
    test('use case ids are unique', () => {
        const ids = [
            ...Object.values(LIVE_USE_CASES),
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
                Object.entries(LIVE_SPECS).map(([connector, spec]) => [
                    connector,
                    getLiveAuthScore(spec),
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
