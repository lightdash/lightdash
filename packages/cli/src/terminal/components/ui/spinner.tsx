import cliSpinners, { type SpinnerName } from 'cli-spinners';
import { Text } from 'ink';
import { useAnimation } from '../../hooks/useAnimation';
import { useTheme } from './themeProvider';

type SpinnerProps = {
    type?: SpinnerName;
    color?: string;
};

export const Spinner = ({ type = 'dots', color }: SpinnerProps) => {
    const theme = useTheme();
    const spinner = cliSpinners[type] ?? cliSpinners.dots;
    const frame = useAnimation(spinner.interval);

    return (
        <Text color={color ?? theme.colors.primary}>
            {spinner.frames[frame % spinner.frames.length]}
        </Text>
    );
};
