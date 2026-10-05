import type { UsageDashboardSpec } from './usageDashboardTypes';

export const usageDashboardSpecs: UsageDashboardSpec[] = [
    {
        key: 'lightdash-analytics-overview',
        name: 'Agents & AI',
        description:
            'AI consumption and agent request adoption, outcomes and feedback.',
        tabs: [
            {
                key: 'adoption',
                name: 'Agent adoption',
                sections: [
                    {
                        title: 'Observed request activity',
                        description:
                            'Requests by agent, person and week. This is not an eligible-user adoption rate or a comparison with external assistants.',
                        charts: ['agent-adoption-by-week'],
                    },
                ],
            },
            {
                key: 'outcomes',
                name: 'Outcomes & feedback',
                sections: [
                    {
                        title: 'Technical outcomes',
                        description:
                            "Captured request outcomes describe technical completion, not whether the answer solved the user's problem. Pending and unknown outcomes remain visible.",
                        charts: ['agent-request-outcomes'],
                    },
                    {
                        title: 'Feedback coverage',
                        description:
                            'Interpret ratings alongside the feedback sample and outcome coverage. Unrated requests are not positive feedback.',
                        charts: ['agent-feedback-rating-and-sample-coverage'],
                    },
                ],
            },
            {
                key: 'consumption',
                name: 'Retries & consumption',
                sections: [
                    {
                        title: 'Retries',
                        description:
                            'Retry overhead and request-linked tokens identify retry-heavy groups; precise incremental tokens per attempt are not captured.',
                        charts: ['agent-retries-latency-and-consumption'],
                    },
                    {
                        title: 'AI consumption',
                        description:
                            'Tokens by person, feature and model. Tokens are not monetary cost; team history, model pricing and external assistant spending are not included.',
                        charts: ['ai-consumption-by-person-feature-and-model'],
                    },
                    {
                        title: 'Consumption by outcome',
                        description:
                            'Request-linked tokens grouped by technical outcome and feedback. Unknown invocation-to-request linkage must not be interpreted as zero consumption.',
                        charts: ['request-consumption-by-outcome-and-feedback'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-query-activity',
        name: 'Queries',
        description: 'Query performance, failures, origins and caching.',
        tabs: [
            {
                key: 'latency',
                name: 'Latency & failures',
                sections: [
                    {
                        title: 'Response latency',
                        description:
                            'Response P95 includes observed backend response time, not browser rendering. Older events can lack timing; null is unknown, not instant.',
                        charts: ['slow-dashboards-tail-latency-and-demand'],
                    },
                    {
                        title: 'Failures',
                        description:
                            'Ranked by distinct affected people and failure count. Error messages and root-cause diagnosis require separate investigation.',
                        charts: ['query-failures-affected-people'],
                    },
                ],
            },
            {
                key: 'origins',
                name: 'Origins & caching',
                sections: [
                    {
                        title: 'Workload origins',
                        description:
                            'Origin and actor metadata distinguish workloads where captured; historical unknown values are retained.',
                        charts: ['query-origin-and-initiating-actor'],
                    },
                    {
                        title: 'Caching',
                        description:
                            'Compare warehouse execution and recorded cache use. Cache savings and warehouse currency costs are not captured.',
                        charts: ['warehouse-versus-cached-demand'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-people',
        name: 'People',
        description:
            'Observed activity, returning users and activity channels.',
        tabs: [
            {
                key: 'activity',
                name: 'Activity',
                sections: [
                    {
                        title: 'Active people',
                        description:
                            'People with recorded activity. This does not include everyone with access or distinguish business users from the data team.',
                        charts: [
                            'observed-active-people',
                            'daily-observed-active-people',
                            'power-users-queries-ai-and-exports',
                        ],
                    },
                ],
            },
            {
                key: 'returning',
                name: 'Returning users',
                sections: [
                    {
                        title: 'Activity over time',
                        description:
                            'Weekly activity is a return-use proxy. A complete retention cohort or dormant-user report requires an eligibility baseline and continuous historical capture.',
                        charts: ['observed-activity-by-person-and-week'],
                    },
                ],
            },
            {
                key: 'channels',
                name: 'Channels & history',
                sections: [
                    {
                        title: 'Google Sheets',
                        description:
                            'Query activity from the Sheets integration; this does not measure every spreadsheet reader.',
                        charts: ['google-sheets-query-audience'],
                    },
                    {
                        title: 'Activity history',
                        description:
                            'Recent recorded activity by person and project. This does not show past access or group membership.',
                        charts: [
                            'observed-history-stable-user-and-project-uuids',
                        ],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-content',
        name: 'Content',
        description: 'Audience, trust, adoption and current content inventory.',
        tabs: [
            {
                key: 'audience',
                name: 'Audience & trust',
                sections: [
                    {
                        title: 'Content audience',
                        description:
                            'People who viewed content, alongside recorded views. Reloads may add views; visits served entirely from the browser cache are not counted.',
                        charts: [
                            'content-reach-distinct-people-not-just-views',
                            'who-visited-which-dashboard',
                        ],
                    },
                    {
                        title: 'Verified content',
                        description:
                            'Distinct viewers reaching verified content divided by viewers with known verification state. Audiences can overlap; unknown verification is excluded.',
                        charts: ['verified-content-audience-share'],
                    },
                ],
            },
            {
                key: 'adoption',
                name: 'Creation & adoption',
                sections: [
                    {
                        title: 'New content',
                        description:
                            'Creation-week return activity is a proxy for adoption. Older content may predate capture; inventory counts include deleted items unless filtered.',
                        charts: [
                            'new-content-adoption-creation-week-proxy',
                            'content-creation-by-month',
                        ],
                    },
                ],
            },
            {
                key: 'health',
                name: 'Activity & dependencies',
                sections: [
                    {
                        title: 'Content review',
                        description:
                            'No observed activity is not proof that an item is safe to delete. Known dependencies cover current dashboard tiles and enabled schedules, not every external use.',
                        charts: [
                            'review-candidates-activity-and-known-dependencies',
                        ],
                    },
                ],
            },
            {
                key: 'ownership',
                name: 'Ownership & compute',
                sections: [
                    {
                        title: 'Current ownership',
                        description:
                            'Application membership is not employment history. Missing or inactive owners need review; complete schedule ownership is not captured.',
                        charts: ['content-ownership-current-snapshot'],
                    },
                    {
                        title: 'Audience and execution time',
                        description:
                            'Warehouse execution time is a compute proxy, not monetary cost. Attribution can overlap between charts and dashboards.',
                        charts: [
                            'high-compute-dashboards-audience-versus-warehouse-time',
                        ],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-apps',
        name: 'Apps',
        description:
            'App loads, audiences, builders and generation consumption.',
        tabs: [
            {
                key: 'usage',
                name: 'App usage',
                sections: [
                    {
                        title: 'Observed app use',
                        description:
                            'Recorded app loads, including reloads. Viewer counts exclude anonymous visitors, and preview activity may be incomplete.',
                        charts: [
                            'total-loads',
                            'distinct-viewers',
                            'viewed-apps',
                        ],
                    },
                    {
                        title: 'Daily activity',
                        description:
                            'Full retained history. Distinct users cannot be summed across days.',
                        charts: ['daily-trend'],
                    },
                    {
                        title: 'Popular apps',
                        description:
                            'Most-used apps and their projects. Unknown or removed apps remain in totals.',
                        charts: ['top-apps'],
                    },
                ],
            },
            {
                key: 'people',
                name: 'People',
                sections: [
                    {
                        title: 'App audiences',
                        description:
                            'See who uses each app, how often they load it and how many apps they use.',
                        charts: ['top-people', 'user-app-detail'],
                    },
                ],
            },
            {
                key: 'builders',
                name: 'Builders & AI',
                sections: [
                    {
                        title: 'Build activity',
                        description:
                            'Captured creation and iteration events by builder and week. Uploads and views are excluded.',
                        charts: [
                            'data-app-builders-creation-and-iterations-by-week',
                        ],
                    },
                    {
                        title: 'Generation consumption',
                        description:
                            'AI usage for app generation, by builder, week and AI model. Usage cannot yet be attributed to individual apps or builds.',
                        charts: ['app-generation-consumption'],
                    },
                ],
            },
            {
                key: 'lifecycle',
                name: 'Lifecycle & adoption',
                sections: [
                    {
                        title: 'Audience and loads',
                        description:
                            'Loads and observed viewers are usage evidence, not sessions or a complete creator-versus-consumer funnel.',
                        charts: ['apps-loads-and-observed-viewers'],
                    },
                    {
                        title: 'Builds and loads',
                        description:
                            'Lifecycle events are a proxy for adoption; preview-to-published conversion and build-version history are not yet captured.',
                        charts: ['app-lifecycle-build-activity-versus-loads'],
                    },
                ],
            },
        ],
    },
    {
        key: 'lightdash-analytics-tools',
        name: 'Tools & operations',
        description:
            'MCP tool activity, exports and operational capture boundaries.',
        tabs: [
            {
                key: 'mcp',
                name: 'MCP tools',
                sections: [
                    {
                        title: 'Tool usage',
                        description:
                            'Tool calls by person, client and tool, including service accounts. Error rates exclude calls whose outcome is unknown.',
                        charts: ['mcp-users-clients-tools-and-error-rates'],
                    },
                ],
            },
            {
                key: 'exports',
                name: 'Exports',
                sections: [
                    {
                        title: 'Export activity',
                        description:
                            'Captured download events with actor and available content attribution. This does not measure downstream recipients or use of the exported file.',
                        charts: ['export-audit-actor-content-and-outcome'],
                    },
                ],
            },
        ],
    },
];
