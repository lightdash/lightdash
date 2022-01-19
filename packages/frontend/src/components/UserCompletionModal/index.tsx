import { Button, H3, Intent, Overlay } from '@blueprintjs/core';
import { LightdashMode } from 'common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useApp } from '../../providers/AppProvider';
import BooleanSwitch from '../ReactHookForm/BooleanSwitch';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import Select from '../ReactHookForm/Select';
import { UserCompletionModalCard } from './UserCompletionModal.styles';

type CompleteUserArgs = {
    organisationName?: string;
    jobTitle: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
};

const jobTitles = [
    { value: '', label: 'Select an option...' },
    'Data/analytics Leader (manager, director, etc.)',
    'Data scientist',
    'Data analyst',
    'Data engineer',
    'Analytics engineer',
    'Sales',
    'Marketing',
    'Product',
    'Operations',
    'Customer service',
    'Student',
    'Other',
];

const UserCompletionModal: FC = () => {
    const { health, user } = useApp();
    const methods = useForm<CompleteUserArgs>({
        mode: 'onSubmit',
    });
    const isLoading = false;

    const handleSubmit = (data: CompleteUserArgs) => {
        console.log('enter', data);
    };

    if (!user.data || user.data.isSetupComplete) {
        return null;
    }
    return (
        <Overlay
            isOpen
            enforceFocus
            hasBackdrop
            canEscapeKeyClose={false}
            canOutsideClickClose={false}
        >
            <UserCompletionModalCard elevation={2}>
                <H3 style={{ marginBottom: 25 }}>
                    Finish setting up your account
                </H3>
                <Form name="login" methods={methods} onSubmit={handleSubmit}>
                    <Input
                        label="Organization name"
                        name="organisationName"
                        placeholder="Lightdash"
                        disabled={isLoading}
                        rules={{
                            required: 'Required field',
                        }}
                        defaultValue={user.data.organizationName}
                    />
                    <Select
                        label="Job title"
                        name="jobTitle"
                        disabled={isLoading}
                        options={jobTitles}
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <BooleanSwitch
                        label="Keep me updated on new Lightdash features"
                        name="isMarketingOptedIn"
                        disabled={isLoading}
                        defaultValue
                    />
                    {health.data?.mode !== LightdashMode.CLOUD_BETA && (
                        <BooleanSwitch
                            label="Anonymize my usage data. We collect data for measuring product usage."
                            name="isTrackingAnonymized"
                            disabled={isLoading}
                            defaultValue={false}
                        />
                    )}
                    <Button
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Save"
                        loading={isLoading}
                    />
                </Form>
            </UserCompletionModalCard>
        </Overlay>
    );
};

export default UserCompletionModal;
