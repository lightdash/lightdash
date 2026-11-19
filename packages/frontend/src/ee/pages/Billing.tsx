import { Button, Skeleton } from '@mantine/core';
import { IconCreditCard, IconExternalLink } from '@tabler/icons-react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingRow } from '../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { useBillingPortalLink } from '../features/billing/useBillingPortalLink';

const BillingPortalContent = () => {
    const { url, isLoading, isNotConfigured } = useBillingPortalLink();
    const { track } = useTracking();

    if (isLoading) return <Skeleton h={88} radius="md" />;

    if (isNotConfigured) {
        return (
            <Callout variant="info" title="Billing portal not set up">
                No billing account is linked to this organization yet. Contact
                support to get access.
            </Callout>
        );
    }

    if (!url) {
        return (
            <Callout variant="warning" title="Billing portal unavailable">
                The billing portal is not available right now. Contact support
                to get access.
            </Callout>
        );
    }

    return (
        <SettingsCard>
            <SettingRow
                icon={IconCreditCard}
                title="Billing portal"
                description="Update payment methods, change your billing address or email, and view invoices. The portal opens in a new tab."
                control={
                    <Button
                        component="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                            track({
                                name: EventName.BILLING_PORTAL_BUTTON_CLICKED,
                            })
                        }
                        rightSection={<MantineIcon icon={IconExternalLink} />}
                    >
                        Open billing portal
                    </Button>
                }
            />
        </SettingsCard>
    );
};

export default function Billing() {
    return (
        <SettingsPage
            title="Billing"
            description="Manage how your organization pays for its plan."
        >
            <BillingPortalContent />
        </SettingsPage>
    );
}
