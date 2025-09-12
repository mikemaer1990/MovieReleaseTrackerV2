document.addEventListener("DOMContentLoaded", () => {
  // Track processing states to prevent double-clicks
  const processingMovies = new Set();

  // Helper function to show empty message when no movies remain
  function showEmptyMessage() {
    const grid = document.querySelector(".movies-grid");
    if (
      grid &&
      grid.children.length === 0 &&
      !document.querySelector(".empty-message")
    ) {
      const msg = document.createElement("p");
      msg.textContent = "You're not following any movies yet.";
      msg.style.textAlign = "center";
      msg.classList.add("empty-message");
      grid.parentNode.insertBefore(msg, grid.nextSibling);
    }
  }

  // Enhanced API call with timeout and retry
  async function makeApiCall(url, data) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Request failed: ${errorData.message || response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      throw error;
    }
  }

  // Unified unfollow function with better error handling
  async function handleUnfollow(container, unfollowType) {
    const movieId = container.dataset.movieId;

    // Prevent concurrent operations on same movie
    if (processingMovies.has(movieId)) return;
    processingMovies.add(movieId);

    const unfollowBtn = container.querySelector(".unfollow-button");
    const panel = container.querySelector(".follow-options-panel");

    if (!unfollowBtn) {
      processingMovies.delete(movieId);
      return;
    }

    // Store original state for error recovery
    const originalText = unfollowBtn.textContent;
    const wasDisabled = unfollowBtn.disabled;

    unfollowBtn.disabled = true;
    unfollowBtn.classList.add("loading", "click-pop");
    unfollowBtn.innerHTML = '<span class="spinner"></span>';

    try {
      await makeApiCall("/unfollow", {
        movieId,
        followType: unfollowType,
      });

      // Handle UI updates based on page type
      if (document.body.classList.contains("my-movies-page")) {
        // Remove the movie card entirely
        const card = container.closest(".movie-card");
        if (card) {
          card.remove();
          showEmptyMessage();
        }
      } else {
        // Convert back to follow button
        unfollowBtn.classList.remove("loading", "click-pop", "unfollow-button");
        unfollowBtn.classList.add("follow-button");
        unfollowBtn.textContent = "Follow";
        unfollowBtn.disabled = false;
        delete unfollowBtn.dataset.followType;
      }

      // Hide panel if it exists
      if (panel) panel.classList.remove("show");
    } catch (error) {
      console.error("Unfollow error:", error);

      // Restore original state
      unfollowBtn.classList.remove("loading", "click-pop");
      unfollowBtn.textContent = originalText;
      unfollowBtn.disabled = wasDisabled;

      if (panel) panel.classList.remove("show");

      // Show user-friendly error message
      const message = error.message.includes("timed out")
        ? "Request timed out. Please check your connection and try again."
        : "Unable to unfollow right now. Please try again.";
      alert(message);
    } finally {
      processingMovies.delete(movieId);
    }
  }

  // Main click handler
  document.addEventListener("click", async (e) => {
    const target = e.target;
    const container = target.closest(".follow-container");

    if (!container) return;

    const movieId = container.dataset.movieId;
    console.log("Clicked:", target.className, "movieId:", movieId);

    // Prevent operations on movies already being processed
    if (processingMovies.has(movieId) && !target.matches(".follow-button")) {
      e.preventDefault();
      return;
    }

    // Follow button clicked: show options panel
    if (target.matches(".follow-button")) {
      e.preventDefault();
      const panel = container.querySelector(".follow-options-panel");
      if (panel) panel.classList.add("show");
      return;
    }

    // Follow type selected (only when following, not unfollowing)
    if (
      target.matches(".follow-type-btn") &&
      container.querySelector(".follow-button") &&
      !container.querySelector(".unfollow-button")
    ) {
      e.preventDefault();

      if (processingMovies.has(movieId)) return;
      processingMovies.add(movieId);

      const panel = container.querySelector(".follow-options-panel");
      const followBtn = container.querySelector(".follow-button");

      if (!panel || !followBtn) {
        processingMovies.delete(movieId);
        return;
      }

      if (followBtn.disabled) {
        alert("Cannot follow this movie right now.");
        if (panel) panel.classList.remove("show");
        processingMovies.delete(movieId);
        return;
      }

      const followType = target.dataset.type;
      const title = container.dataset.title;
      const releaseDate = container.dataset.releaseDate;
      const streamingDate = container.dataset.streamingDate;
      const posterPath = container.dataset.posterPath;

      // Store original state for error recovery
      const originalText = followBtn.textContent;

      followBtn.disabled = true;
      followBtn.classList.add("loading", "click-pop");
      followBtn.innerHTML = '<span class="spinner"></span>';

      try {
        console.log("Sending follow request for:", movieId, followType);

        const data = await makeApiCall("/follow", {
          movieId,
          title,
          releaseDate,
          streamingDate,
          posterPath,
          followType,
        });

        console.log("Follow response data:", data);

        // Successfully followed - update button
        followBtn.classList.remove("loading", "click-pop", "follow-button");
        followBtn.classList.add("unfollow-button");
        followBtn.textContent = "Unfollow";
        followBtn.dataset.followType = followType;
        followBtn.disabled = false;

        console.log("Button updated:", followBtn.outerHTML);
        panel.classList.remove("show");
      } catch (error) {
        console.error("Follow error:", error);
        // Restore original state
        followBtn.classList.remove("loading", "click-pop");
        followBtn.textContent = originalText;
        followBtn.disabled = false;

        panel.classList.remove("show");

        // Show user-friendly error message
        const message = error.message.includes("timed out")
          ? "Request timed out. Please check your connection and try again."
          : "Unable to follow right now. Please try again.";
        alert(message);
      } finally {
        processingMovies.delete(movieId);
      }
      return;
    }

    // Unfollow button clicked
    if (target.matches(".unfollow-button")) {
      e.preventDefault();
      console.log("Unfollow button clicked");

      const panel = container.querySelector(".follow-options-panel");

      if (panel) {
        // Show options panel for unfollow type selection
        panel.classList.add("show");
      } else {
        // No panel: immediate unfollow using stored follow type
        const followType = target.dataset.followType;
        if (followType) {
          await handleUnfollow(container, followType);
        } else {
          console.error("No follow type found for immediate unfollow");
          alert("Unable to determine follow type for unfollowing.");
        }
      }
      return;
    }

    // Unfollow type selected from panel
    if (
      target.matches(".follow-type-btn") &&
      container.querySelector(".unfollow-button")
    ) {
      e.preventDefault();
      const unfollowType = target.dataset.type;
      await handleUnfollow(container, unfollowType);
      return;
    }
  });
});
