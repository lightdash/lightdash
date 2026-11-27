import { type ApiConnectorType } from '@lightdash/common';
import { useEnabledLiveIntegrations } from '../hooks/useEnabledLiveIntegrations';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type AvailableLiveSource,
} from './liveSourceCatalog';

/** The catalog's sources the organization has turned on, in display order; none until the list is known. */
export const getEnabledLiveSources = (
    enabled: readonly ApiConnectorType[] | undefined,
): AvailableLiveSource[] =>
    enabled
        ? LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource).filter(
              ({ connector }) => enabled.includes(connector),
          )
        : [];

/** GA4 rather than Google Analytics 4, Search Console rather than Google Search Console. */
export const shortLiveSourceLabel = (label: string) =>
    label.replace('Google Analytics 4', 'GA4').replace(/^Google /, '');

/**
 * Names a few sources in a sentence: "PostHog", "PostHog and GA4",
 * "PostHog, GA4 and more". Empty when there are none.
 */
export const describeLiveSources = (
    labels: readonly string[],
    {
        shown = 2,
        conjunction = 'and',
    }: { shown?: number; conjunction?: 'and' | 'or' } = {},
): string => {
    if (labels.length > shown) {
        return `${labels.slice(0, shown).join(', ')} and more`;
    }
    if (labels.length <= 1) return labels.join('');
    return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels[labels.length - 1]}`;
};

/** Enabled sources for decorative lists and entry points: empty while loading or on error, so nothing turned off flashes. */
export const useEnabledLiveSources = () => {
    const { data, isInitialLoading } = useEnabledLiveIntegrations();
    const sources = getEnabledLiveSources(data);
    return {
        sources,
        connectors: sources.map(({ connector }) => connector),
        isLoading: isInitialLoading,
    };
};
