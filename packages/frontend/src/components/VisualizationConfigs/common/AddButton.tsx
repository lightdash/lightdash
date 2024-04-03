import { Button } from '@mantine/core';

export const AddButton = ({ onClick }: { onClick: () => void }) => (
    <Button
        size="sm"
        variant="subtle"
        compact
        leftIcon="+"
        onClick={onClick}
        styles={{
            leftIcon: {
                marginRight: 2,
            },
        }}
    >
        Add
    </Button>
);
