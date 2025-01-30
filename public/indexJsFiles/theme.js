const MessageSend = document.querySelector(".MessageSend");
function toggleMobileMenu() {
  const mobileMenu = document.querySelector(".mobile-menu");
  const body = document.querySelector("body");

  if (mobileMenu.classList.contains("show")) {
    mobileMenu.classList.remove("show");
    mobileMenu.classList.add("hide");
    body.style.overflow = "auto";
  } else {
    mobileMenu.classList.remove("hide");
    mobileMenu.classList.add("show");
    body.style.overflow = "hidden";
  }
}

function decryptData(encryptedData) {
  try {
    // Basic validation check
    if (!encryptedData || typeof encryptedData !== "string") {
      throw new Error("Invalid encrypted data format");
    }
    return JSON.parse(atob(encryptedData)); // Decode from base64, then parse JSON
  } catch (error) {
    console.error("Error decrypting data:", error);
    return null;
  }
}

const settings = document.querySelector(".settings");
const leftPanel = document.getElementById("leftPanel");
const burgerSettings = document.getElementById("burger-settings");

settings.addEventListener("click", (event) => {
  event.preventDefault();
  openMenu();
  event.stopPropagation();
});

function openMenu() {
  // Toggle active/inactive classes for the animation
  if (leftPanel.classList.contains("active")) {
    leftPanel.classList.remove("active");
    leftPanel.classList.add("inactive");
    burgerSettings.checked = false;

    // Hide panel after animation completes
    setTimeout(() => {
      leftPanel.style.display = "none";
      $(leftPanel).css("z-index", "1");
    }, 400); // Duration matches the slideOut animation
  } else {
    leftPanel.style.display = "flex"; // Display before animation
    leftPanel.classList.remove("inactive");
    leftPanel.classList.add("active");
    $(leftPanel).css("z-index", "100000000000");
    burgerSettings.checked = true;
  }
}

const themeSelect = document.getElementById("theme");
const notificationsCheckbox = document.getElementById("notifications");
const randomBackgroundInput = document.getElementById("randomBackground");

themeSelect.addEventListener("change", () => {
  const selectedTheme = themeSelect.value;

  applyTheme(selectedTheme);
});

randomBackgroundInput.addEventListener("change", () => {
  const randomBackgroundEnabled = randomBackgroundInput.checked;
  const backgroundSelector = document.getElementById("background-selector");

  if (randomBackgroundInput.checked) {
    backgroundSelector.style.display = "none";
  } else {
    backgroundSelector.style.display = "block";
  }
});

function applyTheme(theme) {
  if (theme === "LightMode") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
}

burgerSettings.addEventListener("change", openMenu);

document.addEventListener("click", (event) => {
  if (!leftPanel.contains(event.target) && event.target !== settings) {
    if (leftPanel.classList.contains("active")) {
      leftPanel.classList.remove("active");
      leftPanel.classList.add("inactive");

      // Hide the panel after the animation completes
      setTimeout(() => {
        leftPanel.style.display = "none";
      }, 400); // Match duration to slideOut animation
    }
  }
});

leftPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

let array = []; // Initialize an empty array
let currentBackgroundId = 1; // Will hold the background ID based on the URL

document.addEventListener("DOMContentLoaded", () => {
  const username = decryptData(sessionStorage.getItem("username"));
  const themeSelect = document.getElementById("theme");
  const notificationsToggle = document.getElementById("notifications");
  const randomBackgroundToggle = document.getElementById("randomBackground");
  const backgroundSelector = document.getElementById("background-selector");
  const autoJoinCheckbox = document.getElementById("autoJoin");
  const hideOwnerToggle = document.getElementById("hideOwner");

  function InitiallyCalls() {
    loadUserSettings(username).then(() => {
      document.getElementById("ThemeJS").checked = true;
    });
  }

  if (username) {
    InitiallyCalls();
  }

  // Save settings on theme change
  themeSelect.addEventListener("change", saveUserSettings);
  notificationsToggle.addEventListener("change", saveUserSettings);
  randomBackgroundToggle.addEventListener("change", saveUserSettings);
  autoJoinCheckbox.addEventListener("change", saveUserSettings);
  hideOwnerToggle.addEventListener("change", saveUserSettings);

  // Listen for background changes
  backgroundSelector.addEventListener("click", (event) => {
    if (event.target.classList.contains("thumbnail")) {
      const selectedImageUrl = event.target.dataset.url;
      currentBackgroundId = findBackgroundIdByUrl(selectedImageUrl); // Get the matching ID from the URL
      setBackground(selectedImageUrl); // Set the background image and save the background ID
    }
  });

  document.getElementById("leftPanel").addEventListener("click", (event) => {
    event.stopPropagation();
  });

  // Observe changes to the background of the chat element
  observeBackgroundChange();
});

