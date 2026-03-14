// Helper to parse OpenAlex inverted_index back to normal string
function parseInvertedAbstract(invertedIndex: Record<string, number[]> | undefined | null): string {
  if (!invertedIndex) return "No abstract available.";

  try {
    const wordList: { word: string; pos: number }[] = [];
    Object.keys(invertedIndex).forEach((word) => {
      const positions = invertedIndex[word];
      positions.forEach((pos) => {
        wordList.push({ word, pos });
      });
    });

    // Sort by position
    wordList.sort((a, b) => a.pos - b.pos);
    
    // Join back to string
    return wordList.map((item) => item.word).join(" ");
  } catch (err) {
    return "Error parsing abstract.";
  }
}

export async function searchOpenAlex(query: string, limit: number = 3) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }
    const data = await response.json();
    
    // Map to simple structure
    const results = data.results.map((work: any) => ({
      id: work.id,
      title: work.title,
      publication_year: work.publication_year,
      authors: work.authorships?.map((a: any) => a.author.display_name).join(", "),
      abstract: parseInvertedAbstract(work.abstract_inverted_index),
      url: work.primary_location?.landing_page_url || work.id
    }));

    return results;
  } catch (error) {
    console.error("OpenAlex Search Error:", error);
    return [];
  }
}
