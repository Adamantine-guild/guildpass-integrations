import './setup-env'
import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { MockAccessApi } from '../lib/api/mock'
import {
  MOCK_ACCESS_API_METHODS,
  MOCK_API_DOMAINS,
  MOCK_API_PUBLIC_REEXPORTS,
} from '../lib/api/mock/domains'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const MOCK_DIR = path.join(REPO_ROOT, 'lib', 'api', 'mock')
const AGGREGATOR = path.join(REPO_ROOT, 'lib', 'api', 'mock.ts')

function parseSyntactics(fileName: string, sourceText: string): readonly ts.Diagnostic[] {
  const options: ts.CompilerOptions = {
    noResolve: true,
    noLib: true,
    skipLibCheck: true,
    isolatedModules: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
  }

  const host: ts.CompilerHost = {
    getSourceFile: (requested, languageVersion) =>
      requested === fileName ? ts.createSourceFile(fileName, sourceText, languageVersion, true) : undefined,
    getDefaultLibFileName: () => '',
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getCanonicalFileName: (file) => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (file) => file === fileName,
    readFile: (file) => (file === fileName ? sourceText : undefined),
  }

  return ts.createProgram([fileName], options, host).getSyntacticDiagnostics()
}

function exportedNames(fileName: string, sourceText: string): Set<string> {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS)
  const names = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        names.add(element.name.text)
      }
      continue
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
    const isExport = Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    if (!isExport) continue

    if (ts.isFunctionDeclaration(statement) && statement.name) names.add(statement.name.text)
    else if (ts.isClassDeclaration(statement) && statement.name) names.add(statement.name.text)
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
    }
  }

  return names
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n',
  })
}

describe('mock API domain module structure', () => {
  test('each domain is an independently parseable module with clear exports', () => {
    for (const domain of MOCK_API_DOMAINS) {
      const filePath = path.join(MOCK_DIR, domain.file)
      assert.equal(existsSync(filePath), true, `missing domain module ${domain.file}`)

      const sourceText = readFileSync(filePath, 'utf8')
      const diagnostics = parseSyntactics(filePath, sourceText)
      assert.equal(
        diagnostics.length,
        0,
        `${domain.file} has syntax errors:\n${formatDiagnostics(diagnostics)}`,
      )

      const names = exportedNames(filePath, sourceText)
      for (const required of domain.requiredExports) {
        assert.equal(
          names.has(required),
          true,
          `${domain.file} must export ${required} (found: ${[...names].sort().join(', ')})`,
        )
      }
    }
  })

  test('a syntax error in one domain does not affect parsing of an unrelated domain', () => {
    const brokenDomain = MOCK_API_DOMAINS.find((domain) => domain.file === 'governance.ts')
    const healthyDomain = MOCK_API_DOMAINS.find((domain) => domain.file === 'members.ts')
    assert.ok(brokenDomain && healthyDomain)

    const brokenPath = path.join(MOCK_DIR, brokenDomain.file)
    const healthyPath = path.join(MOCK_DIR, healthyDomain.file)
    const brokenSource = `${readFileSync(brokenPath, 'utf8')}\n}}}\n`
    const healthySource = readFileSync(healthyPath, 'utf8')

    const brokenDiagnostics = parseSyntactics(brokenPath, brokenSource)
    const healthyDiagnostics = parseSyntactics(healthyPath, healthySource)

    assert.ok(brokenDiagnostics.length > 0, 'expected the malformed governance module to fail syntactic parse')
    assert.ok(
      brokenDiagnostics.every((diagnostic) => diagnostic.file?.fileName === brokenPath),
      'syntax diagnostics must stay scoped to the malformed domain file',
    )
    assert.equal(
      healthyDiagnostics.length,
      0,
      `unrelated domain ${healthyDomain.file} must still parse:\n${formatDiagnostics(healthyDiagnostics)}`,
    )
  })

  test('aggregator stays a thin composition layer and keeps public exports stable', () => {
    const aggregatorSource = readFileSync(AGGREGATOR, 'utf8')
    const aggregatorLines = aggregatorSource.split('\n').length
    assert.ok(
      aggregatorLines < 500,
      `mock.ts should remain a thin aggregator, not a 2000+ line monolith (was ${aggregatorLines} lines)`,
    )
    assert.match(aggregatorSource, /from '\.\/mock\//)
    assert.doesNotMatch(
      aggregatorSource,
      /export async function mockGetMeta/,
      'domain implementations must live in lib/api/mock/*.ts, not in the aggregator',
    )

    const names = exportedNames(AGGREGATOR, aggregatorSource)
    assert.equal(names.has('MockAccessApi'), true)
    for (const required of MOCK_API_PUBLIC_REEXPORTS) {
      assert.equal(names.has(required), true, `mock.ts must re-export ${required}`)
    }

    const api = new MockAccessApi('0xabc')
    for (const method of MOCK_ACCESS_API_METHODS) {
      assert.equal(
        typeof (api as unknown as Record<string, unknown>)[method],
        'function',
        `MockAccessApi must keep ${method} for existing consumers`,
      )
    }
  })

  test('application consumers depend on the API boundary, not mock domain files', () => {
    const indexSource = readFileSync(path.join(REPO_ROOT, 'lib', 'api', 'index.ts'), 'utf8')
    const navSource = readFileSync(path.join(REPO_ROOT, 'components', 'nav.tsx'), 'utf8')

    assert.match(indexSource, /from '\.\/mock-boundary'/)
    assert.doesNotMatch(indexSource, /from '\.\/mock\//)
    // nav.tsx may import from the top-level barrel (@/lib/api) or from the
    // narrow factory module (@/lib/api/factory) — both are API-boundary
    // imports that do not reach mock implementation details directly.
    assert.match(navSource, /from ["']@\/lib\/api(\/factory)?["']/)
    assert.doesNotMatch(navSource, /from ["']@\/lib\/api\/mock/)
  })
})
