import { Button, Menu, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { type Kind } from './model';
import sharedClasses from './shared.module.css';
import { useAddSource } from './useAddSource';
import { type ViewModel } from './useSemanticStudio';

export const AddSourceButton: FC<{
    view: ViewModel;
    kind?: Kind;
}> = ({ view, kind }) => {
    const { options, pathOf, addInPlace } = useAddSource(view, kind);
    if (options.length === 0) return null;
    const button = {
        size: 'xs',
        variant: 'subtle',
        color: 'gray',
        className: sharedClasses.pressable,
        leftSection: <MantineIcon icon={IconPlus} size={14} />,
        children: 'Add',
    } as const;
    // A menu of one is a detour: Add goes straight to the only option.
    if (options.length === 1) {
        const [only] = options;
        const path = pathOf(only);
        return path ? (
            <Button {...button} component={Link} to={path} />
        ) : (
            <Button {...button} onClick={() => addInPlace(only)} />
        );
    }
    return (
        <>
            <Menu position="bottom-start">
                <Menu.Target>
                    <Button {...button} />
                </Menu.Target>
                <Menu.Dropdown>
                    {options.map((option) => {
                        const path = pathOf(option);
                        const content = (
                            <Text fz="sm" fw={500}>
                                {option.label}
                            </Text>
                        );
                        return path ? (
                            <Menu.Item
                                key={option.key}
                                component={Link}
                                to={path}
                                leftSection={option.icon}
                            >
                                {content}
                            </Menu.Item>
                        ) : (
                            <Menu.Item
                                key={option.key}
                                onClick={() => addInPlace(option)}
                                leftSection={option.icon}
                            >
                                {content}
                            </Menu.Item>
                        );
                    })}
                </Menu.Dropdown>
            </Menu>
        </>
    );
};
