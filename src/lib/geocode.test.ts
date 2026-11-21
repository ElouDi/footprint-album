import { describe, expect, it } from 'vitest'
import { formatAddressParts } from './geocode'

describe('formatAddressParts', () => {
  it('拼出「都道府 · 市 · 区」并去重', () => {
    expect(formatAddressParts({ state: '東京都', city: '港区', suburb: '芝公園' })).toBe('東京都 · 港区 · 芝公園')
  })

  it('市与区同名时去重', () => {
    expect(formatAddressParts({ city: '京都市', suburb: '京都市' })).toBe('京都市')
  })

  it('只有市级信息也能返回', () => {
    expect(formatAddressParts({ city: 'Kyoto' })).toBe('Kyoto')
  })

  it('空地址返回 null', () => {
    expect(formatAddressParts({})).toBeNull()
  })

  it('跳过纯空白字段', () => {
    expect(formatAddressParts({ city: '  ', suburb: '下京区' })).toBe('下京区')
  })
})
