import { type GitBranch } from '@lightdash/common';
import { Button, Group, Select, Text } from '@mantine-8/core';
import { IconGitBranch, IconLock, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type BranchSelectorProps = {
    branches: GitBranch[];
    currentBranch: string | null;
    onBranchChange: (branch: string) => void;
    onCreateBranch: () => void;
    isLoading?: boolean;
};

const BranchSelector: FC<BranchSelectorProps> = ({
    branches,
    currentBranch,
    onBranchChange,
    onCreateBranch,
    isLoading,
}) => {
    const currentBranchData = branches.find((b) => b.name === currentBranch);
    const isProtected = currentBranchData?.isProtected ?? false;

    const branchOptions = branches.map((branch) => ({
        value: branch.name,
        label: branch.name,
    }));

    return (
        <Group gap="xs" wrap="nowrap">
            <Select
                flex={1}
                size="xs"
                placeholder="Select branch"
                leftSection={<MantineIcon icon={IconGitBranch} />}
                rightSection={
                    isProtected ? (
                        <MantineIcon icon={IconLock} color="ldGray.5" />
                    ) : undefined
                }
                data={branchOptions}
                value={currentBranch}
                onChange={(value) => value && onBranchChange(value)}
                disabled={isLoading}
                searchable
            />
            {isProtected && (
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={onCreateBranch}
                    disabled={isLoading}
                >
                    <Text fz="xs">Create branch</Text>
                </Button>
            )}
        </Group>
    );
};

export default BranchSelector;
