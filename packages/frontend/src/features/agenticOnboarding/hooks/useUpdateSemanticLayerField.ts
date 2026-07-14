import {
    type ApiError,
    type SemanticLayerResult,
    type UpdateSemanticLayerFieldRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const updateSemanticLayerField = (
    projectUuid: string,
    body: UpdateSemanticLayerFieldRequest,
): Promise<SemanticLayerResult> =>
    lightdashApi<SemanticLayerResult>({
        url: `/projects/${projectUuid}/onboarding/semantic-layer/fields`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const useUpdateSemanticLayerField = (projectUuid: string | null) =>
    useMutation<SemanticLayerResult, ApiError, UpdateSemanticLayerFieldRequest>(
        {
            mutationKey: ['onboarding', 'semantic-layer', 'update-field'],
            mutationFn: (body) =>
                updateSemanticLayerField(projectUuid ?? '', body),
        },
    );
