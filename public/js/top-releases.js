// public/js/top-releases.js
console.log("top-releases.js loaded");

document.addEventListener("DOMContentLoaded", function () {
  const sortSelect = document.getElementById("sort");
  const genreSelect = document.getElementById("genre");
  const form = document.querySelector(".filter-form");

  if (!form) {
    console.warn("No .filter-form found on page");
    return;
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      form.submit();
    });
  }

  if (genreSelect) {
    genreSelect.addEventListener("change", function () {
      form.submit();
    });
  }
});
