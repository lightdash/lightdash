import { Button, Intent } from '@blueprintjs/core';
import { Organisation } from 'common';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { isValidEmailDomain } from '../../../utils/fieldValidators';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import TagInput from '../../ReactHookForm/TagInput';
import { FormWrapper } from './OrganisationPanel.styles';

const OrganisationPanel: FC = () => {
    const org = useOrganisation();
    const updateMutation = useOrganisationUpdateMutation();
    const isLoading = updateMutation.isLoading || org.isLoading;
    const methods = useForm<Organisation>({
        mode: 'onSubmit',
    });

    useEffect(() => {
        if (org.data) {
            methods.setValue('name', org.data?.name);
            methods.setValue(
                'allowedEmailDomains',
                org.data?.allowedEmailDomains,
            );
        }
    }, [org, methods]);

    const handleUpdate = (data: Organisation) => {
        updateMutation.mutate(data);
    };

    return (
        <FormWrapper>
            <Form
                name="login"
                methods={methods}
                onSubmit={handleUpdate}
                disableSubmitOnEnter
            >
                <Input
                    label="Organisation name"
                    name="name"
                    placeholder="Lightdash"
                    disabled={isLoading}
                    rules={{
                        required: 'Required field',
                    }}
                />
                <TagInput
                    label="Allowed email domains"
                    name="allowedEmailDomains"
                    disabled={isLoading}
                    defaultValue={[]}
                    rules={{
                        validate: {
                            isValidEmailDomain: isValidEmailDomain(
                                'allowedEmailDomains',
                            ),
                        },
                    }}
                />

                <div style={{ flex: 1 }} />
                <Button
                    style={{ alignSelf: 'flex-end', marginTop: 20 }}
                    intent={Intent.PRIMARY}
                    text="Update"
                    loading={isLoading}
                    type="submit"
                />
            </Form>
        </FormWrapper>
    );
};

export default OrganisationPanel;
