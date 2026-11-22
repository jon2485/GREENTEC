// Nav Toggle Start
const $barIcon = $(".bar-icon");
const $closeIcon = $(".close-icon");
const $toggleNavButton = $("#toggle-nav");
const $nav = $("#nav");

$toggleNavButton.on("click", () => {
  $nav.toggleClass("nav-open");
  $barIcon.toggleClass("d-none");
  $closeIcon.toggleClass("d-none");
});
// Nav Toggle End
$(document).ready(function () {
  function handleDropdownHover() {
    if ($(window).width() >= 992) {
      // lg breakpoint
      $(".main-header .dropdown").hover(
        function () {
          $(this).addClass("show");
          $(this).find(".dropdown-menu").addClass("show");
        },
        function () {
          $(this).removeClass("show");
          $(this).find(".dropdown-menu").removeClass("show");
        },
      );
    } else {
      // Remove hover behavior on small screens
      $(".main-header .dropdown").off("mouseenter mouseleave");
    }
  }

  // Run on load
  handleDropdownHover();

  // Run on resize
  $(window).resize(function () {
    handleDropdownHover();
  });

  // Search Toggle Logic
  const $searchTrigger = $("#search-trigger");
  const $searchBox = $(".search-box-wrapper");
  const $searchInput = $(".search-input-field");
  const $suggestions = $(".search-suggestions");

  $searchTrigger.on("click", function (e) {
    e.stopPropagation();
    $searchBox.toggleClass("active").removeClass("d-none");
    if ($searchBox.hasClass("active")) {
      $searchInput.focus();
    }
  });

  $(document).on("click", function (e) {
    if (!$searchBox.is(e.target) && $searchBox.has(e.target).length === 0 && !$searchTrigger.is(e.target)) {
      $searchBox.removeClass("active");
      $suggestions.addClass("d-none");
    }
  });

  // Mock Suggestions Data
  const mockSuggestions = [
    { name: "חסידית", category: "מוזיקה" },
    { name: "חב”ד", category: "מוזיקה" },
    { name: "שירי פסח", category: "חגים" },
    { name: "מקהלות", category: "מוזיקה" },
    { name: "סרטים לילדים", category: "סרטים" }
  ];

  $searchInput.on("input", function () {
    const val = $(this).val().toLowerCase();
    $suggestions.empty();

    if (val.length > 0) {
      const filtered = mockSuggestions.filter(s => s.name.toLowerCase().includes(val));

      if (filtered.length > 0) {
        filtered.forEach(item => {
          $suggestions.append(`
            <div class="search-suggestion-item">
              <span class="name">${item.name}</span>
              <span class="category">${item.category}</span>
            </div>
          `);
        });
        $suggestions.removeClass("d-none");
      } else {
        $suggestions.addClass("d-none");
      }
    } else {
      $suggestions.addClass("d-none");
    }
  });

  // Prevent closing when clicking inside search input/suggestions
  $searchBox.on("click", function(e) {
    e.stopPropagation();
  });
});
