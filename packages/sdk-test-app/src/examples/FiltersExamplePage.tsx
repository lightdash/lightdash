import Lightdash, { FilterOperator } from '@lightdash/sdk';
import { useState } from 'react';
import { Link } from 'react-router';
import { ExampleSelect } from '../components/ExampleSelect';
import { TestAppLayout } from '../components/TestAppLayout';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    dashboardContainerStyle,
    emptyStateBoxStyle,
    emptyStateStyle,
    filterPanelGridStyle,
    helperTextStyle,
    infoBoxStyle,
    pageDescriptionStyle,
    pageTitleStyle,
    panelLabelStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './FiltersExamplePage.styles';

type FiltersExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const mono = `'SF Mono', 'Fira Code', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace`;
const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/FiltersExamplePage.tsx',
);

const CUSTOMER_FIRST_NAME_OPTIONS = [
    { value: '', label: 'All customers' },
    { value: 'Aaron', label: 'Aaron' },
    { value: 'Adam', label: 'Adam' },
    { value: 'Amanda', label: 'Amanda' },
    { value: 'Anna', label: 'Anna' },
    { value: 'Barbara', label: 'Barbara' },
    { value: 'David', label: 'David' },
    { value: 'Diana', label: 'Diana' },
    { value: 'Elizabeth', label: 'Elizabeth' },
];

export function FiltersExamplePage({ embedConfig }: FiltersExamplePageProps) {
    const [selectedCustomerFirstName, setSelectedCustomerFirstName] =
        useState('');

    const dashboardFilters = selectedCustomerFirstName
        ? [
              {
                  model: 'customers',
                  field: 'first_name',
                  operator: FilterOperator.EQUALS,
                  value: [selectedCustomerFirstName],
              },
          ]
        : [];

    return (
        <TestAppLayout
            embedConfig={embedConfig}
            footer={
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                    }}
                >
                    <span>© 2026 Lightdash</span>
                    <a href={sourceUrl} target="_blank" rel="noreferrer">
                        Source code
                    </a>
                </div>
            }
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px',
                }}
            >
                <div>
                    <Link
                        to="/"
                        style={{ color: '#737373', textDecoration: 'none' }}
                    >
                        ← Back to examples
                    </Link>
                    <h2 style={pageTitleStyle}>Filters demo</h2>
                    <p style={pageDescriptionStyle}>
                        This example shows how a host app can drive embedded
                        dashboard filters with its own UI. The select below
                        controls the joined customer first-name dimension from
                        `orders.yml` and `customers.yml`.
                    </p>
                </div>

                {embedConfig.instanceUrl && embedConfig.token ? (
                    <>
                        <section>
                            <h3 style={sectionTitleStyle}>
                                Custom filter control
                            </h3>
                            <p style={sectionDescStyle}>
                                The dashboard receives an SDK filter targeting
                                `customers.first_name`. Because `orders.yml`
                                joins `customers`, that first-name dimension can
                                be applied across the embedded dashboard.
                            </p>
                            <div style={filterPanelGridStyle}>
                                <div>
                                    <ExampleSelect
                                        label="Customer first name"
                                        value={selectedCustomerFirstName}
                                        onChange={setSelectedCustomerFirstName}
                                        options={CUSTOMER_FIRST_NAME_OPTIONS}
                                        helperText="This select lives in the host app. Changing it updates the filters prop passed into Lightdash.Dashboard."
                                    />
                                </div>
                                <div>
                                    <label style={panelLabelStyle}>
                                        Current SDK filter
                                    </label>
                                    <pre style={infoBoxStyle}>
                                        {JSON.stringify(dashboardFilters, null, 2)}
                                    </pre>
                                    <p style={helperTextStyle}>
                                        When no value is selected, the example
                                        sends no custom filters.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 style={sectionTitleStyle}>
                                Filtered dashboard
                            </h3>
                            <p style={sectionDescStyle}>
                                The embedded dashboard below is rendered with
                                the current custom filter selection.
                            </p>
                            <div style={dashboardContainerStyle}>
                                <Lightdash.Dashboard
                                    key={JSON.stringify(dashboardFilters)}
                                    instanceUrl={embedConfig.instanceUrl}
                                    token={embedConfig.token}
                                    filters={dashboardFilters}
                                    styles={{
                                        backgroundColor: 'transparent',
                                    }}
                                />
                            </div>
                        </section>
                    </>
                ) : (
                    <div style={emptyStateStyle}>
                        <div style={emptyStateBoxStyle}>
                            Click <strong>Config</strong> to add your embed URL
                        </div>
                    </div>
                )}
            </div>
        </TestAppLayout>
    );
}
