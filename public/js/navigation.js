// Navigation functionality for hamburger menu and user dropdown
class Navigation {
  constructor() {
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        this.initHamburgerMenu();
        this.initUserDropdown();
        this.initSearch();
      });
    } else {
      this.initHamburgerMenu();
      this.initUserDropdown();
      this.initSearch();
    }
  }

  initHamburgerMenu() {
    const hamburger = document.getElementById("hamburgerBtn");
    const navLinks = document.querySelector(".mobile-nav-links");

    // Exit if elements don't exist
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent immediate close
      navLinks.classList.toggle("show");
    });

    // Close nav menu if clicking outside
    document.addEventListener("click", (e) => {
      if (
        navLinks.classList.contains("show") &&
        !navLinks.contains(e.target) &&
        e.target !== hamburger
      ) {
        navLinks.classList.remove("show");
      }
    });
  }

  initUserDropdown() {
    const userToggle = document.querySelector(".user-toggle");
    const userDropdown = document.querySelector(".user-dropdown");
    const userMenu = document.querySelector(".user-menu");

    // Exit if elements don't exist (user might not be logged in)
    if (!userToggle || !userDropdown || !userMenu) return;

    // Toggle dropdown and update ARIA states
    const toggleDropdown = () => {
      const isOpen = userDropdown.classList.contains("show");
      
      userDropdown.classList.toggle("show");
      userToggle.setAttribute("aria-expanded", !isOpen);
      userMenu.setAttribute("aria-hidden", isOpen);
      
      // Focus management
      if (!isOpen) {
        // When opening, focus first menu item
        const firstMenuItem = userMenu.querySelector('[role="menuitem"]');
        if (firstMenuItem) {
          setTimeout(() => firstMenuItem.focus(), 50);
        }
      }
    };

    // Click handler
    userToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Keyboard navigation
    userToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleDropdown();
      } else if (e.key === "ArrowDown" && !userDropdown.classList.contains("show")) {
        e.preventDefault();
        toggleDropdown();
      }
    });

    // Menu item keyboard navigation
    userMenu.addEventListener("keydown", (e) => {
      const menuItems = userMenu.querySelectorAll('[role="menuitem"]');
      const currentIndex = Array.from(menuItems).indexOf(document.activeElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % menuItems.length;
        menuItems[nextIndex].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
        menuItems[prevIndex].focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeUserDropdown();
        userToggle.focus();
      }
    });

    // Close dropdown if clicked outside
    document.addEventListener("click", (e) => {
      if (!userDropdown.contains(e.target)) {
        this.closeUserDropdown();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && userDropdown.classList.contains("show")) {
        this.closeUserDropdown();
        userToggle.focus();
      }
    });
  }

  closeUserDropdown() {
    const userDropdown = document.querySelector(".user-dropdown");
    const userToggle = document.querySelector(".user-toggle");
    const userMenu = document.querySelector(".user-menu");
    
    if (userDropdown && userToggle && userMenu) {
      userDropdown.classList.remove("show");
      userToggle.setAttribute("aria-expanded", "false");
      userMenu.setAttribute("aria-hidden", "true");
    }
  }

  initSearch() {
    const searchForm = document.querySelector(".nav-search");
    const searchInput = document.getElementById("nav-search-input");
    const searchButton = document.querySelector(".search-button");

    if (!searchForm || !searchInput || !searchButton) return;

    // Enhanced search functionality
    let searchTimeout;

    // Debounced input validation
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      
      // Update button state based on input
      if (query.length > 0) {
        searchButton.style.color = "var(--color-gold-medium)";
        searchInput.style.color = "var(--color-text-primary)";
      } else {
        searchButton.style.color = "";
        searchInput.style.color = "";
      }
    });

    // Handle form submission
    searchForm.addEventListener("submit", (e) => {
      const query = searchInput.value.trim();
      
      if (!query) {
        e.preventDefault();
        searchInput.focus();
        this.showSearchFeedback("Please enter a search term", "error");
        return;
      }

      if (query.length < 2) {
        e.preventDefault();
        this.showSearchFeedback("Please enter at least 2 characters", "error");
        return;
      }

      // Show loading state
      searchButton.innerHTML = '<span class="search-icon" aria-hidden="true">⏳</span>';
      searchButton.disabled = true;
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Focus search on Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }

      // Clear search on Escape when focused
      if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        searchInput.blur();
      }
    });
  }

  showSearchFeedback(message, type = "info") {
    // Remove any existing feedback
    const existingFeedback = document.querySelector(".search-feedback");
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // Create feedback element
    const feedback = document.createElement("div");
    feedback.className = `search-feedback search-feedback-${type}`;
    feedback.textContent = message;
    feedback.setAttribute("role", "alert");
    feedback.setAttribute("aria-live", "polite");

    // Insert after search form
    const searchForm = document.querySelector(".nav-search");
    searchForm.parentNode.insertBefore(feedback, searchForm.nextSibling);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 3000);
  }
}

// Initialize navigation when script loads
new Navigation();

// Add global search keyboard shortcut hint
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("nav-search-input");
  if (searchInput && !('ontouchstart' in window)) {
    // Only show keyboard shortcut hint on desktop
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const shortcutKey = isMac ? "⌘K" : "Ctrl+K";
    searchInput.setAttribute("title", `Search movies (${shortcutKey})`);
  }
});
