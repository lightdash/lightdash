import { Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { Button, ColorInput, SimpleGrid, Stack, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { Can, useAbilityContext } from '../../common/Authorization';

const IS_HEX_CODE_COLOR_REGEX = /^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/;

const getColorFormFields = (colors: string[]) =>
    colors.reduce(
        (acc, color, index) => ({ ...acc, [`color${index + 1}`]: color }),
        {},
    );

const AppearancePanel: FC = () => {
    const ability = useAbilityContext();
    const { isLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();

    const form = useForm({
        initialValues: getColorFormFields(ECHARTS_DEFAULT_COLORS.slice(0, 8)),
        validate: Object.keys(
            getColorFormFields(ECHARTS_DEFAULT_COLORS.slice(0, 8)),
        ).reduce(
            (acc, key) => ({
                [key]: (value: string) =>
                    !IS_HEX_CODE_COLOR_REGEX.test(value)
                        ? 'Invalid color, ensure it is in hex format (e.g. #ff000 or #fff)'
                        : null,
                ...acc,
            }),
            {},
        ),
    });

    useEffect(() => {
        if (data?.chartColors) {
            form.setValues(getColorFormFields(data.chartColors));
            form.resetDirty(getColorFormFields(data.chartColors));
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
        <Stack spacing="md">
            <Title order={5}>Default chart colors</Title>
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md">
                    <SimpleGrid cols={2}>
                        {Object.values(form.values).map((_color, index) => (
                            <ColorInput
                                key={index}
                                width="100%"
                                placeholder="Enter hex color"
                                label={`Color ${index + 1}`}
                                swatches={ECHARTS_DEFAULT_COLORS.slice(0, 8)}
                                disabled={ability.cannot(
                                    'update',
                                    subject('Organization', {
                                        organizationUuid:
                                            data?.organizationUuid,
                                    }),
                                )}
                                {...form.getInputProps(`color${index + 1}`)}
                                onBlur={() => {
                                    form.validateField(`color${index + 1}`);
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
        </Stack>
    );
};

export default AppearancePanel;
