import test from 'node:test'
import assert from 'node:assert/strict'
import { generateHistoricalData, type Timeframe } from '../components/analytics/PortfolioChart'
import { MOCK_ASSETS } from '../components/analytics/AssetBreakdown'

test('generateHistoricalData creates correct number of data points for each timeframe', () => {
  const tf1D = generateHistoricalData('1D')
  assert.equal(tf1D.length, 24)

  const tf1W = generateHistoricalData('1W')
  assert.equal(tf1W.length, 7)

  const tf1M = generateHistoricalData('1M')
  assert.equal(tf1M.length, 30)

  const tf1Y = generateHistoricalData('1Y')
  assert.equal(tf1Y.length, 12)

  const tfALL = generateHistoricalData('ALL')
  assert.equal(tfALL.length, 36)
})

test('generateHistoricalData populates required properties on each data point', () => {
  const data = generateHistoricalData('1M')
  for (const point of data) {
    assert.equal(typeof point.timestamp, 'string')
    assert.equal(typeof point.dateLabel, 'string')
    assert.equal(typeof point.fullDate, 'string')
    assert.equal(typeof point.portfolioValue, 'number')
    assert.equal(typeof point.yieldEarned, 'number')
    assert.equal(typeof point.pnlPercentage, 'number')
    assert.ok(point.portfolioValue >= 0)
    assert.ok(point.yieldEarned >= 0)
  }
})

test('MOCK_ASSETS allocation percents sum approximately to 100%', () => {
  const totalPercent = MOCK_ASSETS.reduce((sum, asset) => sum + asset.allocationPercent, 0)
  assert.ok(Math.abs(totalPercent - 100) < 1, `Expected total allocation ~100%, got ${totalPercent}%`)
})

test('MOCK_ASSETS contains required metadata for strategy breakdown', () => {
  for (const asset of MOCK_ASSETS) {
    assert.ok(asset.name && asset.name.length > 0)
    assert.ok(asset.symbol && asset.symbol.length > 0)
    assert.ok(asset.value > 0)
    assert.ok(asset.apy > 0)
    assert.ok(asset.color.startsWith('#'))
    assert.ok(asset.strategy && asset.strategy.length > 0)
  }
})
