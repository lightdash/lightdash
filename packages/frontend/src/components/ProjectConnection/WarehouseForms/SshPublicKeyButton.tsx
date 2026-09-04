import { Button } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineModal from '../../common/MantineModal';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import { useCreateSshKeyPair } from './sshHooks';
import { writeSshPublicKeyDraft } from './sshPublicKeyDraft';

const SshPublicKeyButton: FC<{
    disabled: boolean;
    hasKey: boolean;
}> = ({ disabled, hasKey }) => {
    const form = useFormContext();
    const { savedProject } = useProjectFormContext();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const { mutate, isLoading } = useCreateSshKeyPair({
        onSuccess: (data) => {
            form.setFieldValue('warehouse.sshTunnelPublicKey', data.publicKey);
            if (savedProject) {
                writeSshPublicKeyDraft(
                    savedProject.projectUuid,
                    data.publicKey,
                );
            }
        },
    });

    return (
        <>
            <Button
                onClick={() => (hasKey ? setIsConfirmOpen(true) : mutate())}
                loading={isLoading}
                disabled={disabled || isLoading}
            >
                {hasKey ? 'Regenerate key' : 'Generate public key'}
            </Button>
            <MantineModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                role="alertdialog"
                title="Regenerate SSH key?"
                icon={IconKey}
                description="The key currently installed on your bastion host will stop working. You will need to add the new public key to its authorized_keys before saving."
                confirmLabel="Regenerate"
                cancelLabel="Keep current key"
                onConfirm={() => {
                    setIsConfirmOpen(false);
                    mutate();
                }}
            />
        </>
    );
};

export default SshPublicKeyButton;
