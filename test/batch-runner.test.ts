import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { runWithConcurrency } from '../lib/api/batch-runner'

describe('batch-runner', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5]
    const worker = async (item: number) => item * 2
    
    const results = await runWithConcurrency(items, 2, worker)
    
    assert.equal(results.length, 5)
    assert.deepEqual(results.map(r => r.status === 'fulfilled' ? r.value : null), [2, 4, 6, 8, 10])
  })

  it('bounds concurrency to the specified limit', async () => {
    const items = [1, 2, 3, 4, 5]
    let currentConcurrent = 0
    let maxConcurrent = 0
    
    const worker = async (item: number) => {
      currentConcurrent++
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent
      await new Promise(r => setTimeout(r, 10)) // simulate work
      currentConcurrent--
      return item
    }
    
    await runWithConcurrency(items, 2, worker)
    assert.equal(maxConcurrent, 2)
  })

  it('handles mixed success and failure', async () => {
    const items = [1, 2, 3]
    const worker = async (item: number) => {
      if (item === 2) throw new Error('fail')
      return item
    }
    
    const results = await runWithConcurrency(items, 2, worker)
    
    assert.equal(results[0].status, 'fulfilled')
    assert.equal(results[1].status, 'rejected')
    assert.equal(results[2].status, 'fulfilled')
  })

  it('stops dispatching when circuit breaker opens mid-batch', async () => {
    const items = [1, 2, 3, 4, 5]
    let calls = 0
    
    const circuitBreakerCheck = () => {
      // Simulate circuit opening after 2 calls
      return calls >= 2
    }
    
    const worker = async (item: number) => {
      calls++
      return item
    }
    
    const results = await runWithConcurrency(items, 1, worker, circuitBreakerCheck)
    
    assert.equal(calls, 2)
    assert.equal(results[0].status, 'fulfilled')
    assert.equal(results[1].status, 'fulfilled')
    assert.equal(results[2].status, 'skipped_circuit_open')
    assert.equal(results[3].status, 'skipped_circuit_open')
    assert.equal(results[4].status, 'skipped_circuit_open')
  })
})
