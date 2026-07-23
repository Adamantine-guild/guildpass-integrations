export const accessKeys = {
  all: ['access'] as const,
  decisions: (env: string, address: string) => ['access', env, 'decision', address] as const,
  decision: (env: string, address: string, resourceId: string) =>
    ['access', env, 'decision', address, resourceId] as const,
}
