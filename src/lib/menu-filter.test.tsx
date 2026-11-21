import { fireEvent, render } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { filterMenuNodes, MenuFilterField } from './menu-filter'

function Item({ children }: { children?: ReactNode }) {
  return createElement('div', null, children)
}

describe('menu filter', () => {
  it('counts the items that match the query', () => {
    const filtered = filterMenuNodes(
      createElement(Item, null, 'Design'),
      'des',
      { item: Item },
    )
    expect(filtered.itemCount).toBe(1)

    const children = [
      createElement(Item, { key: 'design' }, 'Design'),
      createElement(Item, { key: 'billing' }, 'Billing'),
    ]
    expect(filterMenuNodes(children, 'bill', { item: Item }).itemCount).toBe(1)
    expect(filterMenuNodes(children, '', { item: Item }).itemCount).toBe(2)
  })

  it('reports what was typed', () => {
    const onChange = vi.fn()
    const view = render(createElement(MenuFilterField, { value: '', onChange }))
    fireEvent.change(view.getByLabelText('Filter'), { target: { value: 'north' } })
    expect(onChange).toHaveBeenCalledWith('north')
  })
})
