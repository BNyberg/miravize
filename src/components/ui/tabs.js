import { jsx as _jsx } from "react/jsx-runtime";
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';
const Tabs = TabsPrimitive.Root;
function TabsList({ className, ...props }) {
    return (_jsx(TabsPrimitive.List, { className: cn('inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1', className), ...props }));
}
function TabsTrigger({ className, ...props }) {
    return (_jsx(TabsPrimitive.Trigger, { className: cn('inline-flex items-center justify-center rounded-sm px-3 py-1 text-sm font-medium text-muted-foreground transition-colors duration-150 data-[state=active]:bg-background data-[state=active]:text-foreground', className), ...props }));
}
function TabsContent({ className, ...props }) {
    return _jsx(TabsPrimitive.Content, { className: cn('mt-3', className), ...props });
}
export { Tabs, TabsContent, TabsList, TabsTrigger };