function loadUserSettings(username) {
  return fetch("/userdata/background.json")
    .then((response) => response.json())
    .then((data) => {
      array = data;

      fetch(`/api/user-settings/${username}`)
        .then((response) => response.json())
        .then((settings) => {
          const themeSelect = document.getElementById("theme");
          const notificationsToggle = document.getElementById("notifications");
          const randomBackgroundToggle =
            document.getElementById("randomBackground");
          const autoJoinCheckbox = document.getElementById("autoJoin");
          const hideOwnerToggle = document.getElementById("hideOwner");
          const ownerSection = document.querySelector(".owner-settings");

          // Show owner toggle only for owner role
          const role = decryptData(sessionStorage.getItem("role"));
          if (role === "owner") {
            hideOwnerToggle.checked = settings.hideOwner;
            ownerSection.style.display = "block";
          }

          // Apply settings
          themeSelect.value = settings.theme ? "DarkMode" : "LightMode";
          notificationsToggle.checked = settings.notifications;
          randomBackgroundToggle.checked = settings.randomBackground;
          autoJoinCheckbox.checked = settings.autoJoin;

          applyTheme(themeSelect.value);

          const backgroundSelector = document.getElementById(
            "background-selector"
          );
          if (!settings.randomBackground) {
            backgroundSelector.style.display = "block";
          }

          if (settings.currentBackgroundId) {
            setBackgroundById(settings.currentBackgroundId);
          }

          // Add event listeners
          autoJoinCheckbox.addEventListener("change", () => {
            if (autoJoinCheckbox.checked) {
              window.dispatchEvent(
                new CustomEvent("autoJoinChecked", {
                  detail: { checked: true },
                })
              );
            }
          });

          if (autoJoinCheckbox.checked) {
            window.dispatchEvent(
              new CustomEvent("autoJoinChecked", {
                detail: { checked: true },
              })
            );
          }
        })
        .catch((error) => console.error("Error loading user settings:", error));
    })
    .catch((error) => console.error("Error loading background.json:", error));
}

function saveUserSettings() {
  const username = decryptData(sessionStorage.getItem("username"));
  const role = decryptData(sessionStorage.getItem("role"));
  const theme = document.getElementById("theme").value === "DarkMode";
  const notifications = document.getElementById("notifications").checked;
  const randomBackground = document.getElementById("randomBackground").checked;
  const autoJoin = document.getElementById("autoJoin").checked;
  const hideOwner = document.getElementById("hideOwner").checked;

  const settings = {
    username,
    theme,
    notifications,
    randomBackground,
    autoJoin,
    currentBackgroundId: currentBackgroundId || 1,
  };

  // Add hideOwner setting only for owner role
  if (role === "owner") {
    settings.hideOwner = hideOwner;
  }

  fetch("/api/user-settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  })
    .then((response) => response.json())
    .catch((error) => console.error("Error saving settings:", error));
}

function setBackgroundById(id) {
  const background = array.find((item) => item.id === id);
  const chat = document.getElementById("chat");
  if (background) {
    chat.style.backgroundImage = `url('${background.url}')`;
  }
}

function setBackground(url) {
  // Apply background image
  const chat = document.getElementById("chat");
  chat.style.backgroundImage = `url('${url}')`;

  // Find the background ID based on the URL
  currentBackgroundId = findBackgroundIdByUrl(url);

  // Save the background ID
  saveUserSettings();
}

function findBackgroundIdByUrl(url) {
  const background = array.find((item) => item.url === url);
  return background ? background.id : 1; // Return the ID if a match is found
}

function observeBackgroundChange() {
  const chat = document.getElementById("chat");

  const observer = new MutationObserver(() => {
    const backgroundUrl = chat.style.backgroundImage;
    if (backgroundUrl && backgroundUrl !== "none") {
      const match = backgroundUrl.match(/url\(["'](.*?)["']\)/); // Extract the URL from backgroundImage
      if (match && match[1]) {
        currentBackgroundId = findBackgroundIdByUrl(match[1]);
        saveUserSettings(); // Save the updated background ID
      }
    }
  });

  observer.observe(chat, {
    attributes: true,
    attributeFilter: ["style"],
  });
}
