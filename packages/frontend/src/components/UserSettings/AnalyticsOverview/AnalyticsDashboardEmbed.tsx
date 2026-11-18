import { DASHBOARD_GRID_CLASS } from '@lightdash/common';
import { Box, Center, Loader, SegmentedControl } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
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
                setHeight(Math.ceil(body.getBoundingClientRect().height));
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

const AnalyticsDashboardEmbed = ({
    projectUuid,
    projectUrlIdentifier,
    slug,
    name,
}: {
    projectUuid: string;
    projectUrlIdentifier: string;
    slug: string;
    name: string;
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
    const path = `/minimal/projects/${projectUrlIdentifier}/dashboards/${slug}`;
    // The tabs are offered here, in the style of this page, so the dashboard is asked to leave its own out
    const query = '?hideTabs=true';
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
            {tabs.length > 1 && (
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
            )}
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
                <iframe
                    ref={fit.ref}
                    src={`${path}${query}`}
                    title={`${name} dashboard`}
                    height={fit.height ?? LOADING_HEIGHT}
                    scrolling="no"
                    className={classes.dashboardFrame}
                    data-loading={isLoading || undefined}
                />
            </Box>
        </Box>
    );
};

export default AnalyticsDashboardEmbed;
