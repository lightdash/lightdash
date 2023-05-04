import { Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import {
    Box,
    Button,
    ColorInput,
    SimpleGrid,
    Stack,
    Title,
} from '@mantine/core';
import { FC, useCallback, useEffect, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { Can, useAbilityContext } from '../../common/Authorization';

const AppearancePanel: FC = () => {
    const ability = useAbilityContext();
    const { isLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();
    const [colors, setColors] = useState<string[]>(
        data?.chartColors || ECHARTS_DEFAULT_COLORS.slice(0, 8),
    );

    const update = useCallback(() => {
        if (data) {
            const {
                needsProject: _needsProject,
                organizationUuid: _organizationUuid,
                ...params
            } = data;
            updateMutation.mutate({
                ...params,
                chartColors: colors,
            });
        }
    }, [colors, data, updateMutation]);

    useEffect(() => {
        if (data?.chartColors) {
            setColors(data.chartColors);
        }
    }, [data?.chartColors]);

    if (isOrgLoading) {
        return <Spinner />;
    }

    return (
        <Box>
            <Stack spacing="md">
                <Title order={5}>Default chart colors</Title>
                <SimpleGrid cols={2}>
                    {colors.map((color, index) => (
                        <ColorInput
                            key={index}
                            width="100%"
                            placeholder="Enter hex color"
                            label={`Color ${index + 1}`}
                            value={color}
                            disabled={ability.cannot(
                                'update',
                                subject('Organization', {
                                    organizationUuid: data?.organizationUuid,
                                }),
                            )}
                            onChange={(newColor) => {
                                setColors(
                                    colors.map((c, i) =>
                                        index === i ? newColor : c,
                                    ),
                                );
                            }}
                        />
                    ))}
                </SimpleGrid>

                <Can
                    I={'update'}
                    this={subject('Organization', {
                        organizationUuid: data?.organizationUuid,
                    })}
                >
                    <Button
                        loading={updateMutation.isLoading}
                        onClick={update}
                        ml="auto"
                        display="block"
                    >
                        Save changes
                    </Button>
                </Can>
            </Stack>
        </Box>
    );
};

export default AppearancePanel;
