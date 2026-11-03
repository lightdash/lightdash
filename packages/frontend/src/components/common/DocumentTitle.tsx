import { useEffect, useSyncExternalStore, type FC } from 'react';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useWhiteLabelBrand } from '../../hooks/organization/useWhiteLabelBrand';

type Props = {
    title?: string;
};

const DEFAULT_APP_NAME = 'Lightdash';
const PREFIX = import.meta.env.DEV ? '(DEV) ' : '';

// Module-level store: the root DocumentTitle renders outside the query provider.
let appName: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const getAppName = () => appName;

const setAppName = (name: string | null) => {
    if (name === appName) return;
    appName = name;
    listeners.forEach((listener) => listener());
};

export const BrandedAppNameSync: FC = () => {
    const { brand, isResolved } = useWhiteLabelBrand();
    const brandName = isResolved
        ? brand?.name?.trim() || DEFAULT_APP_NAME
        : null;
    useEffect(() => {
        setAppName(brandName);
    }, [brandName]);
    return null;
};

export const DocumentTitle: FC<Props> = ({ title }) => {
    // The SDK renders inside the host's document, whose title is not ours.
    const { mode } = useEmbed();
    const currentAppName = useSyncExternalStore(subscribe, getAppName);
    if (mode === 'sdk') {
        return null;
    }

    const fullTitle = currentAppName
        ? title
            ? `${PREFIX}${title} - ${currentAppName}`
            : `${PREFIX}${currentAppName}`
        : `${PREFIX}${title || 'Loading…'}`;
    return <title>{fullTitle}</title>;
};
