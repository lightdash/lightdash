import { Alert, Box, Button, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import MantineIcon from '../MantineIcon';

type SpaceCreationFormProps = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
};

const SpaceCreationForm = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
}: SpaceCreationFormProps) => {
    return (
        <Stack spacing="xs">
            <Box>
                <Button
                    variant="subtle"
                    leftIcon={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onCancel}
                    disabled={isLoading}
                    size="xs"
                    compact
                >
                    Back to Space selection
                </Button>
            </Box>

            <Text fz="sm" fw={500}>
                You are creating a new space
                {parentSpaceName ? (
                    <>
                        {' '}
                        in{' '}
                        <Text span fw={600}>
                            "{parentSpaceName}"
                        </Text>
                    </>
                ) : null}
                .
            </Text>

            <TextInput
                label="Name"
                placeholder="Space name"
                required
                disabled={isLoading}
                value={spaceName}
                onChange={(e) => onSpaceNameChange(e.target.value)}
            />

            {parentSpaceName ? (
                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                    <Text fw={500} color="blue">
                        Permissions will be inherited from{' '}
                        <Text span fw={600}>
                            "{parentSpaceName}"
                        </Text>
                    </Text>
                </Alert>
            ) : (
                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                    <Text fw={500} color="blue">
                        This space will be private and not visible to other
                        users. You can change this later.
                    </Text>
                </Alert>
            )}
        </Stack>
    );
};

export default SpaceCreationForm;
