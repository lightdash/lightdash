import { Alert, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

export const SqlQueryBeforeSaveAlert: FC = () => {
    return (
        <Alert
            icon={<MantineIcon icon={IconAlertCircle} color="yellow" />}
            color="yellow"
            title="You haven't run your query yet"
        >
            <Text fw={500} size="xs">
                You can verify your query before saving or you can review it
                later.
            </Text>
        </Alert>
    );
};
