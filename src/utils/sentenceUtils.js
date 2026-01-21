// splits a paragraph into sentences.
// assumes your content is clean and sentences end with . ! ?
export function splitIntoSentences(paragraphText) {
  if (!paragraphText) return [];

  // normalize whitespace
  const text = paragraphText.replace(/\s+/g, " ").trim();

  // split on sentence-ending punctuation followed by space
  // keeps punctuation at the end of each sentence.
  const parts = text.split(/(?<=[.!?])\s+/);

  return parts
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function buildParagraphsWithSentences(paragraphs) {
  return paragraphs.map((p) => {
    const sentenceTexts = splitIntoSentences(p.text);

    return {
      ...p, // retain other paragraph properties like paragraphId, type
      sentences: sentenceTexts.map((sentenceText, idx) => ({
        sentenceId: idx + 1, // 1..N within paragraph
        text: sentenceText,
      })),
    };
  });
}
