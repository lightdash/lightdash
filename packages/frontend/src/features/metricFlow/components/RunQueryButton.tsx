import { Button } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import React, { FC } from 'react';

type Props = {
    isLoading: boolean;
    onClick: () => void;
};

const RunQueryButton: FC<Props> = ({ isLoading, onClick }) => {
    return (
        <Button
            size="lg"
            variant="filled"
            leftIcon={<IconPlayerPlay />}
            disabled={isLoading}
            loading={isLoading}
            onClick={onClick}
        >
            Run query
        </Button>
    );
};

export default RunQueryButton;
