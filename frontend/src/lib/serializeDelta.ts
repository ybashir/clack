import type Quill from 'quill';

export function serializeDelta(quill: Quill): string {
  const delta = quill.getContents();
  let result = '';
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let pendingText = '';

  const flushCodeBlock = () => {
    result += '```\n' + codeBlockLines.join('\n') + '\n```';
    codeBlockLines = [];
    inCodeBlock = false;
  };

  for (const op of delta.ops) {
    if (typeof op.insert !== 'string') continue;
    const attrs = op.attributes || {};
    const text = op.insert;

    if (attrs['code-block']) {
      // Quill emits code-block on the trailing \n — pendingText holds the line content
      if (!inCodeBlock) inCodeBlock = true;
      codeBlockLines.push(pendingText);
      pendingText = '';
    } else {
      if (pendingText) {
        if (inCodeBlock) flushCodeBlock();
        result += pendingText;
        pendingText = '';
      }
      if (inCodeBlock) flushCodeBlock();

      if (attrs['blockquote']) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (i < lines.length - 1) {
            result += '> ' + line + '\n';
          } else if (line !== '') {
            result += '> ' + line;
          }
        }
      } else if (attrs['code']) {
        result += '`' + text + '`';
      } else {
        // Apply inline formatting
        let formatted = text;

        if (formatted !== '\n' && formatted.trim() !== '') {
          if (attrs['bold']) {
            formatted = '**' + formatted + '**';
          }
          if (attrs['italic']) {
            formatted = '*' + formatted + '*';
          }
          if (attrs['strike']) {
            formatted = '~~' + formatted + '~~';
          }
          if (attrs['link']) {
            formatted = '[' + formatted + '](' + attrs['link'] + ')';
          }
        }

        if (formatted.endsWith('\n') || formatted === '\n') {
          result += formatted;
        } else {
          pendingText = formatted;
        }
      }
    }
  }

  if (pendingText) {
    if (inCodeBlock) flushCodeBlock();
    result += pendingText;
  }
  if (inCodeBlock) flushCodeBlock();

  return result.trim();
}
