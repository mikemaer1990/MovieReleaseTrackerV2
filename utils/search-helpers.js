function relevanceScore(title, query) {
  title = title.toLowerCase();
  query = query.toLowerCase();
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 50;
  return 0;
}

function sortByRelevanceAndPopularity(a, b, query) {
  const relevanceDiff =
    relevanceScore(b.title, query) - relevanceScore(a.title, query);
  return relevanceDiff !== 0 ? relevanceDiff : b.popularity - a.popularity;
}

module.exports = {
  sortByRelevanceAndPopularity,
};
