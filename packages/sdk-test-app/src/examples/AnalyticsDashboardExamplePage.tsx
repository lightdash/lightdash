import Lightdash, { FilterOperator } from '@lightdash/sdk';
import { ExampleLayout } from '../components/ExampleLayout';
import { parseEmbedUrl, type EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import { emptyStateBoxStyle, emptyStateStyle, sansFontFamily } from '../styles';
import {
    HostAnalyticsPage,
    type HostFilters,
} from './analytics-dashboard/HostPlaceholders';

type AnalyticsDashboardExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/AnalyticsDashboardExamplePage.tsx',
);

const { instanceUrl, token } = parseEmbedUrl(
    import.meta.env.VITE_ANALYTICS_EMBED_URL ?? '',
);

// Translates the host's filter values into Lightdash dashboard filters.
const toLightdashFilters = (filters: HostFilters) => [
    ...(filters.dateRange === 'all-time'
        ? []
        : [
              {
                  model: 'subscriptions',
                  field: 'subscription_start_day',
                  operator: FilterOperator.IN_BETWEEN,
                  value: [
                      `${filters.dateRange}-01-01`,
                      `${filters.dateRange}-12-31`,
                  ],
              },
          ]),
    ...(filters.plan
        ? [
              {
                  model: 'subscriptions',
                  field: 'plan_name',
                  operator: FilterOperator.EQUALS,
                  value: [filters.plan],
              },
          ]
        : []),
    ...(filters.status
        ? [
              {
                  model: 'subscriptions',
                  field: 'subscription_status',
                  operator: FilterOperator.EQUALS,
                  value: [filters.status],
              },
          ]
        : []),
];

export function AnalyticsDashboardExamplePage({
    embedConfig,
}: AnalyticsDashboardExamplePageProps) {
    return (
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Analytics dashboard demo"
            description={
                <>
                    A host product page that owns its navigation, tabs and
                    filter bar, with one <code>Lightdash.Dashboard</code> built
                    from Chart Studio chart types. The host filters reach the
                    dashboard through the <code>filters</code> prop when you
                    press Apply. The buttons inside each chart regroup and
                    filter the chart without leaving the embed.
                </>
            }
        >
            {instanceUrl && token ? (
                <HostAnalyticsPage>
                    {(appliedFilters) => (
                        <Lightdash.Dashboard
                            key={embedConfig.remountKey}
                            instanceUrl={instanceUrl}
                            token={token}
                            filters={toLightdashFilters(appliedFilters)}
                            styles={{
                                backgroundColor: '#f6f5fd',
                                fontFamily: sansFontFamily,
                            }}
                        />
                    )}
                </HostAnalyticsPage>
            ) : (
                <div style={emptyStateStyle}>
                    <div style={emptyStateBoxStyle}>
                        Run{' '}
                        <code>
                            pnpm -F @lightdash/sdk-test-app
                            setup-analytics-dashboard
                        </code>
                        , then set <code>VITE_ANALYTICS_EMBED_URL</code>
                    </div>
                </div>
            )}
        </ExampleLayout>
    );
}
