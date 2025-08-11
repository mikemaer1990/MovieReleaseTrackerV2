// public/js/top-releases.js
console.log("top-releases.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".filter-form");
  if (!form) {
    console.warn("No .filter-form found on page");
    return;
  }

  const sortSelect = form.querySelector("#sort");
  const genreSelect = form.querySelector("#genre");

  if (sortSelect) {
    sortSelect.addEventListener("change", () => form.submit());
  }

  if (genreSelect) {
    genreSelect.addEventListener("change", () => form.submit());
  }
});
