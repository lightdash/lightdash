import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    InputGroup,
} from '@blueprintjs/core';
import { FC, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useDeleteOrganisationMutation } from '../../../hooks/organisation/useOrganisationDeleteMultation';

interface OrganizationDeleteModalProps extends DialogProps {
    onConfirm?: () => void;
}

const OrganisationDeleteModal: FC<OrganizationDeleteModalProps> = ({
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const { isLoading, data: organisation } = useOrganisation();
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganisationMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isLoading || !organisation) return null;

    const handleConfirm = async () => {
        await mutateAsync(organisation.organizationUuid);
        onConfirm?.();
    };

    const handleClose = (event: React.SyntheticEvent<HTMLElement, Event>) => {
        setConfirmOrgName(undefined);
        onClose?.(event);
    };

    return (
        <Dialog
            lazy
            title="Delete Organisation"
            icon="trash"
            {...modalProps}
            onClose={handleClose}
        >
            <DialogBody>
                <p>
                    Type the name of this organisation{' '}
                    <b>{organisation.name}</b> to confirm you want to delete
                    this organisation and its users. This action is not
                    reversible.
                </p>

                <InputGroup
                    placeholder={organisation.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={handleClose}>Cancel</Button>

                        <Button
                            data-cy="submit-base-modal"
                            disabled={
                                confirmOrgName?.toLowerCase() !==
                                organisation.name.toLowerCase()
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

export default OrganisationDeleteModal;
