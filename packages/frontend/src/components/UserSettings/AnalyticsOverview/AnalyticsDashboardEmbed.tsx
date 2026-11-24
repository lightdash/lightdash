import {
    DASHBOARD_GRID_CLASS,
    DashboardTileTypes,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilterRuleOverride,
} from '@lightdash/common';
import { Box, Center, Group, Loader, SegmentedControl } from '@mantine/core';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import classes from './AnalyticsOverview.module.css';

const LOADING_HEIGHT = 480;
// A dashboard that cannot be drawn says why in a line of text; after this long that line is shown as it is
const GIVE_UP_AFTER_MS = 15_000;

// The dashboard page is on this site, so the frame can read how tall the dashboard is and match it.
// The page scrolls and the frame never does
const useDashboardFrame = () => {
    const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
    const [height, setHeight] = useState<number | null>(null);
    useEffect(() => {
        if (!frame) return undefined;
        let stopWatching = () => {};
        const watch = () => {
            stopWatching();
            const page = frame.contentDocument;
            const view = frame.contentWindow;
            if (!page?.body || !view) return;
            const { body } = page;
            let hasGivenUp = false;
            const measure = () => {
                if (
                    !hasGivenUp &&
                    !body.querySelector(`.${DASHBOARD_GRID_CLASS}`)
                )
                    return;
                // A frame with no height is not drawn, so it would never report growing: wait for a real height
                const next = Math.ceil(body.getBoundingClientRect().height);
                if (next > 0) setHeight(next);
            };
            const sizes = new ResizeObserver(measure);
            sizes.observe(body);
            const giveUp = view.setTimeout(() => {
                hasGivenUp = true;
                measure();
            }, GIVE_UP_AFTER_MS);
            measure();
            stopWatching = () => {
                sizes.disconnect();
                view.clearTimeout(giveUp);
            };
        };
        watch();
        frame.addEventListener('load', watch);
        return () => {
            frame.removeEventListener('load', watch);
            stopWatching();
        };
    }, [frame]);
    return { ref: setFrame, frame, height };
};

// The managed dashboards name these two filters; a dashboard without one has no control for it here
const DATE_FILTER_LABEL = 'Date';
const PROJECT_FILTER_LABEL = 'Project';

const asOverride = ({
    tileTargets,
    lockedTabUuids,
    required,
    requiredGroupId,
    sectionId,
    ...rule
}: DashboardFilterRule): DashboardFilterRuleOverride => rule;

