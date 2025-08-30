// Custom Dropdown Functionality
document.addEventListener('DOMContentLoaded', function() {
  const dropdowns = document.querySelectorAll('.custom-dropdown');
  
  dropdowns.forEach(dropdown => {
    const button = dropdown.querySelector('.dropdown-button');
    const menu = dropdown.querySelector('.dropdown-menu');
    const options = dropdown.querySelectorAll('.dropdown-option');
    const hiddenInput = dropdown.parentElement.querySelector('input[type="hidden"]');
    const textSpan = button.querySelector('.dropdown-text');
    
    // Toggle dropdown
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close other dropdowns
      dropdowns.forEach(otherDropdown => {
        if (otherDropdown !== dropdown) {
          otherDropdown.classList.remove('open');
        }
      });
      
      // Toggle this dropdown
      dropdown.classList.toggle('open');
    });
    
    // Handle option selection
    options.forEach(option => {
      option.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const value = this.getAttribute('data-value');
        const text = this.textContent.trim();
        
        // Update hidden input
        if (hiddenInput) {
          hiddenInput.value = value;
        }
        
        // Update button text
        textSpan.textContent = text;
        
        // Update selected state
        options.forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
        
        // Close dropdown
        dropdown.classList.remove('open');
        
        // Submit form automatically (like the original selects)
        const form = dropdown.closest('form');
        if (form) {
          form.submit();
        }
      });
    });
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function() {
    dropdowns.forEach(dropdown => {
      dropdown.classList.remove('open');
    });
  });
  
  // Close dropdowns on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdowns.forEach(dropdown => {
        dropdown.classList.remove('open');
      });
    }
  });
  
  // Keyboard navigation
  dropdowns.forEach(dropdown => {
    const button = dropdown.querySelector('.dropdown-button');
    const options = dropdown.querySelectorAll('.dropdown-option');
    let currentIndex = -1;
    
    button.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
          currentIndex = Array.from(options).findIndex(opt => opt.classList.contains('selected'));
          if (currentIndex === -1) currentIndex = 0;
          options[currentIndex]?.focus();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        dropdown.classList.add('open');
        currentIndex = 0;
        options[currentIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dropdown.classList.add('open');
        currentIndex = options.length - 1;
        options[currentIndex]?.focus();
      }
    });
    
    options.forEach((option, index) => {
      option.setAttribute('tabindex', '-1');
      
      option.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          currentIndex = (currentIndex + 1) % options.length;
          options[currentIndex].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
          options[currentIndex].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          dropdown.classList.remove('open');
          button.focus();
        }
      });
    });
  });
});