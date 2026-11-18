import { DASHBOARD_GRID_CLASS } from '@lightdash/common';
import { Box, Center, Loader } from '@mantine/core';
import { useEffect, useState } from 'react';
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
    return { ref: setFrame, height };
};

const AnalyticsDashboardEmbed = ({
    projectUrlIdentifier,
    slug,
    name,
}: {
    projectUrlIdentifier: string;
    slug: string;
    name: string;
}) => {
    const fit = useDashboardFrame();
    const isLoading = fit.height === null;
    return (
        <Box pos="relative" className={classes.dashboardEmbed}>
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
                src={`/minimal/projects/${projectUrlIdentifier}/dashboards/${slug}`}
                title={`${name} dashboard`}
                height={fit.height ?? LOADING_HEIGHT}
                scrolling="no"
                className={classes.dashboardFrame}
                data-loading={isLoading || undefined}
            />
        </Box>
    );
};

export default AnalyticsDashboardEmbed;
