import { type Dashboard } from '@lightdash/common';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { type EmbedMode } from '../../../providers/Embed/types';
import { LightdashEventType } from '../events/types';
import { useEmbedEventEmitter } from './useEmbedEventEmitter';

type Tab = Dashboard['tabs'][number];

type Args = {
    activeTab: Tab | undefined;
    mode: EmbedMode;
    pathname: string;
    search: string;
    setActiveTab: (tab: Tab) => void;
    visibleTabs: Tab[];
};

/** Shared user-triggered tab transition for SDK and direct iframe embeds. */
export const useEmbedDashboardTabChange = ({
    activeTab,
    mode,
    pathname,
    search,
    setActiveTab,
    visibleTabs,
}: Args) => {
    const navigate = useNavigate();
    const { dispatchEmbedEvent } = useEmbedEventEmitter();

    return useCallback(
        (tabUuid: string | null) => {
            if (!tabUuid || tabUuid === activeTab?.uuid) return;

            const tabIndex = visibleTabs.findIndex(
                (tab) => tab.uuid === tabUuid,
            );
            if (tabIndex === -1) return;

            const tab = visibleTabs[tabIndex];
            setActiveTab(tab);
            dispatchEmbedEvent(LightdashEventType.TabChanged, { tabIndex });

            if (mode === 'direct') {
                const newPath = pathname.includes('/tabs/')
                    ? pathname.replace(/\/tabs\/[^/]+$/, `/tabs/${tab.uuid}`)
                    : `${pathname}/tabs/${tab.uuid}`;

                void navigate(
                    {
                        pathname: newPath,
                        search: new URLSearchParams(search).toString(),
                    },
                    { replace: true },
                );
            }
        },
        [
            activeTab?.uuid,
            dispatchEmbedEvent,
            mode,
            navigate,
            pathname,
            search,
            setActiveTab,
            visibleTabs,
        ],
    );
};
