import {
    Box,
    Button,
    Group,
    Paper,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import {
    useValidation,
    useValidationMutation,
} from '../../hooks/validation/useValidation';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import { formatTime } from '../SchedulersView/SchedulersViewUtils';
import { ValidatorTable } from './ValidatorTable';

const MIN_ROWS_TO_ENABLE_SCROLLING = 6;

export const SettingsValidator: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const theme = useMantineTheme();
    const [isValidating, setIsValidating] = useState(false);

    const { user } = useApp();
    const { data } = useValidation(projectUuid, user, true); // Note: Users that land on this page can always manage validations
    const { mutate: validateProject } = useValidationMutation(
        projectUuid,
        () => setIsValidating(false),
        () => setIsValidating(false),
    );

    return (
        <>
            <Text color="dimmed">
                Use the project validator to check what content is broken in
                your project.
            </Text>

            <Paper withBorder shadow="sm">
                <Group
                    position="apart"
                    p="md"
                    sx={{
                        borderBottomWidth: 1,
                        borderBottomStyle: 'solid',
                        borderBottomColor: theme.colors.gray[3],
                    }}
                >
                    <Text fw={500} fz="xs" c="gray.6">
                        {!!data?.length
                            ? `Last validated at: ${formatTime(
                                  data[0].createdAt,
                              )}`
                            : null}
                    </Text>
                    <Button
                        onClick={() => {
                            setIsValidating(true);
                            validateProject();
                        }}
                        loading={isValidating}
                    >
                        Run validation
                    </Button>
                </Group>
                <Box
                    sx={{
                        overflowY:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? 'scroll'
                                : 'auto',
                        maxHeight:
                            data && data.length > MIN_ROWS_TO_ENABLE_SCROLLING
                                ? '500px'
                                : 'auto',
                    }}
                >
                    {!!data?.length ? (
                        <ValidatorTable data={data} projectUuid={projectUuid} />
                    ) : (
                        <Group position="center" spacing="xs" p="md">
                            <MantineIcon icon={IconCheck} color="green" />
                            <Text fw={500} c="gray.7">
                                No validation errors found
                            </Text>
                        </Group>
                    )}
                </Box>
            </Paper>
        </>
    );
};
