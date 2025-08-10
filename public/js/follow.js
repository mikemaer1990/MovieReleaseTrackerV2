document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", async (e) => {
    const target = e.target;
    // Safe container lookup helper
    const container = target.closest(".follow-container");
    if (!container) {
      // Not inside a follow-container, ignore clicks
      return;
    }

    // Log clicked info safely
    console.log(
      "Clicked:",
      target.className,
      "movieId:",
      container.dataset.movieId
    );

    // Follow button clicked: show options panel
    if (target.matches(".follow-button")) {
      e.preventDefault();
      const panel = container.querySelector(".follow-options-panel");
      if (!panel) return;
      panel.classList.add("show");
      return;
    }

    // Follow type selected — only if follow-button present and no unfollow-button
    if (
      target.matches(".follow-type-btn") &&
      container.querySelector(".follow-button") &&
      !container.querySelector(".unfollow-button")
    ) {
      e.preventDefault();
      const panel = container.querySelector(".follow-options-panel");
      if (!panel) return;

      const followType = target.dataset.type;
      const followBtn = container.querySelector(".follow-button");

      if (!followBtn || followBtn.disabled) {
        alert("Cannot follow this movie right now.");
        panel.classList.remove("show");
        return;
      }

      followBtn.classList.add("loading", "click-pop");
      followBtn.textContent = "Following…";

      const movieId = container.dataset.movieId;
      const title = container.dataset.title;
      const releaseDate = container.dataset.releaseDate;
      const posterPath = container.dataset.posterPath;

      try {
        console.log("Sending follow request for:", movieId, followType);
        const res = await fetch("/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movieId,
            title,
            releaseDate,
            posterPath,
            followType,
          }),
        });
        console.log("Follow response status:", res.status);
        const data = await res.json();
        console.log("Follow response data:", data);

        if (!res.ok) throw new Error();

        followBtn.classList.remove("loading", "follow-button");
        followBtn.classList.add("unfollow-button");
        followBtn.textContent = `Unfollow (${followType})`;
        followBtn.dataset.followType = followType;
        console.log("Button updated:", followBtn.outerHTML);

        panel.classList.remove("show");
      } catch (err) {
        console.error("Follow error:", err);
        followBtn.classList.remove("loading", "click-pop");
        followBtn.textContent = "Follow";
        alert("Unable to follow right now.");
        panel.classList.remove("show");
      }
      return;
    }

    // Unfollow button clicked
    if (target.matches(".unfollow-button")) {
      e.preventDefault();
      console.log("My unfollow JS script loaded!");

      const panel = container.querySelector(".follow-options-panel");

      if (panel) {
        // If panel exists, show it (old behavior)
        panel.classList.add("show");
        return;
      } else {
        // No panel: immediately unfollow (new behavior)

        const movieId = target.dataset.movieId;
        const unfollowType = target.dataset.followType;

        // Disable button and update text while processing
        target.disabled = true;
        target.textContent = "Unfollowing…";

        try {
          const res = await fetch("/unfollow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              movieId,
              followType: unfollowType,
            }),
          });

          if (!res.ok) throw new Error("Unfollow request failed");

          // Remove movie card from UI
          const card = container.closest(".movie-card");
          if (card) card.remove();

          // Show empty message if no more movies
          const grid = document.querySelector(".movies-grid");
          if (grid && grid.children.length === 0) {
            const msg = document.createElement("p");
            msg.textContent = "You're not following any movies yet.";
            msg.style.textAlign = "center";
            msg.classList.add("empty-message");
            grid.parentNode.insertBefore(msg, grid.nextSibling);
          }
        } catch (err) {
          console.error("Unfollow error:", err);
          alert("Unable to unfollow right now.");
          target.disabled = false;
          target.textContent = `Unfollow (${unfollowType})`;
        }
        return;
      }
    }

    // Unfollow type selected — only if unfollow-button present and panel shown
    if (
      target.matches(".follow-type-btn") &&
      container.querySelector(".unfollow-button")
    ) {
      e.preventDefault();
      const panel = container.querySelector(".follow-options-panel");
      if (!panel) return;

      const unfollowType = target.dataset.type;
      const unfollowBtn = container.querySelector(".unfollow-button");

      unfollowBtn.classList.add("loading", "click-pop");
      unfollowBtn.textContent = "Unfollowing…";

      const movieId = container.dataset.movieId;

      try {
        const res = await fetch("/unfollow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movieId,
            followType: unfollowType,
          }),
        });
        if (!res.ok) throw new Error();

        if (document.body.classList.contains("my-movies-page")) {
          const card = container.closest(".movie-card");
          if (card) card.remove();

          const grid = document.querySelector(".movies-grid");
          if (grid && grid.children.length === 0) {
            const msg = document.createElement("p");
            msg.textContent = "You're not following any movies yet.";
            msg.style.textAlign = "center";
            msg.classList.add("empty-message");
            grid.parentNode.insertBefore(msg, grid.nextSibling);
          }
        } else {
          unfollowBtn.classList.remove(
            "loading",
            "click-pop",
            "unfollow-button"
          );
          unfollowBtn.classList.add("follow-button");
          unfollowBtn.textContent = "Follow";
          delete unfollowBtn.dataset.followType;
        }

        panel.classList.remove("show");
      } catch (err) {
        console.error("Unfollow error:", err);
        unfollowBtn.classList.remove("loading", "click-pop");
        unfollowBtn.textContent = `Unfollow (${unfollowType})`;
        alert("Unable to unfollow right now.");
        panel.classList.remove("show");
      }
      return;
    }
  });
});
