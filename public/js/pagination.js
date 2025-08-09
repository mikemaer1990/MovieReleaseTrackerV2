// Pagination functionality
document.addEventListener("DOMContentLoaded", function () {
  // Handle pagination clicks
  const paginationContainer = document.querySelector(".pagination");
  if (paginationContainer) {
    paginationContainer.addEventListener("click", function (e) {
      if (
        e.target.classList.contains("pagination-btn") &&
        !e.target.classList.contains("disabled")
      ) {
        // Add loading state
        e.target.style.opacity = "0.6";
        e.target.style.pointerEvents = "none";

        // Optional: show loading spinner or text
        const originalText = e.target.textContent;
        e.target.textContent = "Loading...";

        // Let the browser handle the navigation naturally
        // The loading state will be cleared when the new page loads
      }
    });
  }

  // Handle pagination with keyboard navigation
  document.addEventListener("keydown", function (e) {
    if (!paginationContainer) return;

    const prevBtn = paginationContainer.querySelector(
      '.pagination-btn[href*="page=' + (getCurrentPage() - 1) + '"]'
    );
    const nextBtn = paginationContainer.querySelector(
      '.pagination-btn[href*="page=' + (getCurrentPage() + 1) + '"]'
    );

    // Left arrow key for previous page
    if (e.key === "ArrowLeft" && prevBtn && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      prevBtn.click();
    }

    // Right arrow key for next page
    if (e.key === "ArrowRight" && nextBtn && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      nextBtn.click();
    }
  });

  // Helper function to get current page from URL
  function getCurrentPage() {
    const urlParams = new URLSearchParams(window.location.search);
    return parseInt(urlParams.get("page")) || 1;
  }

  // Add loading states for better UX
  function addLoadingState(button) {
    button.style.opacity = "0.6";
    button.style.pointerEvents = "none";
    button.setAttribute("aria-disabled", "true");
  }

  // Smooth scroll to top when changing pages (optional)
  const paginationBtns = document.querySelectorAll(".pagination-btn");
  paginationBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      // Smooth scroll to results
      const resultsHeader = document.querySelector(".results-header");
      if (resultsHeader) {
        setTimeout(() => {
          resultsHeader.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    });
  });
});
