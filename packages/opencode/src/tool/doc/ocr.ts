import z from "zod"
import path from "path"
import YAML from "yaml"
import { Tool } from "../tool"
import DESCRIPTION from "./ocr.txt"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

type OcrResult = {
  text: string
  confidence?: number
}

async function ensureReadableFile(ctx: Tool.Context, filePath: string) {
  if (!ctx.extra?.["bypassCwdCheck"] && !Filesystem.contains(Instance.directory, filePath)) {
    const parentDir = path.dirname(filePath)
    await ctx.ask({
      permission: "external_directory",
      patterns: [parentDir],
      always: [parentDir + "/*"],
      metadata: { filePath, parentDir },
    })
  }

  await ctx.ask({
    permission: "read",
    patterns: [filePath],
    always: ["*"],
    metadata: {},
  })
}

async function createOcrWorker(lang: string, langPath?: string) {
  const tesseract = await import("tesseract.js")
  const worker = await tesseract.createWorker(lang, 1, {
    logger: () => {},
    langPath,
  })
  return worker
}

async function ocrImageBuffer(buffer: Buffer, lang: string, langPath?: string): Promise<OcrResult> {
  const worker = await createOcrWorker(lang, langPath)
  try {
    const result = await worker.recognize(buffer)
    const text = result.data?.text ?? ""
    const confidence = result.data?.confidence
    return { text, confidence }
  } finally {
    await worker.terminate()
  }
}

async function ocrPdfBuffer(
  buffer: ArrayBuffer,
  opts: { lang: string; langPath?: string; maxPages?: number; scale: number; outputFormat: "text" | "markdown" },
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const canvasMod = await import("@napi-rs/canvas")
  const createCanvas = canvasMod.createCanvas
  if (!createCanvas) {
    throw new Error("Canvas backend not available for PDF OCR.")
  }

  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = ""
  }

  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const totalPages = doc.numPages
  const limit = Math.min(totalPages, opts.maxPages ?? totalPages)
  const pages: Array<{ page: number; text: string; confidence?: number }> = []

  const worker = await createOcrWorker(opts.lang, opts.langPath)
  try {
    for (let i = 1; i <= limit; i += 1) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: opts.scale })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      await page.render({ canvas: canvas as any, viewport }).promise
      const png = canvas.toBuffer("image/png")
      const result = await worker.recognize(png)
      const text = result.data?.text ?? ""
      const confidence = result.data?.confidence
      pages.push({ page: i, text, confidence })
    }
  } finally {
    await worker.terminate()
  }

  const outputParts: string[] = []
  for (const page of pages) {
    if (opts.outputFormat === "markdown") {
      outputParts.push(`# Page ${page.page}`, "", page.text.trim(), "")
    } else {
      outputParts.push(`Page ${page.page}`, page.text.trim(), "")
    }
  }

  return { pages, output: outputParts.join("\n").trim() }
}

export const DocOcrTool = Tool.define("doc_ocr", {
  description: DESCRIPTION,
  parameters: z.object({
    inputPath: z.string().describe("Path to the image or PDF for OCR"),
    outputFormat: z.enum(["text", "markdown"]).optional().describe("Output format hint (defaults to 'text')"),
    language: z.string().optional().describe("Tesseract language (default: eng)"),
    languagePath: z.string().optional().describe("Optional path/URL for Tesseract language data"),
    pdfMaxPages: z.number().int().positive().optional().describe("Limit PDF pages to OCR"),
    pdfScale: z.number().positive().optional().describe("PDF render scale for OCR (default: 2.0)"),
  }),
  async execute(params, ctx) {
    let inputPath = params.inputPath
    if (!path.isAbsolute(inputPath)) inputPath = path.join(process.cwd(), inputPath)
    inputPath = path.resolve(inputPath)

    await ensureReadableFile(ctx, inputPath)

    const file = Bun.file(inputPath)
    if (!(await file.exists())) throw new Error(`File not found: ${inputPath}`)

    const outputFormat = params.outputFormat ?? "text"
    const language = params.language ?? "eng"
    const languagePath = params.languagePath
    const ext = path.extname(inputPath).toLowerCase()

    let output = ""
    let confidence: number | undefined
    let pages = 0

    if (ext === ".pdf") {
      const buffer = await file.arrayBuffer()
      const result = await ocrPdfBuffer(buffer, {
        lang: language,
        langPath: languagePath,
        maxPages: params.pdfMaxPages,
        scale: params.pdfScale ?? 2.0,
        outputFormat,
      })
      pages = result.pages.length
      output = result.output
      const confidences = result.pages.map((p) => p.confidence).filter((c): c is number => typeof c === "number")
      if (confidences.length) {
        confidence = Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10
      }
    } else {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await ocrImageBuffer(buffer, language, languagePath)
      output = result.text.trim()
      confidence = result.confidence
      pages = 1
    }

    const report = {
      schema: "doc.ocr.v1",
      inputPath: path.relative(Instance.worktree, inputPath),
      language,
      pages,
      confidence,
    }

    return {
      title: "doc_ocr",
      output: ["```yml", YAML.stringify(report).trimEnd(), "```", "", output].join("\n"),
      metadata: report,
    }
  },
})
