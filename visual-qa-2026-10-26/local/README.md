# Local rendered dashboard QA

Source head: `1e670e8d604b3514380415e0b1c08ca35b44188f`. All 8 dashboards / 32 tabs visually inspected using the synthetic QA fixture. Affected views were rechecked after fixes. Hosted visual QA is pending.

| Dashboard | Tab | Chart tiles | Screenshot |
|---|---|---:|---|
| Agents & AI | Overview | 8 | [View](local-agents-overview.png) |
| Agents & AI | Agent adoption | 1 | [View](local-agents-adoption.png) |
| Agents & AI | Outcomes & feedback | 2 | [View](local-agents-outcomes.png) |
| Agents & AI | Retries & consumption | 3 | [View](local-agents-retries.png) |
| Queries | Overview | 10 | [View](local-queries-overview-final.png) |
| Queries | Monthly comparison | 2 | [View](local-queries-monthly-final.png) |
| Queries | Latency & failures | 2 | [View](local-queries-latency.png) |
| Queries | Origins & caching | 2 | [View](local-queries-origins.png) |
| Queries | Metrics & dimensions | 4 | [View](local-queries-metrics.png) |
| People | Activity | 3 | [View](local-people-overview.png) |
| People | Returning & inactive people | 4 | [View](local-people-inactive.png) |
| People | Channels & history | 2 | [View](local-people-channels.png) |
| Content | Audience & trust | 3 | [View](local-content-audience.png) |
| Content | Creation & adoption | 2 | [View](local-content-creation.png) |
| Content | Activity & dependencies | 1 | [View](local-content-activity.png) |
| Content | Ownership & compute | 2 | [View](local-content-ownership.png) |
| Apps | App usage | 5 | [View](local-apps-overview.png) |
| Apps | People | 2 | [View](local-apps-people.png) |
| Apps | Builders & AI | 2 | [View](local-apps-builders.png) |
| Apps | Lifecycle & adoption | 2 | [View](local-apps-lifecycle-final.png) |
| Tools & operations | MCP tools | 1 | [View](local-tools-overview.png) |
| Tools & operations | Exports | 1 | [View](local-tools-exports.png) |
| Adoption | People & content | 8 | [View](local-adoption-overview.png) |
| Adoption | Data apps | 5 | [View](local-adoption-data-apps.png) |
| Adoption | App outcomes | 2 | [View](local-adoption-app-outcomes.png) |
| Adoption | Ask AI | 5 | [View](local-adoption-ask-ai.png) |
| AI usage · Tokens & billing coverage | Feature | 5 | [View](local-tokens-feature-final.png) |
| AI usage · Tokens & billing coverage | Channel | 5 | [View](local-tokens-channel.png) |
| AI usage · Tokens & billing coverage | User | 5 | [View](local-tokens-user.png) |
| AI usage · Tokens & billing coverage | Project | 5 | [View](local-tokens-project.png) |
| AI usage · Tokens & billing coverage | Agent | 5 | [View](local-tokens-agent.png) |
| AI usage · Tokens & billing coverage | All usage & coverage | 12 | [View](local-tokens-coverage.png) |

## Reproductions and corrections

| Check | Before | After |
|---|---|---|
| All-null token totals | [Blank charts](local-tokens-all-null-before.png) | [Explicit missing totals](local-tokens-all-null-final.png) |
| App labels | [Clipped title](local-apps-lifecycle.png) | [Corrected](local-apps-lifecycle-final.png) |
| Mixed custom/native dashboard | [Redux crash](local-queries-overview.png) | [Corrected](local-queries-overview-final.png) |

[Calendar at 900px](local-queries-narrow-900.png). Unrelated React development warnings remain; no query failure or tile crash remained after correction.
