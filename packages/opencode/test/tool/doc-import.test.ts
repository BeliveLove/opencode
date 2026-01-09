import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import type { PermissionNext } from "../../src/permission/next"
import { DocImportTool } from "../../src/tool/doc/import"
import { ZipWriter, BlobWriter, TextReader } from "@zip.js/zip.js"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

async function writeZipFile(filePath: string, entries: Record<string, string>) {
  const writer = new ZipWriter(new BlobWriter("application/zip"))
  for (const [name, text] of Object.entries(entries)) {
    await writer.add(name, new TextReader(text))
  }
  const blob = await writer.close()
  await Bun.write(filePath, new Uint8Array(await blob.arrayBuffer()))
}

describe("tool.doc.import", () => {
  test("extracts docx text from word/document.xml", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await writeZipFile(path.join(dir, "a.docx"), {
          "word/document.xml": [
            `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`,
            `<w:body>`,
            `<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`,
            `<w:p><w:r><w:t>World</w:t></w:r></w:p>`,
            `</w:body>`,
            `</w:document>`,
          ].join(""),
        })
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocImportTool.init()
        const result = await tool.execute({ filePath: path.join(tmp.path, "a.docx") }, ctx)
        expect(result.output).toContain("Hello")
        expect(result.output).toContain("World")
        expect(result.metadata.type).toBe("docx")
        expect((result.metadata.warnings as string[]).length).toBeGreaterThan(0)
      },
    })
  })

  test("extracts pptx slide text from ppt/slides/slide*.xml", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await writeZipFile(path.join(dir, "a.pptx"), {
          "ppt/slides/slide1.xml": [
            `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" `,
            `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`,
            `<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>SlideText</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>`,
            `</p:sld>`,
          ].join(""),
        })
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocImportTool.init()
        const result = await tool.execute({ filePath: path.join(tmp.path, "a.pptx") }, ctx)
        expect(result.output).toContain("SlideText")
        expect(result.metadata.type).toBe("pptx")
      },
    })
  })

  test("extracts xlsx shared strings and sheet rows", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await writeZipFile(path.join(dir, "a.xlsx"), {
          "xl/sharedStrings.xml": [
            `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">`,
            `<si><t>CellA</t></si>`,
            `</sst>`,
          ].join(""),
          "xl/worksheets/sheet1.xml": [
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`,
            `<sheetData>`,
            `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row>`,
            `</sheetData>`,
            `</worksheet>`,
          ].join(""),
        })
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocImportTool.init()
        const result = await tool.execute({ filePath: path.join(tmp.path, "a.xlsx") }, ctx)
        expect(result.output).toContain("CellA")
        expect(result.output).toContain("42")
        expect(result.metadata.type).toBe("xlsx")
      },
    })
  })

  test("returns pdf as attachment (no text extraction)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "a.pdf"), Buffer.from("%PDF-1.4\n%fake\n", "utf8"))
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocImportTool.init()
        const result = await tool.execute({ filePath: path.join(tmp.path, "a.pdf") }, ctx)
        expect(result.output).toContain("PDF attached")
        expect(result.attachments?.length).toBe(1)
        expect(result.metadata.type).toBe("pdf")
        expect((result.metadata as any).attached).toBe(true)
      },
    })
  })

  test("asks for external_directory permission when importing outside project", async () => {
    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "a.md"), "hello")
      },
    })
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await DocImportTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }

        await tool.execute({ filePath: path.join(outerTmp.path, "a.md") }, testCtx)
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns.some((p) => p.includes(outerTmp.path))).toBe(true)
      },
    })
  })
})
