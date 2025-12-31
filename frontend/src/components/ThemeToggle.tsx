import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  // Initialize from localStorage or default to dark
  useEffect(() => {
    const saved = localStorage.getItem('codee-theme') as Theme | null;
    const initial = saved ?? 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('codee-theme', next);
  };

  return (
    <button aria-label="Toggle theme" onClick={toggle}>
      {theme === 'dark' ? 'Dark' : 'Light'} mode
    </button>
  );
}
