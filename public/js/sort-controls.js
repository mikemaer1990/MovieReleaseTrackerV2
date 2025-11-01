// Modern Segmented Control Sort Interface
console.log("sort-controls.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const sortForm = document.getElementById("sort-form");
  const segmentedControl = document.querySelector(".segmented-control");

  if (!sortForm || !segmentedControl) {
    console.warn("Sort controls not found on page");
    return;
  }

  // Handle radio button changes
  const radioButtons = segmentedControl.querySelectorAll('input[type="radio"]');

  radioButtons.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.checked) {
        // Add visual feedback
        addLoadingState();

        // Submit form immediately when selection changes
        setTimeout(() => {
          sortForm.submit();
        }, 150); // Small delay for visual feedback
      }
    });

    // Keyboard navigation enhancement
    radio.addEventListener("keydown", (e) => {
      const currentIndex = Array.from(radioButtons).indexOf(e.target);
      let nextIndex;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          nextIndex = (currentIndex + 1) % radioButtons.length;
          radioButtons[nextIndex].focus();
          radioButtons[nextIndex].checked = true;
          radioButtons[nextIndex].dispatchEvent(new Event("change"));
          break;

        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          nextIndex = currentIndex === 0 ? radioButtons.length - 1 : currentIndex - 1;
          radioButtons[nextIndex].focus();
          radioButtons[nextIndex].checked = true;
          radioButtons[nextIndex].dispatchEvent(new Event("change"));
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (!e.target.checked) {
            e.target.checked = true;
            e.target.dispatchEvent(new Event("change"));
          }
          break;
      }
    });
  });

  // Add visual loading state
  function addLoadingState() {
    const checkedRadio = segmentedControl.querySelector('input[type="radio"]:checked');
    const checkedLabel = checkedRadio?.nextElementSibling;

    if (checkedLabel) {
      const originalText = checkedLabel.textContent;
      checkedLabel.style.opacity = "0.6";
      checkedLabel.style.transform = "scale(0.98)";

      // Add subtle loading indicator
      const loadingDot = document.createElement("span");
      loadingDot.textContent = "⋯";
      loadingDot.className = "loading-indicator";
      loadingDot.style.marginLeft = "4px";
      loadingDot.style.animation = "pulse 1s infinite";
      checkedLabel.appendChild(loadingDot);
    }
  }

  // Handle form submission with smooth transitions
  sortForm.addEventListener("submit", (e) => {
    // Prevent double submission
    const submitButton = sortForm.querySelector('[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
    }

    // Add form-level loading state
    sortForm.style.pointerEvents = "none";
    sortForm.style.opacity = "0.8";
  });

  // Restore state if back button is used
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      // Page was restored from cache
      const form = document.getElementById("sort-form");
      if (form) {
        form.style.pointerEvents = "auto";
        form.style.opacity = "1";

        // Remove any loading indicators
        const loadingIndicators = form.querySelectorAll(".loading-indicator");
        loadingIndicators.forEach(indicator => indicator.remove());

        // Restore label states
        const labels = form.querySelectorAll("label");
        labels.forEach(label => {
          label.style.opacity = "1";
          label.style.transform = "scale(1)";
        });
      }
    }
  });

  // Touch/swipe support for mobile
  if ("ontouchstart" in window) {
    let touchStartX = 0;
    let touchEndX = 0;

    segmentedControl.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
    });

    segmentedControl.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    });

    function handleSwipe() {
      const swipeThreshold = 50; // Minimum swipe distance
      const currentRadio = segmentedControl.querySelector('input[type="radio"]:checked');
      const currentIndex = Array.from(radioButtons).indexOf(currentRadio);

      if (touchEndX < touchStartX - swipeThreshold) {
        // Swipe left - next option
        const nextIndex = (currentIndex + 1) % radioButtons.length;
        radioButtons[nextIndex].checked = true;
        radioButtons[nextIndex].dispatchEvent(new Event("change"));
      } else if (touchEndX > touchStartX + swipeThreshold) {
        // Swipe right - previous option
        const prevIndex = currentIndex === 0 ? radioButtons.length - 1 : currentIndex - 1;
        radioButtons[prevIndex].checked = true;
        radioButtons[prevIndex].dispatchEvent(new Event("change"));
      }
    }
  }

  // Add loading animation styles
  const style = document.createElement("style");
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .loading-indicator {
      display: inline-block;
      font-weight: bold;
    }

    .segmented-control:focus-within {
      outline: 2px solid var(--accent-color, #007cba);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);

  console.log("✅ Sort controls initialized successfully");
});