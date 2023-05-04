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
import { useForm } from '@mantine/form';
import { FC, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { Can, useAbilityContext } from '../../common/Authorization';

const AppearancePanel: FC = () => {
    const ability = useAbilityContext();
    const { isLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();

    const getColorFields = (colors: string[]) =>
        colors.reduce(
            (acc, color, index) => ({ ...acc, [`color${index}`]: color }),
            {},
        );

    const form = useForm({
        initialValues: getColorFields(ECHARTS_DEFAULT_COLORS.slice(0, 8)),
        validate: Object.keys(
            getColorFields(ECHARTS_DEFAULT_COLORS.slice(0, 8)),
        ).reduce(
            (acc, key) => ({
                [key]: (value: string) =>
                    !/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(value)
                        ? 'Invalid color'
                        : null,
                ...acc,
            }),
            {},
        ),
    });

    const { setValues, resetDirty } = form;

    useEffect(() => {
        if (data?.chartColors) {
            setValues(getColorFields(data.chartColors));
            resetDirty(getColorFields(data.chartColors));
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.chartColors]);

    const handleOnSubmit = form.onSubmit((newColors) => {
        if (data) {
            const {
                needsProject: _needsProject,
                organizationUuid: _organizationUuid,
                ...params
            } = data;
            updateMutation.mutate({
                ...params,
                chartColors: Object.values(newColors),
            });
        }
    });

    if (isOrgLoading) {
        return <Spinner />;
    }

    return (
        <Box>
            <Title order={5} mb="md">
                Default chart colors
            </Title>
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md">
                    <SimpleGrid cols={2}>
                        {Object.values(form.values).map((_color, index) => (
                            <ColorInput
                                key={index}
                                width="100%"
                                placeholder="Enter hex color"
                                label={`Color ${index + 1}`}
                                disabled={ability.cannot(
                                    'update',
                                    subject('Organization', {
                                        organizationUuid:
                                            data?.organizationUuid,
                                    }),
                                )}
                                {...form.getInputProps(`color${index}`)}
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
                            type="submit"
                            loading={updateMutation.isLoading}
                            ml="auto"
                            display="block"
                        >
                            Save changes
                        </Button>
                    </Can>
                </Stack>
            </form>
        </Box>
    );
};

export default AppearancePanel;
