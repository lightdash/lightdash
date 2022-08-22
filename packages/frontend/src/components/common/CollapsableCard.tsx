import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import { FC } from 'react';
import { useToggle } from 'react-use';

type Props = {
    isOpenByDefault: boolean;
    title: string;
};

export const CollapsableCard: FC<Props> = ({
    isOpenByDefault,
    title,
    children,
}) => {
    const [isOpen, toggle] = useToggle(isOpenByDefault);
    return (
        <Card
            style={{ padding: 5, height: isOpen ? '100%' : 'auto' }}
            elevation={1}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                }}
            >
                <Button
                    icon={isOpen ? 'chevron-down' : 'chevron-right'}
                    minimal
                    onClick={toggle}
                />
                <H5 style={{ margin: 0, padding: 0 }}>{title}</H5>
            </div>
            <Collapse isOpen={isOpen}>{children}</Collapse>
        </Card>
    );
};
