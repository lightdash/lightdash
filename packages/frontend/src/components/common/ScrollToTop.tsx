import { ActionIcon, Affix, Transition } from '@mantine-8/core';
import { IconArrowUp } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from './MantineIcon';

type ScrollToTopProps = {
    /**
     * Whether to show the button
     */
    show: boolean;
    /**
     * Optional scroll container. Defaults to window scrolling.
     */
    scrollContainer?: HTMLElement | null;
    /**
     * Distance from the bottom of the viewport in pixels.
     */
    bottom?: number;
};

/**
 * Floating Action Button that appears at the bottom-right
 * and scrolls to the top of the page when clicked
 */
export const ScrollToTop: FC<ScrollToTopProps> = ({
    show,
    scrollContainer,
    bottom = 24,
}) => {
    const handleScrollToTop = () => {
        if (!scrollContainer) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        } else {
            scrollContainer.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }
    };

    return (
        <Affix position={{ bottom, right: 34 }} zIndex={50}>
            <Transition transition="slide-up" mounted={show}>
                {(transitionStyles) => (
                    <ActionIcon
                        size={40}
                        radius="xl"
                        variant="default"
                        color="gray"
                        style={transitionStyles}
                        onClick={handleScrollToTop}
                        aria-label="Scroll to top"
                    >
                        <MantineIcon icon={IconArrowUp} />
                    </ActionIcon>
                )}
            </Transition>
        </Affix>
    );
};
