/** 侧栏栏目顺序：用户可在设置页上下调整，持久化在 settings 表 */

export const DEFAULT_SIDEBAR_ORDER = ['import', 'stats', 'memory', 'placement', 'cities', 'trips'] as const

export type SidebarSectionId = (typeof DEFAULT_SIDEBAR_ORDER)[number]

export const SIDEBAR_SECTION_NAMES: Record<SidebarSectionId, string> = {
  import: '导入',
  stats: '统计',
  memory: '回忆',
  placement: '手动标点',
  cities: '点亮的城市',
  trips: '旅行行程',
}

/** 归一化：过滤未知 id、把缺失的默认栏目补到末尾；非法输入回退默认顺序 */
export function normalizeSidebarOrder(order: unknown): string[] {
  if (!Array.isArray(order)) return [...DEFAULT_SIDEBAR_ORDER]
  const valid = order.filter((id): id is SidebarSectionId =>
    (DEFAULT_SIDEBAR_ORDER as readonly string[]).includes(id),
  )
  const missing = DEFAULT_SIDEBAR_ORDER.filter((id) => !valid.includes(id))
  return [...valid, ...missing]
}
