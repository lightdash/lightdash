import { SignInSubjectBasis, type SharedSignInExpiry } from '@lightdash/common';
import { Anchor, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import useApp from '../../../providers/App/useApp';

export const SharedSignInExpiredMessage: FC<{
    message: string;
    expiry: SharedSignInExpiry;
    onNavigate?: () => void;
}> = ({ message, expiry, onNavigate }) => {
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const isSubject =
        !!expiry.subjectUserUuid &&
        expiry.subjectUserUuid === user.data?.userUuid &&
        (expiry.subjectBasis === SignInSubjectBasis.RECORDED ||
            expiry.subjectBasis === SignInSubjectBasis.PROJECT_CREATOR);

    return (
        <Stack gap={4} align="flex-start">
            <Text mb={0} fz="xs">
                {message}
            </Text>
            {isSubject && activeProjectUuid && (
                <Anchor
                    component={Link}
                    to={`/generalSettings/projectManagement/${activeProjectUuid}/settings`}
                    fz="xs"
                    fw={600}
                    onClick={onNavigate}
                >
                    Reconnect
                </Anchor>
            )}
        </Stack>
    );
};
