import { type DashboardTab } from '@lightdash/common';
import { Button, type ModalProps, TextInput } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../components/common/MantineModal';

type EditProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    tab: DashboardTab;
    onConfirm: (tabName: string, tabUuid: string) => void;
};

export const TabEditModal: FC<EditProps> = ({
    opened,
    onClose,
    tab,
    onConfirm,
}) => {
    const form = useForm<{ newTabName: string }>({
        initialValues: {
            newTabName: tab.name,
        },
    });

    const handleConfirm = form.onSubmit(({ newTabName }) => {
        onConfirm(newTabName, tab.uuid);
        form.reset();
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Edit your tab"
            icon={IconPencil}
            size="sm"
            actions={
                <Button
                    type="submit"
                    form="edit-tab-form"
                    disabled={!form.isValid()}
                >
                    Update
                </Button>
            }
        >
            <form id="edit-tab-form" onSubmit={handleConfirm}>
                <TextInput
                    label="Tab name"
                    placeholder="Name your tab"
                    data-autofocus
                    required
                    {...form.getInputProps('newTabName')}
                />
            </form>
        </MantineModal>
    );
};
