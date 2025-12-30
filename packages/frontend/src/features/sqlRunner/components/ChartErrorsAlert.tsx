import { Button } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    onFixButtonClick: () => void;
};

export const ChartErrorsAlert: FC<Props> = ({
    opened,
    onClose,
    onFixButtonClick,
}) => {
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Fix errors before saving"
            icon={IconAlertCircle}
            cancelLabel={false}
            actions={
                <Button size="xs" variant="default" onClick={onFixButtonClick}>
                    Fix errors
                </Button>
            }
            description="You have errors in your chart configuration. Please fix the errors and try again."
        ></MantineModal>
    );
};
