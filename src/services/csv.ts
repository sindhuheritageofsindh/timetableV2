export function downloadCsv<T extends object>(filename: string, rows: readonly T[]) {
  const objectRows = rows as readonly Record<string, unknown>[]
  const headers = objectRows.length ? Object.keys(objectRows[0]) : []
  const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.map(esc).join(','),
    ...objectRows.map(row => headers.map(header => esc(row[header])).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []

  const parse = (line: string) => {
    const out: string[] = []
    let current = ''
    let quoted = false

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
        continue
      }
      if (char === '"') {
        quoted = !quoted
        continue
      }
      if (char === ',' && !quoted) {
        out.push(current.trim())
        current = ''
        continue
      }
      current += char
    }

    out.push(current.trim())
    return out
  }

  const headers = parse(lines[0])
  return lines.slice(1).map(line => {
    const values = parse(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}
