// Placeholder host app UI. None of this is part of the Lightdash SDK; it stands
// in for the navigation, tabs and filter bar your own product already has.
import { useState, type ReactNode } from 'react';
import {
    appShellStyle,
    applyButtonDisabledStyle,
    applyButtonStyle,
    brandMarkStyle,
    breadcrumbCurrentStyle,
    breadcrumbStyle,
    dashboardFrameStyle,
    filterBarStyle,
    getFilterSelectStyle,
    getRailItemStyle,
    getTabStyle,
    mainStyle,
    pageSubtitleStyle,
    pageTitleStyle,
    placeholderStyle,
    railStyle,
    tabListStyle,
    updatedTextStyle,
} from './HostPlaceholders.styles';

export type HostDateRange = 'all-time' | '2025' | '2024';

export type HostFilters = {
    dateRange: HostDateRange;
    plan: string;
    status: string;
};

type SelectOption = { value: string; label: string };

const TABS = ['Overview', 'Subscriptions', 'Revenue', 'Customers', 'Custom'];
const DASHBOARD_TAB = 'Subscriptions';

const DATE_RANGE_OPTIONS: SelectOption[] = [
    { value: 'all-time', label: 'All time' },
    { value: '2025', label: 'Year 2025' },
    { value: '2024', label: 'Year 2024' },
];

const PLAN_OPTIONS: SelectOption[] = [
    { value: '', label: 'All plans' },
    { value: 'free', label: 'Free' },
    { value: 'silver', label: 'Silver' },
    { value: 'gold', label: 'Gold' },
    { value: 'platinum', label: 'Platinum' },
    { value: 'diamond', label: 'Diamond' },
];

const STATUS_OPTIONS: SelectOption[] = [
    { value: '', label: 'All statuses' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Expired', label: 'Expired' },
];

const DEFAULT_FILTERS: HostFilters = {
    dateRange: 'all-time',
    plan: '',
    status: '',
};

const areFiltersEqual = (a: HostFilters, b: HostFilters) =>
    a.dateRange === b.dateRange && a.plan === b.plan && a.status === b.status;

const RAIL_ICONS: { label: string; path: ReactNode }[] = [
    { label: 'Customers', path: <path d="M4 7h16M4 12h16M4 17h10" /> },
    {
        label: 'Products',
        path: <rect x="5" y="5" width="14" height="14" rx="2" />,
    },
    {
        label: 'Analytics',
        path: <path d="M4 19V11M10 19V5M16 19v-6M22 19H2" />,
    },
    {
        label: 'Settings',
        path: <path d="M6 4v16M12 4v16M18 4v16M4 9h4M10 15h4M16 7h4" />,
    },
];

function HostRail() {
    return (
        <nav style={railStyle} aria-label="Host navigation">
            <div style={brandMarkStyle}>JC</div>
            {RAIL_ICONS.map(({ label, path }) => (
                <div
                    key={label}
                    title={label}
                    style={getRailItemStyle(label === 'Analytics')}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        {path}
                    </svg>
                </div>
            ))}
        </nav>
    );
}

function FilterSelect({
    label,
    value,
    defaultValue,
    options,
    onChange,
}: {
    label: string;
    value: string;
    defaultValue: string;
    options: SelectOption[];
    onChange: (value: string) => void;
}) {
    return (
        <select
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            style={getFilterSelectStyle(value !== defaultValue)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}

type HostAnalyticsPageProps = {
    // Renders the embedded content with the filters applied in the host bar.
    children: (appliedFilters: HostFilters) => ReactNode;
};

export function HostAnalyticsPage({ children }: HostAnalyticsPageProps) {
    const [activeTab, setActiveTab] = useState(DASHBOARD_TAB);
    const [draftFilters, setDraftFilters] =
        useState<HostFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] =
        useState<HostFilters>(DEFAULT_FILTERS);
    const [appliedAt, setAppliedAt] = useState(() => new Date());

    const hasPendingChanges = !areFiltersEqual(draftFilters, appliedFilters);
    const updateDraft = (patch: Partial<HostFilters>) =>
        setDraftFilters((current) => ({ ...current, ...patch }));
    const applyFilters = () => {
        setAppliedFilters(draftFilters);
        setAppliedAt(new Date());
    };

    return (
        <div style={appShellStyle}>
            <HostRail />
            <main style={mainStyle}>
                <div style={breadcrumbStyle}>
                    <span>All workspaces</span>
                    <span>/</span>
                    <span style={breadcrumbCurrentStyle}>Analytics</span>
                </div>
                <h3 style={pageTitleStyle}>Analytics</h3>
                <p style={pageSubtitleStyle}>
                    Review your subscription growth, churn and recurring
                    revenue.
                </p>

                <div style={tabListStyle} role="tablist">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={tab === activeTab}
                            style={getTabStyle(tab === activeTab)}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === DASHBOARD_TAB ? (
                    <>
                        <div style={filterBarStyle}>
                            <FilterSelect
                                label="Date range"
                                value={draftFilters.dateRange}
                                defaultValue={DEFAULT_FILTERS.dateRange}
                                options={DATE_RANGE_OPTIONS}
                                onChange={(value) =>
                                    updateDraft({
                                        dateRange: value as HostDateRange,
                                    })
                                }
                            />
                            <FilterSelect
                                label="Plan"
                                value={draftFilters.plan}
                                defaultValue=""
                                options={PLAN_OPTIONS}
                                onChange={(value) =>
                                    updateDraft({ plan: value })
                                }
                            />
                            <FilterSelect
                                label="Status"
                                value={draftFilters.status}
                                defaultValue=""
                                options={STATUS_OPTIONS}
                                onChange={(value) =>
                                    updateDraft({ status: value })
                                }
                            />
                            <button
                                type="button"
                                onClick={applyFilters}
                                disabled={!hasPendingChanges}
                                style={
                                    hasPendingChanges
                                        ? applyButtonStyle
                                        : applyButtonDisabledStyle
                                }
                            >
                                Apply
                            </button>
                        </div>
                        <p style={updatedTextStyle}>
                            Updated at{' '}
                            {appliedAt.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </p>
                        <div style={dashboardFrameStyle}>
                            {children(appliedFilters)}
                        </div>
                    </>
                ) : (
                    <div style={placeholderStyle}>
                        The {activeTab} tab belongs to the host app. Only the{' '}
                        {DASHBOARD_TAB} tab embeds a dashboard in this example.
                    </div>
                )}
            </main>
        </div>
    );
}
