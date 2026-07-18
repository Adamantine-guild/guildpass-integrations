import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { mapResource } from '../lib/api/mappers'

describe('Resource Content Contract', () => {
  it('maps resource with content blocks', () => {
    const raw = {
      id: 'r1',
      title: 'Guide',
      content: [
        { type: 'text', body: 'Hello world' },
        { type: 'link', title: 'Google', url: 'https://google.com' },
        { type: 'unsupported', someField: 'value' }
      ]
    }
    const result = mapResource(raw)
    assert.deepEqual(result.content, [
      { type: 'text', body: 'Hello world' },
      { type: 'link', title: 'Google', url: 'https://google.com' },
      { type: 'unsupported', someField: 'value' } as any
    ])
  })

  it('handles empty content', () => {
    const raw = { id: 'r2', title: 'Empty', content: [] }
    const result = mapResource(raw)
    assert.deepEqual(result.content, [])
  })

  it('handles missing content', () => {
    const raw = { id: 'r3', title: 'Missing' }
    const result = mapResource(raw)
    assert.equal(result.content, undefined)
  })
})
