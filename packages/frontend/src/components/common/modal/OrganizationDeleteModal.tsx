import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    InputGroup,
} from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDeleteOrganizationMutation } from '../../../hooks/organization/useOrganizationDeleteMultation';

interface OrganizationDeleteModalProps extends DialogProps {
    onConfirm?: () => void;
}

const OrganizationDeleteModal: FC<OrganizationDeleteModalProps> = ({
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const { isLoading, data: organization } = useOrganization();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isLoading || !organization) return null;

    const handleConfirm = async () => {
        await mutateAsync(organization.organizationUuid);
        onConfirm?.();
    };

    const handleClose = (event: React.SyntheticEvent<HTMLElement, Event>) => {
        setConfirmOrgName(undefined);
        onClose?.(event);
    };

    return (
        <Dialog
            lazy
            title="Delete Organization"
            icon="trash"
            {...modalProps}
            onClose={handleClose}
        >
            <DialogBody>
                <p>
                    Type the name of this organization{' '}
                    <b>{organization.name}</b> to confirm you want to delete
                    this organization and its users. This action is not
                    reversible.
                </p>

                <InputGroup
                    placeholder={organization.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={handleClose}>Cancel</Button>

                        <Button
                            disabled={
                                confirmOrgName?.toLowerCase() !==
                                organization.name.toLowerCase()
                            }
                            loading={isDeleting}
                            intent="danger"
                            onClick={() => handleConfirm()}
                            type="submit"
                        >
                            Delete
                        </Button>
                    </>
                }
            />
        </Dialog>
    );
};

export default OrganizationDeleteModal;
