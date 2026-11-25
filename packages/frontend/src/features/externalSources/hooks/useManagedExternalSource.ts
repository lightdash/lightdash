import { type ExternalSource } from '@lightdash/common';
import { useExternalSourceActions } from './externalSourceActions';
import { useExternalSources } from './useExternalSources';

/** The listed external source behind a source id, for those who manage it. */
export const useManagedExternalSource = (
    projectUuid: string,
    sourceUuid: string | undefined,
): ExternalSource | null => {
    const actions = useExternalSourceActions();
    const { data } = useExternalSources(
        actions && sourceUuid ? projectUuid : undefined,
    );
    return (
        (actions && data?.find((source) => source.sourceUuid === sourceUuid)) ??
        null
    );
};
