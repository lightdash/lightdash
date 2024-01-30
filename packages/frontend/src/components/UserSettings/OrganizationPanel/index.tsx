import { Button, Flex, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useCallback, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';

const OrganizationPanel: FC = () => {
    const { isInitialLoading: isOrganizationLoading, data } = useOrganization();
    const {
        isLoading: isOrganizationUpdateLoading,
        mutate: updateOrganization,
    } = useOrganizationUpdateMutation();
    const isLoading = isOrganizationUpdateLoading || isOrganizationLoading;
    const form = useForm({
        initialValues: {
            organizationName: '',
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (data) {
            setFieldValue('organizationName', data?.name);
        }
    }, [data, data?.name, setFieldValue]);

    const setFormValuesFromData = useCallback(() => {
        if (data?.name) {
            form.setValues({
                organizationName: data?.name,
            });
            form.resetDirty({
                organizationName: data?.name,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.name]);

    useEffect(() => {
        setFormValuesFromData();
    }, [setFormValuesFromData]);

    const handleOnSubmit = form.onSubmit(({ organizationName }) => {
        updateOrganization({ name: organizationName });
    });

    return (
        <form onSubmit={handleOnSubmit}>
            <Stack>
                <TextInput
                    label="Organization name"
                    required
                    placeholder="Lightdash"
                    disabled={isLoading}
                    {...form.getInputProps('organizationName')}
                />

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setFormValuesFromData();
                            }}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        display="block"
                        type="submit"
                        disabled={isLoading || !form.isDirty()}
                        loading={isLoading}
                    >
                        Update
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default OrganizationPanel;
