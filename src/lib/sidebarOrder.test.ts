import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDEBAR_ORDER, normalizeSidebarOrder } from './sidebarOrder'

describe('normalizeSidebarOrder', () => {
  it('合法顺序原样通过', () => {
    const order = ['trips', 'cities', 'memory', 'stats', 'import', 'placement']
    expect(normalizeSidebarOrder(order)).toEqual(order)
  })

  it('缺失的默认栏目补到末尾', () => {
    expect(normalizeSidebarOrder(['memory', 'trips'])).toEqual([
      'memory',
      'trips',
      'import',
      'stats',
      'placement',
      'cities',
    ])
  })

  it('未知 id 被过滤', () => {
    const order = ['trips', 'hacker', 'import', 'stats', 'cities', 'memory', 'placement']
    expect(normalizeSidebarOrder(order)).not.toContain('hacker')
    expect(normalizeSidebarOrder(order)).toHaveLength(6)
  })

  it('非数组输入回退默认顺序', () => {
    expect(normalizeSidebarOrder(undefined)).toEqual([...DEFAULT_SIDEBAR_ORDER])
    expect(normalizeSidebarOrder('trips')).toEqual([...DEFAULT_SIDEBAR_ORDER])
  })
})
