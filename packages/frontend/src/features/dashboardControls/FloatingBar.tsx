import { ActionBar, Paper, type ElementProps } from '@mantine/core';
import clsx from 'clsx';
import { type FC, type ReactNode, type Ref } from 'react';
import { EDIT_BAR_POSITION } from '../../components/common/Dashboard/editBarPosition';
import useEmbed from '../../ee/providers/Embed/useEmbed';

type Props = ElementProps<'div'> & {
    ref?: Ref<HTMLDivElement>;
    'aria-label': string;
    children: ReactNode;
};

// The dashboard edit toolbar's bar (Mantine's ActionBar), in its spot. An SDK
// embed is a box in the host's page, where a fixed bar would pin to the host's
// window: there the same box stays in the flow of the bar host (`useBarHost`)
export const FloatingBar: FC<Props> = ({ className, ...props }) => {
    const { mode } = useEmbed();
    if (mode === 'sdk')
        return (
            <Paper
                shadow="md"
                className={clsx(ActionBar.classes.root, className)}
                data-dashboard-floating-bar
                {...props}
            />
        );
    return (
        <ActionBar
            opened
            shadow="md"
            position={EDIT_BAR_POSITION}
            className={className}
            data-dashboard-floating-bar
            {...props}
        />
    );
};
