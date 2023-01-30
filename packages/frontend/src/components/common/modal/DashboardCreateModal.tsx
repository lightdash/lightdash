import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    FormGroup,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { Dashboard } from '@lightdash/common';
import { FC, useState } from 'react';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import { useApp } from '../../../providers/AppProvider';
import {} from '../ShareSpaceModal/ShareSpaceModal.style';

interface DashboardCreateModalProps extends DialogProps {
    projectUuid: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

const DashboardCreateModal: FC<DashboardCreateModalProps> = ({
    projectUuid,
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const { mutateAsync, isLoading: isCreating } =
        useCreateMutation(projectUuid);
    const { user } = useApp();

    const [name, setName] = useState<string>('');
    const [description, setDescription] = useState<string>('');

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return null;

    const handleClose: DashboardCreateModalProps['onClose'] = (event) => {
        setName('');
        setDescription('');

        onClose?.(event);
    };

    const handleConfirm = async () => {
        const dashboard = await mutateAsync({
            tiles: [],
            name,
            description,
        });

        onConfirm?.(dashboard);
    };

    return (
        <Dialog
            lazy
            title="Create dashboard"
            icon="control"
            {...modalProps}
            onClose={handleClose}
        >
            <DialogBody>
                <FormGroup label="Name your dashboard" labelFor="chart-name">
                    <InputGroup
                        id="chart-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="eg. KPI dashboard"
                    />
                </FormGroup>
                <FormGroup
                    label="Dashboard description"
                    labelFor="chart-description"
                >
                    <InputGroup
                        id="chart-description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="A few words to give your team some context"
                    />
                </FormGroup>
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button onClick={handleClose}>Cancel</Button>

                        <Button
                            data-cy="submit-base-modal"
                            intent={Intent.PRIMARY}
                            text="Create"
                            type="submit"
                            loading={isCreating}
                            onClick={handleConfirm}
                            disabled={isCreating || !name}
                        />
                    </>
                }
            />
        </Dialog>
    );
};

export default DashboardCreateModal;
