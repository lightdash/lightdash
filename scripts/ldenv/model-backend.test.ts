import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendMode, savedBackendMode } from './model';

test('new backend selection defaults to bundle while legacy saved mode remains tsx', () => {
    assert.equal(backendMode(undefined), 'bundle');
    assert.equal(savedBackendMode(undefined), 'tsx');
    assert.equal(savedBackendMode('bundle'), 'bundle');
    assert.equal(savedBackendMode('tsx'), 'tsx');
    assert.throws(() => backendMode('bundel'), /Backend mode/);
    assert.throws(() => savedBackendMode(''), /Backend mode/);
});
