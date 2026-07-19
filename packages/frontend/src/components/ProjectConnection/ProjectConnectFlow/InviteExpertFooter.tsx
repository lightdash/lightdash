import { Anchor, Text } from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { type FC } from 'react';
import SetupInviteModal from './SetupInviteModal';

const InviteExpertFooter: FC = () => {
    const [opened, { open, close }] = useDisclosure(false);

    return (
        <>
            <Text c="dimmed" w={420} mx="auto" ta="center">
                This step is best carried out by your organization’s analytics
                experts. If this is not you,{' '}
                <Anchor component="button" type="button" onClick={open}>
                    invite them to help you set up.
                </Anchor>
            </Text>
            <SetupInviteModal opened={opened} onClose={close} />
        </>
    );
};

export default InviteExpertFooter;
