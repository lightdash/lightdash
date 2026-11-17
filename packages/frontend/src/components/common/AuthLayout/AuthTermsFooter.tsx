import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';

/** "By continuing, you agree to our Terms of Service and Privacy Policy" under the login and signup cards. */
const AuthTermsFooter: FC<{
    isNewLayout: boolean;
    /** Lead-in for the legacy layout's two-line version. */
    legacyLead?: string;
}> = ({ isNewLayout, legacyLead = 'By creating an account, you agree to' }) =>
    isNewLayout ? (
        <Text c="dimmed" ta="center" fz="xs">
            By continuing, you agree to our{' '}
            <Anchor
                href="https://www.lightdash.com/terms-of-service"
                target="_blank"
                inherit
            >
                Terms of Service
            </Anchor>{' '}
            and{' '}
            <Anchor
                href="https://www.lightdash.com/privacy-policy"
                target="_blank"
                inherit
            >
                Privacy Policy
            </Anchor>
            .
        </Text>
    ) : (
        <Text c="dimmed" ta="center" fz="sm" fw={500}>
            {legacyLead}
            <br />
            our{' '}
            <Anchor
                href="https://www.lightdash.com/privacy-policy"
                target="_blank"
                fz="sm"
                fw={500}
            >
                Privacy Policy
            </Anchor>{' '}
            and our{' '}
            <Anchor
                href="https://www.lightdash.com/terms-of-service"
                target="_blank"
                fz="sm"
                fw={500}
            >
                Terms of Service.
            </Anchor>
        </Text>
    );

export default AuthTermsFooter;
