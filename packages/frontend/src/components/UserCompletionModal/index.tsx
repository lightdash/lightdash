import { Colors, Intent, OptionProps, Overlay } from '@blueprintjs/core';
import { CompleteUserArgs, LightdashMode } from '@lightdash/common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useUserCompleteMutation } from '../../hooks/user/useUserCompleteMutation';
import { useApp } from '../../providers/AppProvider';
import Checkbox from '../ReactHookForm/Checkbox';
import Form from '../ReactHookForm/Form';
import {
    InputField,
    InputSelect,
    SubmitButton,
    Subtitle,
    Title,
    UserCompletionModalCard,
} from './UserCompletionModal.styles';

function shuffleArray(arr: string[]) {
    return arr
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

const jobTitles: Array<string | OptionProps> = [
    { value: '', label: 'Select an option...' },
    ...shuffleArray([
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
    ]),
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
                <Title>Nearly there...</Title>
                <Subtitle>Tell us a bit more about yourself</Subtitle>
                <Form
                    name="complete_user"
                    methods={methods}
                    onSubmit={handleSubmit}
                >
                    {user.data.organizationName === '' && (
                        <InputField
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
                    <InputSelect
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
                    <SubmitButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Next"
                        loading={isLoading}
                    />
                </Form>
            </UserCompletionModalCard>
        </Overlay>
    );
};

export default UserCompletionModal;
