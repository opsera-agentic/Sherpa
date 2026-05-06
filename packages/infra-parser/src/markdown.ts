export interface MarkdownSection {
  heading: string;
  body: string;
}

/** Heuristic markdown splitter used during migrations — headings drive segmentation boundaries. */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let heading = 'Introduction';
  const buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    buffer.length = 0;
    if (body.length) {
      sections.push({ heading, body });
    }
  };

  for (const line of lines) {
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (match) {
      flush();
      heading = (match[2] ?? '').trim().length
        ? (match[2] ?? '').trim()
        : `Section (${match[1]?.length ?? 0} hashes)`;
    } else {
      buffer.push(line);
    }
  }

  flush();

  const trimmedDoc = markdown.trim();
  if (!sections.length && trimmedDoc.length) {
    return [{ heading: 'Document', body: trimmedDoc }];
  }

  return sections;
}