const AnalyticsDashboardEmbed = ({
    projectUuid,
    projectUrlIdentifier,
    slug,
    name,
    range,
    chosenProject,
    controls,
}: {
    projectUuid: string;
    projectUrlIdentifier: string;
    slug: string;
    name: string;
    range: { start: string; lastDay: string };
    chosenProject: string | null;
    controls: { dateNote: ReactNode; date: ReactNode; project: ReactNode };
}) => {
    const fit = useDashboardFrame();
    const isLoading = fit.height === null;
    const dashboard = useDashboardQuery({ uuidOrSlug: slug, projectUuid });
    const tabs = useMemo(
        () =>
            (dashboard.data?.tabs ?? [])
                .filter((tab) => !tab.hidden)
                .toSorted((a, b) => a.order - b.order),
        [dashboard.data?.tabs],
    );
    const [chosenTab, setChosenTab] = useState<string | null>(null);
    const savedFilters = dashboard.data?.filters.dimensions;
    const dateFilter = savedFilters?.find(
        ({ label }) => label === DATE_FILTER_LABEL,
    );
    const projectFilter = savedFilters?.find(
        ({ label }) => label === PROJECT_FILTER_LABEL,
    );
    // The choices made on this page replace the values of the dashboard's own filters
    const overrides: DashboardFilterRuleOverride[] = [
        ...(dateFilter
            ? [
                  {
                      ...asOverride(dateFilter),
                      operator: FilterOperator.IN_BETWEEN,
                      values: [range.start, range.lastDay],
                      settings: undefined,
                  },
              ]
            : []),
        ...(projectFilter && chosenProject
            ? [
                  {
                      ...asOverride(projectFilter),
                      operator: FilterOperator.EQUALS,
                      values: [chosenProject],
                      disabled: false,
                  },
              ]
            : []),
    ];
    // A tab whose charts all keep their own period has nothing for the date range to change, so the
    // range is not offered there. A tile the filter does not name follows it by default
    const shownTab = chosenTab ?? tabs[0]?.uuid;
    const tabFollowsDate =
        !!dateFilter &&
        (dashboard.data?.tiles ?? []).some(
            (tile) =>
                (tabs.length <= 1 || tile.tabUuid === shownTab) &&
                (tile.type === DashboardTileTypes.SAVED_CHART ||
                    tile.type === DashboardTileTypes.SQL_CHART) &&
                dateFilter.tileTargets?.[tile.uuid] !== false,
        );
    const path = `/minimal/projects/${projectUrlIdentifier}/dashboards/${slug}`;
    // The tabs are offered here, in the style of this page, so the dashboard is asked to leave its own out
    const query = `?hideTabs=true${
        overrides.length
            ? `&filters=${encodeURIComponent(JSON.stringify({ dimensions: overrides, metrics: [], tableCalculations: [] }))}`
            : ''
    }`;
    // The dashboard reads its filters once, as it opens, so a new choice opens it again on the tab it was on
    const [opened, setOpened] = useState<{ query: string; src: string }>();
    const isReady = !dashboard.isLoading;
    if (isReady && opened?.query !== query)
        setOpened({
            query,
            src: `${path}${chosenTab ? `/view/tabs/${chosenTab}` : ''}${query}`,
        });
    const openTab = (tabUuid: string) => {
        setChosenTab(tabUuid);
        // The dashboard moves to the tab where it is, with no reload: its address changes and it is told to look
        const view = fit.frame?.contentWindow;
        if (!view) return;
        view.history.replaceState(
            view.history.state,
            '',
            `${path}/view/tabs/${tabUuid}${query}`,
        );
        view.dispatchEvent(
            new PopStateEvent('popstate', { state: view.history.state }),
        );
    };
    return (
        <Box>
            <Group
                gap="md"
                justify="space-between"
                align="center"
                className={classes.dashboardBar}
            >
                {tabs.length > 1 ? (
                    <Box className={classes.dashboardTabs}>
                        <SegmentedControl
                            size="xs"
                            withItemsBorders={false}
                            classNames={{
                                label: classes.dateOption,
                                root: classes.dateControl,
                                indicator: classes.dateIndicator,
                            }}
                            aria-label={`${name} sections`}
                            value={chosenTab ?? tabs[0].uuid}
                            onChange={openTab}
                            data={tabs.map((tab) => ({
                                value: tab.uuid,
                                label: tab.name,
                            }))}
                        />
                    </Box>
                ) : (
                    <span />
                )}
                {(dateFilter || projectFilter) && (
                    <Group
                        gap="md"
                        className={`${classes.filterControls} ${classes.dashboardControls}`}
                    >
                        {tabFollowsDate && controls.dateNote}
                        {projectFilter && controls.project}
                        {tabFollowsDate && controls.date}
                    </Group>
                )}
            </Group>
            <Box pos="relative" className={classes.dashboardFrameBox}>
                {isLoading && (
                    <Center
                        h={LOADING_HEIGHT}
                        role="status"
                        aria-label={`Loading ${name} dashboard`}
                    >
                        <Loader size="sm" />
                    </Center>
                )}
                {opened && (
                    <iframe
                        ref={fit.ref}
                        src={opened.src}
                        title={`${name} dashboard`}
                        height={fit.height ?? LOADING_HEIGHT}
                        scrolling="no"
                        className={classes.dashboardFrame}
                        data-loading={isLoading || undefined}
                    />
                )}
            </Box>
        </Box>
    );
};

export default AnalyticsDashboardEmbed;
