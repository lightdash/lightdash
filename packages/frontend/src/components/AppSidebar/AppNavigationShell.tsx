import { AppShell, useAppShellResize } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconClock, IconTestPipe } from '@tabler/icons-react';
import { clamp } from 'es-toolkit/compat';
import { type FC, type ReactNode } from 'react';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import { PAGE_SCROLLER_ID } from '../../utils/pageScroller';
import {
    APP_PREVIEW_GUTTER_HEIGHT,
    APP_SIDEBAR_COLLAPSE_THRESHOLD,
    APP_SIDEBAR_MAX_WIDTH,
    APP_SIDEBAR_MIN_WIDTH,
    APP_SIDEBAR_RAIL_WIDTH,
    APP_SIDEBAR_WIDTH,
    BANNER_HEIGHT,
} from '../common/Page/constants';
import NavBar from '../NavBar';
import { NavBarRoot } from '../NavBar/NavBarRoot';
import { SharedSignInExpiryListener } from '../NavBar/SharedSignInExpiryListener';
import { useNavBarState } from '../NavBar/useNavBarState';
import { AppSidebar } from './AppSidebar';
import classes from './AppSidebar.module.css';
import { APP_SIDEBAR_ID } from './appSidebarNavigation';
import { DashboardChartGutter } from './DashboardChartGutter';
import { ImpersonationNotch } from './ImpersonationNotch';
import { NoticeGutter } from './NoticeGutter';
import { PreviewGutter } from './PreviewGutter';
import { useAppSidebarCollapse } from './useAppSidebarCollapse';
import { useDashboardChartNotice } from './useDashboardChartNotice';
import { useIsLeftNavigationShown } from './useIsLeftNavigationShown';

const APP_SIDEBAR_WIDTH_STORAGE_KEY = 'app-sidebar:width';

const APP_SIDEBAR_RESIZE_OPTIONS = {
    min: APP_SIDEBAR_MIN_WIDTH,
    max: APP_SIDEBAR_MAX_WIDTH,
    collapseThreshold: APP_SIDEBAR_COLLAPSE_THRESHOLD,
    label: 'Resize sidebar',
};

// A drag leaves the resize edge focused, and the next key press would then
// show its focus line until something else takes focus.
const blurResizeEdge = () => {
    const focused = document.activeElement;
    if (
        focused instanceof HTMLElement &&
        focused.getAttribute('role') === 'separator' &&
        focused.closest(`#${APP_SIDEBAR_ID}`) !== null
    ) {
        focused.blur();
    }
};

