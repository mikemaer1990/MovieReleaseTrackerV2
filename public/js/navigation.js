// Navigation functionality for hamburger menu and user dropdown
class Navigation {
  constructor() {
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.initHamburgerMenu();
        this.initUserDropdown();
      });
    } else {
      this.initHamburgerMenu();
      this.initUserDropdown();
    }
  }

  initHamburgerMenu() {
    const hamburger = document.getElementById('hamburgerBtn');
    const navLinks = document.querySelector('.nav-links');

    // Exit if elements don't exist
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent immediate close
      navLinks.classList.toggle('show');
    });

    // Close nav menu if clicking outside
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('show') && 
          !navLinks.contains(e.target) && 
          e.target !== hamburger) {
        navLinks.classList.remove('show');
      }
    });
  }

  initUserDropdown() {
    const userToggle = document.querySelector('.user-toggle');
    const userDropdown = document.querySelector('.user-dropdown');

    // Exit if elements don't exist (user might not be logged in)
    if (!userToggle || !userDropdown) return;

    userToggle.addEventListener('click', () => {
      userDropdown.classList.toggle('show');
    });

    // Close dropdown if clicked outside
    document.addEventListener('click', (e) => {
      if (!userDropdown.contains(e.target)) {
        userDropdown.classList.remove('show');
      }
    });
  }
}

// Initialize navigation when script loads
new Navigation();