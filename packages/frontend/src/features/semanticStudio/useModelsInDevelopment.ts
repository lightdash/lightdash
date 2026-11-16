import { useMemo } from 'react';
import { useDevelopmentView } from './developmentView';
import { useSemanticLayerDraftedModels } from './useSemanticLayerModel';

const NONE: ReadonlySet<string> = new Set();

/** The models this person is looking at in their own unpublished version; empty unless they switched the development view on. */
export const useModelsInDevelopment = (
    projectUuid: string | undefined,
): ReadonlySet<string> => {
    const [isOn] = useDevelopmentView();
    const { data } = useSemanticLayerDraftedModels(
        projectUuid ?? '',
        isOn && !!projectUuid,
    );
    return useMemo(
        () => (isOn && data ? new Set(data.models) : NONE),
        [isOn, data],
    );
};
