import { FeatureFlags } from '@lightdash/common';
import { Alert, Box, Button, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowLeft, IconInfoCircle } from '@tabler/icons-react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../MantineIcon';
import { InheritanceType } from '../ShareSpaceModal/v2/ShareSpaceModalUtils';
import SpaceCreationFormV2 from './SpaceCreationFormV2';

type SpaceCreationFormProps = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
    inheritanceValue?: InheritanceType;
    onInheritanceChange?: (value: InheritanceType) => void;
};

const SpaceCreationForm = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
    inheritanceValue,
    onInheritanceChange,
}: SpaceCreationFormProps) => {
    const { data: nestedSpacesPermissionsFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );

    if (nestedSpacesPermissionsFlag?.enabled && onInheritanceChange) {
        return (
            <SpaceCreationFormV2
                spaceName={spaceName}
                onSpaceNameChange={onSpaceNameChange}
                onCancel={onCancel}
                isLoading={isLoading}
                parentSpaceName={parentSpaceName}
                inheritanceValue={inheritanceValue ?? InheritanceType.OWN_ONLY}
                onInheritanceChange={onInheritanceChange}
            />
        );
    }

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
