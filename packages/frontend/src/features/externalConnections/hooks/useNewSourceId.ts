import {
    getDefaultExplorePrefix,
    type ApiConnectorType,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useState } from 'react';
import { useExplorePrefixCheck } from './useLiveSourceReattach';

/**
 * A new source's explore prefix, ready to ignore: it follows the name, moves to a
 * free one when that's taken, and only reports problems once the admin types.
 */
export const useNewSourceId = ({
    projectUuid,
    connector,
    name,
    enabled,
}: {
    projectUuid: string;
    connector: ApiConnectorType;
    name: string;
    enabled: boolean;
}) => {
    const [typed, setTyped] = useState<string | null>(null);
    const requested = typed ?? getDefaultExplorePrefix(connector, name);
    const [debounced] = useDebouncedValue(requested, 300);
    const { data, isFetching } = useExplorePrefixCheck({
        projectUuid,
        connector,
        prefix: debounced,
        enabled: enabled && debounced.length > 0,
    });
    const isChecking = requested !== debounced || isFetching;
    const check = isChecking ? undefined : data;
    const autoSuggestion = typed === null ? (check?.suggestion ?? null) : null;
    const error = autoSuggestion ? null : (check?.error ?? null);
    return {
        value: autoSuggestion ?? requested,
        onChange: setTyped,
        error,
        suggestion: autoSuggestion ? null : (check?.suggestion ?? null),
        isBlocked:
            enabled && (requested.length === 0 || isChecking || error !== null),
    };
};
