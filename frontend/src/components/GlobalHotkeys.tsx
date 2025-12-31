import { useEffect } from 'react';

// Global hotkeys: Ctrl/Cmd + K focuses the first input with class 'searchInput'
export default function GlobalHotkeys() {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toLowerCase().includes('mac');
            const isK = e.key === 'k' || e.key === 'K';
            const mod = isMac ? e.metaKey : e.ctrlKey;
            if (mod && isK) {
                // Focus the first search input if present
                const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input.searchInput, textarea.searchInput'));
                if (inputs.length > 0) {
                    const first = inputs[0];
                    first.focus();
                    e.preventDefault();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return null;
}
