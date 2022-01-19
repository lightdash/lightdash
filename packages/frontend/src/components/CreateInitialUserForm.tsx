import { Button, FormGroup, InputGroup, Intent } from '@blueprintjs/core';
import { CreateInitialUserArgs, validateEmail } from 'common';
import React, { FC, useState } from 'react';
import { useApp } from '../providers/AppProvider';
import PasswordInput from './PasswordInput';

type CreateInitialUserCallback = (data: CreateInitialUserArgs) => void;
type CreateUserCallback = (
    data: Omit<CreateInitialUserArgs, 'organizationName'>,
) => void;

type Props = {
    isLoading: boolean;
    onCreate: CreateInitialUserCallback | CreateUserCallback;
};

const CreateInitialUserForm: FC<Props> = ({ isLoading, onCreate }) => {
    const { showToastError } = useApp();
    const [firstName, setFirstName] = useState<string>();
    const [lastName, setLastName] = useState<string>();
    const [email, setEmail] = useState<string>();
    const [password, setPassword] = useState<string>();

    const handleLogin = () => {
        if (!firstName || !lastName || !email || !password) {
            showToastError({
                title: 'Invalid form data',
                subtitle: `Required fields: first name, last name, email and password`,
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
            email,
            password,
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

export default CreateInitialUserForm;
