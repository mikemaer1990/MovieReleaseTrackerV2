document.addEventListener("DOMContentLoaded", () => {
  // Handle movie card clicks
  document.addEventListener("click", (e) => {
    const movieCard = e.target.closest(".movie-card");
    if (
      movieCard &&
      !e.target.closest(".follow-button, .follow-container, .follow-type-btn")
    ) {
      const movieLink = movieCard.querySelector(".movie-link");
      if (movieLink) {
        window.location.href = movieLink.href;
      }
    }
  });
});
