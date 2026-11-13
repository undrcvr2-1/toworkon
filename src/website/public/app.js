const languageButton = document.querySelector("#zarad_language");
const currentYear = document.querySelector("#current-year");
const catalogGrid = document.querySelector("#zarad_catalog");
const catalogStatus = document.querySelector("#zarad_catalog_status");
const slider = document.querySelector("#zarad_slider");

let currentLanguage = "ro";

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

function setLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;

  document.querySelectorAll("[data-ro][data-en]").forEach((element) => {
    element.textContent = element.dataset[language];
  });

  document.querySelectorAll("[data-alt-ro][data-alt-en]").forEach((image) => {
    image.alt = language === "ro" ? image.dataset.altRo : image.dataset.altEn;
  });

  if (languageButton) {
    languageButton.textContent = language === "ro" ? "EN" : "RO";
    languageButton.setAttribute(
      "aria-label",
      language === "ro" ? "Switch to English" : "Schimbă limba în română"
    );
    languageButton.title = language === "ro" ? "English" : "Română";
  }

  try {
    localStorage.setItem("zarad-language", language);
  } catch {
  }

  renderCatalog();
}

function renderCatalog() {
  if (!catalogGrid || !Array.isArray(window.zaradCatalog)) {
    return;
  }

  catalogGrid.replaceChildren();

  window.zaradCatalog.forEach((spice, index) => {
    const card = document.createElement("article");
    card.className = "catalog-card";

    const imageFrame = document.createElement("div");
    imageFrame.className = "catalog-card-image";

    const image = document.createElement("img");
    image.src = "/assets/" + spice.folder + "/" + spice.image;
    image.alt = currentLanguage === "ro" ? spice.name : spice.name_en;
    image.loading = "lazy";
    image.decoding = "async";
    imageFrame.append(image);

    const details = document.createElement("div");
    details.className = "catalog-card-details";

    const number = document.createElement("span");
    number.className = "catalog-card-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const heading = document.createElement("h2");
    heading.textContent = currentLanguage === "ro" ? spice.name : spice.name_en;

    const description = document.createElement("p");
    description.textContent = currentLanguage === "ro" ? spice.description : spice.description_en;

    details.append(number, heading, description);
    card.append(imageFrame, details);
    catalogGrid.append(card);
  });
}

async function loadCatalog() {
  if (!catalogGrid) {
    return;
  }

  try {
    const response = await fetch("/catalog.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Catalogul nu a putut fi încărcat");
    }

    window.zaradCatalog = await response.json();
    renderCatalog();
  } catch {
    if (catalogStatus) {
      catalogStatus.hidden = false;
    }
  }
}

function setupSlider() {
  if (!slider) {
    return;
  }

  const slides = Array.from(slider.querySelectorAll(".hero-slide"));
  const dots = Array.from(slider.querySelectorAll(".slider-dot"));
  const previous = slider.querySelector("#zarad_previous");
  const next = slider.querySelector("#zarad_next");
  let activeSlide = 0;
  let timer;
  let startX = 0;

  function showSlide(index) {
    activeSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeSlide;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));

      const image = slide.querySelector("img");
      if (active && image.dataset.src && !image.hasAttribute("src")) {
        image.src = image.dataset.src;
      }
    });

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeSlide;
      dot.classList.toggle("is-active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  function restartTimer() {
    window.clearInterval(timer);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      timer = window.setInterval(() => showSlide(activeSlide + 1), 6500);
    }
  }

  previous.addEventListener("click", () => {
    showSlide(activeSlide - 1);
    restartTimer();
  });

  next.addEventListener("click", () => {
    showSlide(activeSlide + 1);
    restartTimer();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      restartTimer();
    });
  });

  slider.addEventListener("mouseenter", () => window.clearInterval(timer));
  slider.addEventListener("mouseleave", restartTimer);

  slider.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });

  slider.addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) > 45) {
      showSlide(activeSlide + (distance < 0 ? 1 : -1));
      restartTimer();
    }
  }, { passive: true });

  showSlide(0);
  restartTimer();
}

let savedLanguage = "ro";

try {
  savedLanguage = localStorage.getItem("zarad-language") === "en" ? "en" : "ro";
} catch {
  savedLanguage = "ro";
}

setLanguage(savedLanguage);
loadCatalog();
setupSlider();

if (languageButton) {
  languageButton.addEventListener("click", () => {
    setLanguage(currentLanguage === "ro" ? "en" : "ro");
  });
}
