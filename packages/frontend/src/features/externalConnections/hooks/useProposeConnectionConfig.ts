import {
    type ApiError,
    type ExternalConnectionConfigProposal,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type ProposeConfigParams = {
    projectUuid: string;
    description: string;
};

/** Ask AI to propose a connection config from a prose description. Carries no
 *  secret in either direction; errors are rendered inline by the wizard, not
 *  as toasts, so the AI-unavailable case can degrade gracefully. */
const proposeConnectionConfig = async (
    lightdashApi: LightdashApi,
    { projectUuid, description }: ProposeConfigParams,
): Promise<ExternalConnectionConfigProposal> =>
    lightdashApi<ExternalConnectionConfigProposal>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/external-connections/propose-config`,
        body: JSON.stringify({ description }),
    });

export const useProposeConnectionConfig = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<
        ExternalConnectionConfigProposal,
        ApiError,
        ProposeConfigParams
    >({
        mutationFn: (args: ProposeConfigParams) =>
            proposeConnectionConfig(lightdashApi, args),
    });
};
