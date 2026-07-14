import { Anchor } from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useOnboardingWizard } from '../../context/wizardContext';

const OtherWaysToConnectLink: FC = () => {
    const { clearMethod } = useOnboardingWizard();
    return (
        <Anchor
            size="sm"
            onClick={() => clearMethod()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
            <MantineIcon icon={IconArrowLeft} size="sm" />
            Other ways to connect
        </Anchor>
    );
};

export default OtherWaysToConnectLink;
