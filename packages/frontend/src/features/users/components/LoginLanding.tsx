import { FC, useCallback, useEffect, useState } from 'react';

import { getEmailSchema, OpenIdIdentityIssuerType } from '@lightdash/common';

import {
    Anchor,
    Button,
    Card,
    Divider,
    Image,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { z } from 'zod';
import { ThirdPartySignInButton } from '../../../components/common/ThirdPartySignInButton';
import { useApp } from '../../../providers/AppProvider';
import LightdashLogo from '../../../svgs/lightdash-black.svg';
import { useFetchLoginOptions } from '../hooks/useLogin';

const Login: FC<{}> = () => {
    const { health } = useApp();
    const [fetchQueryEnabled, setFetchQueryEnabled] = useState(false);

    const form = useForm<{ email: string }>({
        initialValues: {
            email: '',
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
    });

    const { data, isLoading, isFetched, isSuccess } = useFetchLoginOptions({
        email: form.values.email,
        useQueryOptions: {
            enabled: fetchQueryEnabled && form.values.email !== '',
        },
    });

    useEffect(() => {
        if (isSuccess) {
            setFetchQueryEnabled(false);
        }
    }, [isSuccess]);

    console.log(data);

    const handleFormSubmit = useCallback(() => {
        setFetchQueryEnabled(true);
    }, []);

    const googleAuthAvailable = health.data?.auth.google.enabled;

    return (
        <>
            <Image
                src={LightdashLogo}
                alt="lightdash logo"
                width={130}
                mx="auto"
                my="lg"
            />
            <Card p="xl" radius="xs" withBorder shadow="xs">
                <Title order={3} ta="center" mb="md">
                    Sign in
                </Title>
                <form
                    name="login"
                    onSubmit={form.onSubmit(() => handleFormSubmit())}
                >
                    <Stack spacing="lg">
                        <TextInput
                            label="Email address"
                            name="email"
                            placeholder="Your email address"
                            required
                            {...form.getInputProps('email')}
                            disabled={isLoading && isFetched}
                        />
                        <Button
                            type="submit"
                            loading={isLoading && isFetched}
                            data-cy="signin-button"
                        >
                            Continue
                        </Button>
                        {googleAuthAvailable && (
                            <Stack>
                                <Divider
                                    my="sm"
                                    labelPosition="center"
                                    label={
                                        <Text color="gray.5" size="sm" fw={500}>
                                            OR
                                        </Text>
                                    }
                                />
                                <ThirdPartySignInButton
                                    key={OpenIdIdentityIssuerType.GOOGLE}
                                    providerName={
                                        OpenIdIdentityIssuerType.GOOGLE
                                    }
                                    // redirect={redirectUrl}
                                />
                            </Stack>
                        )}
                        <Text mx="auto" mt="md">
                            Don't have an account?{' '}
                            <Anchor href="/register">Sign up</Anchor>
                        </Text>
                    </Stack>
                </form>
            </Card>
        </>
    );
};

export default Login;
