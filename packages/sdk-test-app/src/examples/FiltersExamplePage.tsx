import Lightdash, { FilterOperator } from '@lightdash/sdk';
import { useState } from 'react';
import { ExampleLayout } from '../components/ExampleLayout';
import { ExampleSelect } from '../components/ExampleSelect';
import type { EmbedConfigState } from '../hooks/useEmbedConfig';
import { getRepoSourceUrl } from '../lib/repo';
import {
    dashboardContainerStyle,
    filterPanelGridStyle,
    helperTextStyle,
    infoBoxStyle,
    panelLabelStyle,
    sectionDescStyle,
    sectionTitleStyle,
} from './FiltersExamplePage.styles';
import { emptyStateBoxStyle, emptyStateStyle } from '../styles';

type FiltersExamplePageProps = {
    embedConfig: EmbedConfigState;
};

const sourceUrl = getRepoSourceUrl(
    'packages/sdk-test-app/src/examples/FiltersExamplePage.tsx',
);

const CUSTOMER_FIRST_NAME_OPTIONS = [
    { value: '', label: 'All customers' },
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
        <ExampleLayout
            embedConfig={embedConfig}
            sourceUrl={sourceUrl}
            title="Filters demo"
            description={
                <>
                    This example shows how a host app can drive embedded
                    dashboard filters with its own UI. The select below
                    controls the joined customer first-name dimension from
                    `orders.yml` and `customers.yml`.
                </>
            }
        >
            {embedConfig.instanceUrl && embedConfig.token ? (
                <>
                    <section>
                        <h3 style={sectionTitleStyle}>Custom filter control</h3>
                        <p style={sectionDescStyle}>
                            The dashboard receives an SDK filter targeting
                            `customers.first_name`. Because `orders.yml` joins
                            `customers`, that first-name dimension can be
                            applied across the embedded dashboard.
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
                                    When no value is selected, the example sends
                                    no custom filters.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 style={sectionTitleStyle}>Filtered dashboard</h3>
                        <p style={sectionDescStyle}>
                            The embedded dashboard below is rendered with the
                            current custom filter selection.
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
        </ExampleLayout>
    );
}
