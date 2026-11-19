import { jsx as _jsx } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from '@/app/App';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/features/auth/auth-context';
import './index.css';
const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsx(App, {}) }) }) }) }) }));
