import { type ServiceAccount } from '@lightdash/common';
import { Button, Stack, TextInput } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { ProjectAccessPanel } from './ProjectAccessPanel';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    serviceAccount: ServiceAccount | undefined;
};

// Description and expiration are immutable from this UI — they're set at
// create time. Expiration can be changed via the dedicated "Rotate token"
// flow (different menu item) so we deliberately don't surface it as
// editable here, to keep the rotate path the single source of truth.
// Scope is immutable post-create by design (see the design spec).
//
// Showing them as disabled `TextInput`s rather than plain text keeps the
// visual hierarchy consistent with the Create modal — operators see the
// same fields, just inert.
export const ServiceAccountsEditModal: FC<Props> = ({
    isOpen,
    onClose,
    serviceAccount,
}) => {
    if (!serviceAccount) return null;

    const expiresLabel = serviceAccount.expiresAt
        ? new Date(serviceAccount.expiresAt).toLocaleDateString()
        : 'No expiration';

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title="Edit service account"
            icon={IconKey}
            size="lg"
            actions={<Button onClick={onClose}>Done</Button>}
        >
            <Stack gap="md">
                <TextInput
                    label="Description"
                    value={serviceAccount.description}
                    disabled
                />
                <TextInput
                    label="Expiration"
                    value={expiresLabel}
                    disabled
                    description="Use Rotate token to change expiration."
                />
                <TextInput label="Scope" value="Project" disabled />

                <ProjectAccessPanel serviceAccountUuid={serviceAccount.uuid} />
            </Stack>
        </MantineModal>
    );
};
