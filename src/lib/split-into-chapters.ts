export function splitIntoChaptersSmart(input: string, maxWords = 60): string[] {
  const text = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const chapters: string[] = [];

  for (const p of paragraphs) {
    const words = p.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      chapters.push(p);
    } else {
      for (let i = 0; i < words.length; i += maxWords) {
        chapters.push(words.slice(i, i + maxWords).join(" "));
      }
    }
  }

  return chapters;
}
