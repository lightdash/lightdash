/**
 * Monkey patch to prevent crashes from browser translation extensions (e.g., Google Translate).
 * When translation modifies the DOM, React's virtual DOM becomes out of sync with the actual DOM,
 * causing errors like "Failed to execute 'insertBefore' on 'Node'".
 * This patch makes these operations fail silently instead of crashing the app.
 * @see https://martijnhols.nl/blog/everything-about-google-translate-crashing-react
 * @see https://github.com/facebook/react/issues/11538
 */
if (typeof Node !== 'undefined' && Node.prototype) {
    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (child.parentNode !== this) {
            console.warn(
                '[DOM Monkey Patch] Suppressed removeChild error (likely caused by Google Translate)',
            );
            return child;
        }
        return originalRemoveChild.call(this, child) as T;
    };

    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(
        newNode: T,
        referenceNode: Node | null,
    ): T {
        if (referenceNode && referenceNode.parentNode !== this) {
            console.warn(
                '[DOM Monkey Patch] Suppressed insertBefore error (likely caused by Google Translate)',
            );
            return newNode;
        }
        return originalInsertBefore.call(this, newNode, referenceNode) as T;
    };
}

import '@mantine-8/core/styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found!');

const root = createRoot(container);

root.render(
    <StrictMode>
        <App />
    </StrictMode>,
);
