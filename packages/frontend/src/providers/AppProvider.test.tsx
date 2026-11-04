import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useApp from './App/useApp';

describe('AppProvider', () => {
    it('should throw if used outside of AppProvider', () => {
        expect(() => {
            renderHook(() => useApp());
        }).toThrow('useApp must be used within a AppProvider');
    });
});
