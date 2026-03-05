import { Box, Button, Stack, TextInput } from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import InheritanceToggleCards from '../ShareSpaceModal/InheritanceToggleCards';
import { InheritanceType } from '../ShareSpaceModal/ShareSpaceModalUtils';

type SpaceCreationFormProps = {
    spaceName: string;
    onSpaceNameChange: (name: string) => void;
    onCancel: () => void;
    isLoading?: boolean;
    parentSpaceName?: string;
    inheritanceValue?: InheritanceType;
    onInheritanceChange?: (value: InheritanceType) => void;
};

const SpaceCreationForm: FC<SpaceCreationFormProps> = ({
    spaceName,
    onSpaceNameChange,
    onCancel,
    isLoading,
    parentSpaceName,
    inheritanceValue = InheritanceType.OWN_ONLY,
    onInheritanceChange = () => {},
}) => {
    const isNestedSpace = !!parentSpaceName;

    useEffect(() => {
        onInheritanceChange(
            isNestedSpace ? InheritanceType.INHERIT : InheritanceType.OWN_ONLY,
        );
    }, [isNestedSpace, onInheritanceChange]);

    return (
        <Stack gap="xs">
            <Box>
                <Button
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onCancel}
                    disabled={isLoading}
                    size="xs"
                >
                    Back to Space selection
                </Button>
            </Box>

            <TextInput
                label="Name"
                placeholder="Space name"
                required
                disabled={isLoading}
                value={spaceName}
                onChange={(e) => onSpaceNameChange(e.target.value)}
                description={
                    isNestedSpace
                        ? `New space in "${parentSpaceName}". This space will have the same access. You can change this later.`
                        : undefined
                }
            />

            {!isNestedSpace && (
                <InheritanceToggleCards
                    value={inheritanceValue}
                    onChange={onInheritanceChange}
                    disabled={isLoading}
                />
            )}
        </Stack>
    );
};

export default SpaceCreationForm;
