import { type DashboardDraftOverlayError } from '@lightdash/common';
import { Alert, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type DraftOverlayFailureAlertProps = {
    error: DashboardDraftOverlayError;
};

const DraftOverlayFailureAlert: FC<DraftOverlayFailureAlertProps> = ({
    error,
}) => (
    <Alert
        color="orange"
        icon={<MantineIcon icon={IconAlertTriangle} />}
        title="Your unpublished draft couldn't be displayed"
        mx="md"
        mt="md"
        data-draft-error={error.code}
    >
        <Text size="sm">
            You're viewing the published dashboard. Your draft is still saved
            for review. Ask a Content as Code admin to review or dismiss it.
        </Text>
    </Alert>
);

export default DraftOverlayFailureAlert;
