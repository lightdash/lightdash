import { useDebouncedValue } from '@mantine/hooks';
import { useState } from 'react';

// The input's text, and the search it settles into after 150ms, as the
// shipped field picker debounces, so a long list filters once per pause
export const usePickerSearch = () => {
    const [input, setInput] = useState('');
    const [search] = useDebouncedValue(input, 150);
    return { input, setInput, search };
};
