import { type AiIdentityAccount } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import Callout from '../../components/common/Callout';
import { AiIdentityAutomaticSetup } from './AiIdentityAutomaticSetup';
import { useProvisioning } from './useProvisioning';

export const AiIdentityCreationSetup: FC<{
    account: AiIdentityAccount;
    onProvisioningJob: (uuid: string) => void;
    reviewPlan?: boolean;
}> = ({ account, onProvisioningJob, reviewPlan = false }) => {
    const query = useProvisioning(account.aiIdentityAccountUuid);
    const client = useQueryClient();
    useEffect(() => {
        if (!reviewPlan || !query.data) return;
        const frame = requestAnimationFrame(() => {
            document
                .getElementById('review-and-run')
                ?.scrollIntoView({ block: 'center' });
            void client.invalidateQueries([
                'ai-identity-provisioning-plan',
                account.aiIdentityAccountUuid,
            ]);
        });
        return () => cancelAnimationFrame(frame);
    }, [reviewPlan, query.data, client, account.aiIdentityAccountUuid]);
    if (query.isError)
        return (
            <Callout variant="danger">
                Could not load provisioning settings.
            </Callout>
        );
    if (!query.data) return null;
    return (
        <AiIdentityAutomaticSetup
            settings={query.data}
            onJob={onProvisioningJob}
        />
    );
};
