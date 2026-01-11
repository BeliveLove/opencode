import { Instance } from "@/project/instance"

const MIRROR_REGISTRY = "https://registry.npmmirror.com"

async function runInstall(cmd: string[], env: Record<string, string | undefined>) {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: Instance.directory,
    env: { ...process.env, ...env },
  })
  await proc.exited
  const stdout = await Bun.readableStreamToText(proc.stdout)
  const stderr = await Bun.readableStreamToText(proc.stderr)
  if (proc.exitCode !== 0) {
    const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n")
    throw new Error(`Failed to install Mermaid CLI (exit ${proc.exitCode})${details ? `:\n${details}` : ""}`)
  }
}

export async function ensureMermaidCli() {
  let mmdcPath = Bun.which("mmdc")
  if (mmdcPath) return mmdcPath

  const npmPath = Bun.which("npm")
  if (npmPath) {
    await runInstall([npmPath, "i", "-g", "@mermaid-js/mermaid-cli", `--registry=${MIRROR_REGISTRY}`], {
      npm_config_registry: MIRROR_REGISTRY,
    })
    mmdcPath = Bun.which("mmdc")
    if (mmdcPath) return mmdcPath
  }

  const bunPath = Bun.which("bun")
  if (bunPath) {
    await runInstall([bunPath, "add", "-g", "@mermaid-js/mermaid-cli"], {
      BUN_CONFIG_REGISTRY: MIRROR_REGISTRY,
      npm_config_registry: MIRROR_REGISTRY,
    })
    mmdcPath = Bun.which("mmdc")
    if (mmdcPath) return mmdcPath
  }

  throw new Error(
    [
      "Mermaid CLI (mmdc) not found.",
      "Install it first:",
      `- npm i -g @mermaid-js/mermaid-cli --registry=${MIRROR_REGISTRY}`,
      "- or bun add -g @mermaid-js/mermaid-cli",
    ].join("\n"),
  )
}
