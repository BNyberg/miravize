import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
export function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const current = theme === 'system' ? resolvedTheme : theme;
    return (_jsxs(Button, { variant: "ghost", size: "icon", onClick: () => setTheme(current === 'dark' ? 'light' : 'dark'), "aria-label": "Toggle theme", children: [_jsx(Sun, { className: "size-4 dark:hidden", "aria-hidden": "true" }), _jsx(Moon, { className: "hidden size-4 dark:block", "aria-hidden": "true" })] }));
}
