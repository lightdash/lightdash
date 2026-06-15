import { IconListCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import { SettingsValidator } from '../../../../../components/SettingsValidator';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

export const ReviewValidationModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Validator"
            icon={IconListCheck}
            size="80vw"
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <SettingsValidator projectUuid={projectUuid} flush />
        </MantineModal>
    );
};
