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
      abstract: work.abstract_inverted_index ? "Abstract available (inverted structure)" : "No abstract",
      url: work.primary_location?.landing_page_url || work.id
    }));

    return results;
  } catch (error) {
    console.error("OpenAlex Search Error:", error);
    return [];
  }
}
