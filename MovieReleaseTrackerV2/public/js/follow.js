document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", async (e) => {
    const target = e.target;

    // Handle Follow clicks
    if (target.matches(".follow-button")) {
      e.preventDefault();
      target.classList.add("loading", "click-pop");
      target.textContent = "Following…";

      const { movieId, title, releaseDate, posterPath } = target.dataset;

      try {
        const res = await fetch("/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId, title, releaseDate, posterPath })
        });
        if (!res.ok) throw new Error();

        // On success, turn it into an Unfollow button
        target.classList.remove("loading", "follow-button");
        target.classList.add("unfollow-button");
        target.textContent = "Unfollow";
      } catch (err) {
        console.error("Follow error:", err);
        target.classList.remove("loading", "click-pop");
        target.textContent = "Follow";
        alert("Unable to follow right now.");
      }

    // Handle Unfollow clicks
    } else if (target.matches(".unfollow-button")) {
      e.preventDefault();
      target.classList.add("loading", "click-pop");
      target.textContent = "Unfollowing…";

      try {
        const res = await fetch("/unfollow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId: target.dataset.movieId })
        });
        if (!res.ok) throw new Error();

        // Only on My Movies do we remove the card…
        if (document.body.classList.contains("my-movies-page")) {
          const card = target.closest(".movie-card");
          card && card.remove();

          // …then check: if no more cards, show the empty-message paragraph
          const grid = document.querySelector(".movies-grid");
          if (grid && grid.children.length === 0) {
            const msg = document.createElement("p");
            msg.textContent = "You’re not following any movies yet.";
            msg.style.textAlign = "center";
            msg.classList.add("empty-message");
            grid.parentNode.insertBefore(msg, grid.nextSibling);
          }
        } else {
          // On search results, just flip back to Follow
          target.classList.remove("loading", "unfollow-button");
          target.classList.add("follow-button");
          target.textContent = "Follow";
        }
      } catch (err) {
        console.error("Unfollow error:", err);
        target.classList.remove("loading", "click-pop");
        target.textContent = "Unfollow";
        alert("Unable to unfollow right now.");
      }
    }
  });
});
