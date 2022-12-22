import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { Dashboard } from '@lightdash/common';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../hooks/dashboard/useDashboard';
import { useApp } from '../../providers/AppProvider';

interface CreateSavedDashboardModalProps {
    isOpen: boolean;

    tiles?: Dashboard['tiles'];
    showRedirectButton?: boolean;
    onClose?: () => void;
}

const CreateSavedDashboardModal: FC<CreateSavedDashboardModalProps> = ({
    isOpen,
    tiles,
    showRedirectButton,
    onClose,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const useCreate = useCreateMutation(projectUuid, showRedirectButton);
    const { mutate, isLoading: isCreating } = useCreate;
    const [name, setName] = useState<string>('');

    const { user } = useApp();

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return <></>;

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title="Create dashboard"
            canOutsideClickClose={false}
        >
            <form>
                <div className={Classes.DIALOG_BODY}>
                    <FormGroup label="Name" labelFor="chart-name">
                        <InputGroup
                            id="chart-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="eg. KPI dashboard"
                        />
                    </FormGroup>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            data-cy="submit-base-modal"
                            intent={Intent.SUCCESS}
                            text="Create"
                            type="submit"
                            onClick={(e) => {
                                mutate({ tiles: tiles || [], name });

                                if (onClose) onClose();
                                e.preventDefault();
                            }}
                            disabled={isCreating || !name}
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};

export default CreateSavedDashboardModal;
