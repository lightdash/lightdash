import { Colors, H3, Intent, Overlay } from '@blueprintjs/core';
import { CompleteUserArgs, LightdashMode } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useApp } from '../../providers/AppProvider';
import { BigButton } from '../common/BigButton';
import Checkbox from '../ReactHookForm/Checkbox';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import Select from '../ReactHookForm/Select';
import { UserCompletionModalCard } from './UserCompletionModal.styles';

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
    const { isLoading, mutate, isSuccess } = useUserCompleteMutation();

    const handleSubmit = (data: CompleteUserArgs) => {
        mutate(data);
    };

    if (!user.data || user.data.isSetupComplete) {
        return null;
    }
    return (
        <Overlay
            isOpen={!isSuccess}
            enforceFocus
            hasBackdrop
            canEscapeKeyClose={false}
            canOutsideClickClose={false}
        >
            <UserCompletionModalCard elevation={2}>
                <H3>Nearly there!</H3>
                <p style={{ color: Colors.GRAY1, marginBottom: 20 }}>
                    Tell us a little bit more about yourself to finish setting
                    up your account.
                </p>
                <Form
                    name="complete_user"
                    methods={methods}
                    onSubmit={handleSubmit}
                >
                    {user.data.organizationName === '' && (
                        <Input
                            label="Organization name"
                            name="organizationName"
                            placeholder="Enter company name"
                            disabled={isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                            defaultValue={user.data.organizationName}
                        />
                    )}
                    <Select
                        label="What's your role?"
                        name="jobTitle"
                        disabled={isLoading}
                        options={jobTitles}
                        rules={{
                            required: 'Required field',
                        }}
                    />
                    <Checkbox
                        name="isMarketingOptedIn"
                        disabled={isLoading}
                        defaultValue
                        checkboxProps={{
                            label: 'Keep me updated on new Lightdash features',
                            style: { color: Colors.GRAY1, margin: 0 },
                        }}
                    />
                    {health.data?.mode !== LightdashMode.CLOUD_BETA && (
                        <Checkbox
                            name="isTrackingAnonymized"
                            disabled={isLoading}
                            defaultValue={false}
                            checkboxProps={{
                                label: 'Anonymize my usage data',
                                style: { color: Colors.GRAY1, margin: 0 },
                            }}
                        />
                    )}
                    <div
                        style={{ display: 'flex', justifyContent: 'flex-end' }}
                    >
                        <BigButton
                            style={{ minWidth: 82 }}
                            type="submit"
                            intent={Intent.PRIMARY}
                            text="Next"
                            loading={isLoading}
                        />
                    </div>
                </Form>
            </UserCompletionModalCard>
        </Overlay>
    );
};

export default UserCompletionModal;
