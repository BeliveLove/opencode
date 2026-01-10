import { defineConfig, PluginOption } from "vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"
import path from "path"
import { fileURLToPath } from "url"

function fixSolidStartWindowsAbsolutePathEscapes(): PluginOption {
  return {
    name: "fix-solidstart-windows-absolute-path-escapes",
    enforce: "pre",
    async resolveId(source) {
      if (process.platform !== "win32") return
      // When a Windows path is injected into JS source without escaping, sequences like "\n" become newlines at runtime.
      // This breaks Rollup resolution because the import specifier string value is no longer a valid path.
      if (!/^[A-Za-z]:/.test(source)) return
      if (!/[\n\r\t]/.test(source)) return

      const distIndex = fileURLToPath(import.meta.resolve("@solidjs/start"))
      const distDir = path.dirname(distIndex) // .../dist
      const runtime = /server-[a-z-]*runtime/.exec(source)?.[0]
      if (runtime) return path.join(distDir, "server", `${runtime}.js`)
    },
  }
}

function normalizeWindowsAbsoluteImports(): PluginOption {
  return {
    name: "normalize-windows-absolute-imports",
    enforce: "post",
    transform(code) {
      if (process.platform !== "win32") return
      if (
        !code.includes(":\\") &&
        !code.includes("from \"") &&
        !code.includes("from '") &&
        !code.includes("import \"") &&
        !code.includes("import '")
      ) {
        return
      }

      let next = code.replaceAll(
        /((?:from|import)\s+)(['"])([A-Za-z]:\\[^'"]*)\2/g,
        (_m, prefix: string, quote: string, spec: string) => {
          const normalized = spec.replaceAll("\\", "/")
          return `${prefix}${quote}${normalized}${quote}`
        },
      )

      next = next.replaceAll(
        /(import\(\s*)(['"])([A-Za-z]:\\[^'"]*)\2(\s*\))/g,
        (_m, prefix: string, quote: string, spec: string, suffix: string) => {
          const normalized = spec.replaceAll("\\", "/")
          return `${prefix}${quote}${normalized}${quote}${suffix}`
        },
      )

      if (next === code) return
      return { code: next, map: null }
    },
  }
}

function normalizeWindowsDefineStrings(): PluginOption {
  return {
    name: "normalize-windows-define-strings",
    enforce: "post",
    config(config) {
      if (process.platform !== "win32") return
      const normalize = (define: Record<string, unknown> | undefined) => {
        if (!define) return
        for (const [key, value] of Object.entries(define)) {
          if (typeof value !== "string") continue
          // Fix invalid JS string literals like "D:\code\..." (unescaped backslashes).
          if (!/^"[A-Za-z]:\\/.test(value)) continue
          const inner = value.startsWith("\"") && value.endsWith("\"") ? value.slice(1, -1) : value
          const normalizedInner = inner.replaceAll("\\", "/")
          define[key] = JSON.stringify(normalizedInner)
        }
      }

      normalize(config.define as Record<string, unknown> | undefined)
      normalize((config.esbuild as any)?.define as Record<string, unknown> | undefined)
    },
  }
}

export default defineConfig({
  plugins: [
    solidStart() as PluginOption,
    fixSolidStartWindowsAbsolutePathEscapes(),
    normalizeWindowsAbsoluteImports(),
    normalizeWindowsDefineStrings(),
    nitro({
      compatibilityDate: "2024-09-19",
      preset: "cloudflare_module",
      cloudflare: {
        nodeCompat: true,
      },
    }),
  ],
  server: {
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
    minify: false,
  },
})
