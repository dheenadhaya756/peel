/** Resolve hook so plain `node` can run the extensionless imports the bundler resolves. */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|tsx|js|mjs|json)$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL)
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const candidate = new URL(base.href + ext)
      if (existsSync(fileURLToPath(candidate))) {
        return next(candidate.href, context)
      }
    }
  }
  return next(specifier, context)
}
