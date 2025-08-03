import Exa from 'exa-js';

if (!process.env.EXA_API_KEY) {
  throw new Error('Missing EXA_API_KEY environment variable');
}

const exa = new Exa(process.env.EXA_API_KEY);

export async function search(query: string) {
  try {
    const results = await exa.searchAndContents(query, {
      numResults: 5,
      useAutoprompt: true,
      text: true, // Include text content/summary in each result
    });
    return results;
  } catch (error) {
    console.error('Error searching with Exa:', error);
    return { results: [] }; // Return empty results on error
  }
}
