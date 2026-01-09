import { createTwoFilesPatch } from "diff"

export function unifiedDiff(input: {
  filePath: string
  before: string
  after: string
  fromLabel?: string
  toLabel?: string
}) {
  const fromLabel = input.fromLabel ?? "before"
  const toLabel = input.toLabel ?? "after"
  return createTwoFilesPatch(input.filePath, input.filePath, input.before, input.after, fromLabel, toLabel, {
    context: 3,
  })
}

