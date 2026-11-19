import { jsx as _jsx } from "react/jsx-runtime";
import { Children, cloneElement, Fragment, isValidElement, useEffect, useRef, } from 'react';
export function collectText(node) {
    if (node == null || typeof node === 'boolean')
        return '';
    if (typeof node === 'string' || typeof node === 'number')
        return String(node);
    if (Array.isArray(node))
        return node.map(collectText).join(' ');
    if (isValidElement(node))
        return collectText(node.props.children);
    return '';
}
function flatten(children) {
    const out = [];
    Children.forEach(children, (child) => {
        if (isValidElement(child) && child.type === Fragment) {
            out.push(...flatten(child.props.children));
            return;
        }
        out.push(child);
    });
    return out;
}
function isKind(node, type) {
    return Boolean(type) && isValidElement(node) && node.type === type;
}
function hideNode(child) {
    return cloneElement(child, {
        hidden: true,
        disabled: true,
        className: [child.props.className, 'hidden'].filter(Boolean).join(' '),
    });
}
export function filterMenuNodes(children, query, kinds) {
    const q = query.trim().toLowerCase();
    const list = flatten(children);
    if (!q) {
        let itemCount = 0;
        for (const child of list) {
            if (isKind(child, kinds.item))
                itemCount += 1;
            else if (isValidElement(child)) {
                itemCount += filterMenuNodes(child.props.children, '', kinds).itemCount;
            }
        }
        return { children, itemCount };
    }
    const kept = [];
    let itemCount = 0;
    for (const child of list) {
        if (!isValidElement(child)) {
            if (child != null && child !== false)
                kept.push(child);
            continue;
        }
        const text = collectText(child).toLowerCase();
        const option = isKind(child, kinds.item) || typeof child.props.value === 'string';
        if (option) {
            if (text.includes(q)) {
                kept.push(child);
                itemCount += 1;
            }
            else {
                kept.push(hideNode(child));
            }
            continue;
        }
        if (isKind(child, kinds.group)) {
            const nested = filterMenuNodes(child.props.children, query, kinds);
            if (nested.itemCount === 0)
                continue;
            kept.push(cloneElement(child, { children: nested.children }));
            itemCount += nested.itemCount;
            continue;
        }
        kept.push(child);
    }
    return { children: kept, itemCount };
}
const NAV = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter']);
function menuRoot(from) {
    return from.closest('[role="listbox"], [role="menu"]');
}
function visibleOptions(root) {
    return [...root.querySelectorAll('[role="option"], [role="menuitem"]')].filter((node) => {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true')
            return false;
        if (node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('data-disabled'))
            return false;
        if (node.classList.contains('hidden'))
            return false;
        return true;
    });
}
function paintHighlight(nodes, index) {
    nodes.forEach((node, i) => {
        if (i === index) {
            node.setAttribute('data-highlighted', '');
            node.classList.add('bg-muted');
            node.scrollIntoView({ block: 'nearest' });
        }
        else {
            node.removeAttribute('data-highlighted');
            node.classList.remove('bg-muted');
        }
    });
}
function activate(node) {
    const opts = { bubbles: true, cancelable: true, pointerType: 'mouse' };
    node.dispatchEvent(new PointerEvent('pointerdown', opts));
    node.dispatchEvent(new PointerEvent('pointerup', opts));
}
export function MenuFilterField({ value, onChange, }) {
    const input = useRef(null);
    const index = useRef(-1);
    useEffect(() => {
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => {
                input.current?.focus({ preventScroll: true });
            });
        });
        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, []);
    useEffect(() => {
        const field = input.current;
        const root = field ? menuRoot(field) : null;
        if (root) {
            index.current = -1;
            paintHighlight(visibleOptions(root), -1);
        }
        const timer = window.setTimeout(() => {
            input.current?.focus({ preventScroll: true });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [value]);
    function onKeyDownCapture(event) {
        if (event.key === 'Escape')
            return;
        event.stopPropagation();
        if (!NAV.has(event.key))
            return;
        event.preventDefault();
        const root = menuRoot(event.currentTarget);
        if (!root)
            return;
        const nodes = visibleOptions(root);
        if (nodes.length === 0)
            return;
        if (event.key === 'Enter') {
            const current = index.current >= 0 ? nodes[index.current] : undefined;
            if (current)
                activate(current);
            if (document.activeElement !== input.current)
                input.current?.focus({ preventScroll: true });
            return;
        }
        if (event.key === 'Home')
            index.current = 0;
        else if (event.key === 'End')
            index.current = nodes.length - 1;
        else if (event.key === 'ArrowDown')
            index.current = index.current < 0 ? 0 : Math.min(nodes.length - 1, index.current + 1);
        else if (event.key === 'ArrowUp')
            index.current = Math.max(0, (index.current < 0 ? 0 : index.current) - 1);
        paintHighlight(nodes, index.current);
        if (document.activeElement !== input.current)
            input.current?.focus({ preventScroll: true });
    }
    function onBlur(event) {
        const next = event.relatedTarget;
        if (!(next instanceof HTMLElement))
            return;
        const root = menuRoot(event.currentTarget);
        if (!root?.contains(next))
            return;
        const role = next.getAttribute('role');
        if (role !== 'option' && role !== 'menuitem')
            return;
        queueMicrotask(() => input.current?.focus({ preventScroll: true }));
    }
    return (_jsx("div", { className: "border-b border-border p-1", children: _jsx("input", { ref: input, value: value, onChange: (event) => onChange(event.target.value), placeholder: "Filter", "aria-label": "Filter", autoFocus: true, className: "h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors duration-75 hover:bg-muted placeholder:text-muted-foreground", onKeyDownCapture: onKeyDownCapture, onBlur: onBlur }) }));
}
