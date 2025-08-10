/**
 * My Movies Page JavaScript
 * Handles filtering and unfollow functionality
 */

class MyMoviesManager {
  constructor() {
    this.filterBtns = document.querySelectorAll(".filter-btn");
    this.movieCards = document.querySelectorAll(".movie-card");
    this.statsElements = {
      total: document.querySelector('[data-stat="total"]'),
      theatrical: document.querySelector('[data-stat="theatrical"]'),
      streaming: document.querySelector('[data-stat="streaming"]'),
      both: document.querySelector('[data-stat="both"]'),
    };

    this.init();
  }

  init() {
    this.setupFiltering();
    this.setupUnfollowActions();
  }

  /**
   * Setup movie filtering functionality
   */
  setupFiltering() {
    this.filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.handleFilter(btn));
    });
  }

  /**
   * Handle filter button clicks
   */
  handleFilter(activeBtn) {
    // Update active state
    this.filterBtns.forEach((btn) => {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    });

    activeBtn.classList.add("active");
    activeBtn.setAttribute("aria-pressed", "true");

    const filter = activeBtn.dataset.filter;
    this.applyFilter(filter);
  }

  /**
   * Apply the selected filter to movie cards
   */
  applyFilter(filter) {
    this.movieCards.forEach((card) => {
      const followTypes = this.getFollowTypes(card);
      const shouldShow = this.shouldShowCard(followTypes, filter);

      card.style.display = shouldShow ? "block" : "none";
      card.setAttribute("aria-hidden", !shouldShow);
    });
  }

  /**
   * Get follow types for a movie card
   */
  getFollowTypes(card) {
    const followTypesStr = card.dataset.followTypes || "";
    return followTypesStr.split(",").filter((type) => type.trim());
  }

  /**
   * Determine if a card should be shown based on filter
   */
  shouldShowCard(followTypes, filter) {
    switch (filter) {
      case "all":
        return true;
      case "theatrical":
        return (
          followTypes.includes("theatrical") &&
          !followTypes.includes("streaming")
        );
      case "streaming":
        return (
          followTypes.includes("streaming") &&
          !followTypes.includes("theatrical")
        );
      case "both":
        return (
          followTypes.includes("theatrical") &&
          followTypes.includes("streaming")
        );
      default:
        return true;
    }
  }

  /**
   * Setup unfollow button functionality
   */
  setupUnfollowActions() {
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("unfollow-btn")) {
        this.handleUnfollow(e.target, e);
      }
    });
  }

  /**
   * Handle unfollow button clicks
   */
  async handleUnfollow(btn, event) {
    event.preventDefault();

    const movieId = btn.dataset.movieId;
    const followType = btn.dataset.followType;
    const card = btn.closest(".movie-card");

    if (!movieId || !followType || !card) {
      console.error("Missing required data for unfollow action");
      return;
    }

    await this.performUnfollow(btn, card, movieId, followType);
  }

  /**
   * Perform the unfollow API call and update UI
   */
  async performUnfollow(btn, card, movieId, followType) {
    const originalText = btn.textContent;

    try {
      // Set loading state
      this.setButtonLoading(btn, true);

      const response = await fetch("/unfollow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          movieId: movieId,
          followType: followType,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update UI on success
      this.updateCardAfterUnfollow(card, followType);
      this.updateStats();
    } catch (error) {
      console.error("Error unfollowing movie:", error);
      this.handleUnfollowError(btn, originalText);
    }
  }

  /**
   * Set button loading state
   */
  setButtonLoading(btn, isLoading) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span> Removing...';
    } else {
      btn.disabled = false;
    }
  }

  /**
   * Update card UI after successful unfollow
   */
  updateCardAfterUnfollow(card, followType) {
    const followTypes = this.getFollowTypes(card);
    const newFollowTypes = followTypes.filter((type) => type !== followType);

    // Update card data
    card.dataset.followTypes = newFollowTypes.join(",");

    // Remove the corresponding badge and button
    const badge = card.querySelector(`.follow-badge.${followType}`);
    const button = card.querySelector(`.unfollow-btn.${followType}`);

    if (badge) badge.remove();
    if (button) button.remove();

    // Handle empty follow state
    if (newFollowTypes.length === 0) {
      this.handleEmptyFollowState(card);
    }
  }

  /**
   * Handle when a movie has no more follow types
   */
  handleEmptyFollowState(card) {
    card.style.opacity = "0.5";
    card.setAttribute("aria-label", "No longer following this movie");

    const followStatus = card.querySelector(".follow-status");
    if (followStatus) {
      followStatus.innerHTML = `
        <p class="no-follow-message">
          <em>No longer following</em>
        </p>
      `;
    }

    // Remove card after delay
    setTimeout(() => {
      card.style.transition = "opacity 0.5s ease";
      card.style.opacity = "0";

      setTimeout(() => {
        card.style.display = "none";
      }, 500);
    }, 2000);
  }

  /**
   * Handle unfollow errors
   */
  handleUnfollowError(btn, originalText) {
    this.setButtonLoading(btn, false);
    btn.textContent = originalText;

    // Show user-friendly error message
    this.showNotification(
      "Failed to unfollow movie. Please try again.",
      "error"
    );
  }

  /**
   * Update statistics after unfollow actions
   */
  updateStats() {
    const visibleCards = Array.from(this.movieCards).filter(
      (card) =>
        card.style.display !== "none" &&
        card.style.opacity !== "0.5" &&
        card.style.opacity !== "0"
    );

    const stats = {
      total: visibleCards.length,
      theatrical: 0,
      streaming: 0,
      both: 0,
    };

    visibleCards.forEach((card) => {
      const followTypes = this.getFollowTypes(card);

      if (followTypes.includes("theatrical")) stats.theatrical++;
      if (followTypes.includes("streaming")) stats.streaming++;
      if (
        followTypes.includes("theatrical") &&
        followTypes.includes("streaming")
      ) {
        stats.both++;
      }
    });

    // Update DOM elements
    Object.keys(stats).forEach((key) => {
      if (this.statsElements[key]) {
        this.statsElements[key].textContent = stats[key];
      }
    });
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === "error" ? "#dc3545" : "var(--color-gold-medium)"};
      color: ${type === "error" ? "white" : "var(--color-text-dark)"};
      padding: 1rem 1.5rem;
      border-radius: var(--radius-lg);
      font-weight: 600;
      z-index: 1000;
      box-shadow: var(--shadow-lg);
      animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideOutRight 0.3s ease";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new MyMoviesManager();
});
