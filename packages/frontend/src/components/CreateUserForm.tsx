import {
    Button,
    FormGroup,
    HTMLSelect,
    InputGroup,
    Intent,
    Switch,
} from '@blueprintjs/core';
import { CreateOrganizationUser, LightdashMode, validateEmail } from 'common';
import React, { FC, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import PasswordInput from './PasswordInput';

type Props = {
    isLoading: boolean;
    onCreate: (data: Omit<CreateOrganizationUser, 'inviteCode'>) => void;
};

const CreateUserForm: FC<Props> = ({ isLoading, onCreate }) => {
    const { showToastError, health } = useApp();
    const [firstName, setFirstName] = useState<string>();
    const [lastName, setLastName] = useState<string>();
    const [email, setEmail] = useState<string>();
    const [jobTitle, setJobTitle] = useState<string>();
    const [password, setPassword] = useState<string>();
    const [isMarketingOptedIn, setIsMarketingOptedIn] = useState<boolean>(true);
    const [isTrackingAnonymized, setIsTrackingAnonymized] =
        useState<boolean>(false);

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

    const handleLogin = () => {
        if (!firstName || !lastName || !jobTitle || !email || !password) {
            showToastError({
                title: 'Invalid form data',
                subtitle: `Required fields: first name, last name, job title, email and password`,
            });
            return;
        }

        if (!validateEmail(email)) {
            showToastError({
                title: 'Invalid form data',
                subtitle: 'Invalid email',
            });
            return;
        }

        onCreate({
            firstName,
            lastName,
            jobTitle,
            email,
            password,
            isMarketingOptedIn,
            isTrackingAnonymized,
        });
    };

    return (
        <>
            <FormGroup
                label="First name"
                labelFor="first-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="first-name-input"
                    placeholder="Jane"
                    type="text"
                    required
                    disabled={isLoading}
                    onChange={(e) => setFirstName(e.target.value)}
                />
            </FormGroup>
            <FormGroup
                label="Last name"
                labelFor="last-name-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="last-name-input"
                    placeholder="Doe"
                    type="text"
                    required
                    disabled={isLoading}
                    onChange={(e) => setLastName(e.target.value)}
                />
            </FormGroup>
            <FormGroup
                label="Job title"
                labelFor="job-title-input"
                labelInfo="(required)"
            >
                <HTMLSelect
                    fill
                    id="job-title-input"
                    options={jobTitles}
                    required
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setJobTitle(e.target.value)
                    }
                />
            </FormGroup>
            <FormGroup
                label="Email"
                labelFor="email-input"
                labelInfo="(required)"
            >
                <InputGroup
                    id="email-input"
                    placeholder="Email"
                    type="email"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                />
            </FormGroup>
            <PasswordInput
                label="Password"
                placeholder="Enter your password..."
                required
                disabled={isLoading}
                value={password}
                onChange={setPassword}
            />
            <Switch
                style={{ marginTop: '20px' }}
                defaultChecked
                disabled={isLoading}
                label="Keep me updated on new Lightdash features"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setIsMarketingOptedIn(e.target.checked)
                }
            />
            {health.data?.mode !== LightdashMode.CLOUD_BETA && (
                <Switch
                    style={{ marginTop: '20px' }}
                    disabled={isLoading}
                    label="Anonymize my usage data. We collect data for measuring product usage."
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setIsTrackingAnonymized(e.target.checked)
                    }
                />
            )}
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Create"
                onClick={handleLogin}
                loading={isLoading}
            />
        </>
    );
};

export default CreateUserForm;