const SidebarShell: FC<{ children: ReactNode }> = ({ children }) => {
    const { isFullscreen } = useFullscreen();
    const {
        activeProjectUuid,
        projectUrlIdentifier,
        isLoadingActiveProject,
        hasBanner,
        banner,
        previewNotice,
        trialNotice,
        hasSampleDataNotice,
        isImpersonating,
    } = useNavBarState();
    // The strip above the page holds whichever of these applies; the rules
    // that decide them never let two apply at once. Impersonation is the
    // exception and marks the page itself.
    // Editing or creating a chart for a dashboard is a task with a way out,
    // which outranks what kind of project this is. Only viewing one is not.
    const showsDashboardChartNotice = useDashboardChartNotice();
    const hasGutter =
        showsDashboardChartNotice ||
        previewNotice !== null ||
        trialNotice !== null ||
        hasSampleDataNotice ||
        isImpersonating;
    const showsProjectNotice =
        !showsDashboardChartNotice && previewNotice === null;
    const showsTrialNotice = showsProjectNotice && trialNotice !== null;
    const showsSampleDataNotice =
        showsProjectNotice && trialNotice === null && hasSampleDataNotice;
    // Impersonation and sample data change what the whole page means, so the
    // page itself is outlined; impersonation's mark wins when both apply.
    const pageOutline = isImpersonating
        ? 'impersonation'
        : showsSampleDataNotice
          ? 'sample-data'
          : 'none';
    const { isCollapsed, setIsCollapsed } = useAppSidebarCollapse();
    const [storedWidth, setStoredWidth] = useLocalStorage<number>({
        key: APP_SIDEBAR_WIDTH_STORAGE_KEY,
        defaultValue: APP_SIDEBAR_WIDTH,
        getInitialValueInEffect: false,
    });
    const expandedWidth = clamp(
        storedWidth,
        APP_SIDEBAR_MIN_WIDTH,
        APP_SIDEBAR_MAX_WIDTH,
    );
    const resize = useAppShellResize({
        navbar: APP_SIDEBAR_RESIZE_OPTIONS,
        onResizeEnd: ({ navbar }) => {
            // A drag that ends in the rail keeps the last expanded width.
            if (navbar !== undefined && !isCollapsed) setStoredWidth(navbar);
            // The width lives in storage; a size kept by the controller
            // would override the rail's.
            resize.navbar.reset();
        },
        onCollapseChange: (section, collapsed) => {
            if (section === 'navbar') setIsCollapsed(collapsed);
        },
    });

    return (
        <AppShell
            className={classes.shell}
            data-left-navigation
            data-sidebar-collapsed={isCollapsed}
            data-rounded-page={!isFullscreen}
            // A preview is named in a gutter above the page only, so the
            // sidebar runs the full height beside it.
            layout={hasGutter ? 'alt' : 'default'}
            data-page-outline={pageOutline}
            onPointerUpCapture={blurResizeEdge}
            classNames={{ resizeHandle: classes.resizeHandle }}
            // The sidebar never turns into Mantine's full-width mobile
            // navbar: phone-width windows keep the top navbar.
            navbar={{
                width: isCollapsed ? APP_SIDEBAR_RAIL_WIDTH : expandedWidth,
                breakpoint: 0,
                collapsed: { desktop: isFullscreen, mobile: isFullscreen },
            }}
            header={{
                height: hasGutter
                    ? APP_PREVIEW_GUTTER_HEIGHT
                    : hasBanner
                      ? BANNER_HEIGHT
                      : 0,
            }}
            // Animating the offset would re-measure every chart on each frame.
            transitionDuration={0}
            resize={resize}
        >
            <AppShell.Header withBorder={false} className={classes.gutter}>
                {showsDashboardChartNotice && (
                    <DashboardChartGutter projectUuid={activeProjectUuid} />
                )}
                {!showsDashboardChartNotice && previewNotice && (
                    <PreviewGutter
                        {...previewNotice}
                        isSidebarCollapsed={isCollapsed}
                    />
                )}
                {showsTrialNotice && trialNotice && (
                    <NoticeGutter
                        hint={null}
                        tone="warning"
                        icon={IconClock}
                        title="Trial ended"
                        detail={
                            trialNotice.isExpired
                                ? 'Queries are disabled. Contact sales to reactivate.'
                                : 'Contact sales to keep your workspace'
                        }
                        action={{
                            type: 'external',
                            label: 'Contact sales',
                            href: 'mailto:sales@lightdash.com',
                        }}
                    />
                )}
                {showsSampleDataNotice && (
                    <NoticeGutter
                        hint={null}
                        tone="info"
                        icon={IconTestPipe}
                        title="Sample data"
                        detail="A demo project to look around in while you get set up"
                        action={{
                            type: 'link',
                            label: 'Connect your data',
                            to: '/onboarding/data-source',
                        }}
                    />
                )}
                {isImpersonating && <ImpersonationNotch />}
                <NavBarRoot hasVisibleFixedNavbar={false} hasBanner={hasBanner}>
                    {!hasGutter && banner}
                    <SharedSignInExpiryListener />
                </NavBarRoot>
            </AppShell.Header>
            <AppSidebar
                projectUuid={
                    isLoadingActiveProject ? undefined : activeProjectUuid
                }
                projectUrlIdentifier={projectUrlIdentifier}
                isCollapsed={isCollapsed}
            />
            <AppShell.Main id={PAGE_SCROLLER_ID} className={classes.main}>
                {children}
            </AppShell.Main>
        </AppShell>
    );
};

type Props = {
    isNavBarFixed: boolean;
    children: ReactNode;
};

export const AppNavigationShell: FC<Props> = ({ isNavBarFixed, children }) => {
    const showSidebar = useIsLeftNavigationShown();

    if (showSidebar) return <SidebarShell>{children}</SidebarShell>;

    return (
        <>
            <NavBar isFixed={isNavBarFixed} />
            {children}
        </>
    );
};
