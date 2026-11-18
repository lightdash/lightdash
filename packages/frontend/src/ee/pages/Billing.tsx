import { Button } from '@mantine/core';
import { IconCreditCard, IconExternalLink } from '@tabler/icons-react';
import Callout from '../../components/common/Callout';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingRow } from '../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import { useOpenBillingPortal } from '../features/billing/useOpenBillingPortal';

export default function Billing() {
    const { open, isOpening, isNotConfigured } = useOpenBillingPortal();
    return (
        <SettingsPage
            title="Billing"
            description="Manage how your organization pays for its plan."
        >
            {isNotConfigured ? (
                <Callout variant="info" title="Billing portal not set up">
                    No billing account is linked to this organization yet.
                    Contact support to get access.
                </Callout>
            ) : (
                <SettingsCard>
                    <SettingRow
                        icon={IconCreditCard}
                        title="Billing portal"
                        description="Update payment methods, change your billing address or email, and view invoices. The portal opens in a new tab."
                        control={
                            <Button
                                loading={isOpening}
                                onClick={() => void open()}
                                rightSection={
                                    <MantineIcon icon={IconExternalLink} />
                                }
                            >
                                Open billing portal
                            </Button>
                        }
                    />
                </SettingsCard>
            )}
        </SettingsPage>
    );
}
