# Hosted Analytics visual QA — October 26, 2026

All 8 dashboards / 32 tabs were opened, scrolled to load every chart, and visually inspected on Okteto at product head `1e670e8d604b3514380415e0b1c08ca35b44188f`. No query errors remained. These screenshots use preview data, not the synthetic local fixture.

The query calendar showed a narrow left-aligned strip with 19 days of history. That is recorded in `okteto-queries-overview.png`. Commit `87b190d474fafcbabea8e94068ae1db6b3ffea71` corrects short-history positioning; its deployed recheck passed after all CI checks completed. Local short and long histories were checked on that commit. Hosted Queries Overview, Monthly comparison and populated token coverage were then rechecked on the same deployed revision.

Some App-load, billable-token and completed-month views have no matching preview data. Their empty states are expected; populated equivalents were separately tested locally. All-usage token charts and the formerly failing Content/field-usage tables are populated here.

- [okteto-adoption-app-outcomes](okteto-adoption-app-outcomes.png)
- [okteto-adoption-ask-ai](okteto-adoption-ask-ai.png)
- [okteto-adoption-data-apps](okteto-adoption-data-apps.png)
- [okteto-adoption-overview](okteto-adoption-overview.png)
- [okteto-agents-adoption](okteto-agents-adoption.png)
- [okteto-agents-outcomes](okteto-agents-outcomes.png)
- [okteto-agents-overview](okteto-agents-overview.png)
- [okteto-agents-retries](okteto-agents-retries.png)
- [okteto-apps-builders](okteto-apps-builders.png)
- [okteto-apps-lifecycle](okteto-apps-lifecycle.png)
- [okteto-apps-overview](okteto-apps-overview.png)
- [okteto-apps-people](okteto-apps-people.png)
- [okteto-content-activity](okteto-content-activity.png)
- [okteto-content-audience](okteto-content-audience.png)
- [okteto-content-creation](okteto-content-creation.png)
- [okteto-content-ownership](okteto-content-ownership.png)
- [okteto-people-channels](okteto-people-channels.png)
- [okteto-people-inactive](okteto-people-inactive.png)
- [okteto-people-overview](okteto-people-overview.png)
- [okteto-queries-latency](okteto-queries-latency.png)
- [okteto-queries-metrics](okteto-queries-metrics.png)
- [okteto-queries-monthly](okteto-queries-monthly.png)
- [okteto-queries-origins](okteto-queries-origins.png)
- [okteto-queries-overview](okteto-queries-overview.png)
- [okteto-tokens-agent](okteto-tokens-agent.png)
- [okteto-tokens-channel](okteto-tokens-channel.png)
- [okteto-tokens-coverage](okteto-tokens-coverage.png)
- [okteto-tokens-feature](okteto-tokens-feature.png)
- [okteto-tokens-project](okteto-tokens-project.png)
- [okteto-tokens-user](okteto-tokens-user.png)
- [okteto-tools-exports](okteto-tools-exports.png)
- [okteto-tools-overview](okteto-tools-overview.png)

## Final revision follow-up

All checks on `87b190d474` passed: 37 successful, 8 skipped, no retries. This follow-up changes calendar positioning only; the full 32-tab hosted pass above remains attributed to `1e670e8d60`.

- [okteto-queries-overview-final.png](okteto-queries-overview-final.png)
- [okteto-queries-monthly-final.png](okteto-queries-monthly-final.png)
- [okteto-tokens-coverage-final.png](okteto-tokens-coverage-final.png)
