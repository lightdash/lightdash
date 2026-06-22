import { Box, Stack } from '@mantine-8/core';
import { type FC } from 'react';
import { useMount } from 'react-use';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';

const SuccessAuthPopupResult: FC = () => {
    useMount(() => {
        setTimeout(() => {
            window.close();
        }, 2000);
    });

    return (
        <>
            <DocumentTitle title="Authentication" />

            <Stack>
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>

                <SuboptimalState
                    title={'Thank you for authenticating'}
                    description={'This window will close automatically'}
                />
            </Stack>
        </>
    );
};

export default SuccessAuthPopupResult;
