// script.js
const chat = document.getElementById("chat");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const lobbySelect = document.getElementById("lobby-selection");
const joinButton = document.getElementById("lobby-option");
const statusDiv = document.getElementById("status");
const statuslobbyDiv = document.getElementById("statuslobby");

let ws;
let currentLobby = document
  .getElementsByClassName("lobby-option")[0]
  .getAttribute("data-lobby");

let username = decryptData(sessionStorage.getItem("username"));
let role = decryptData(sessionStorage.getItem("role"));
let kicked = decryptData(sessionStorage.getItem("kicked"));

if (!username) {
  window.location.href = "/login.html";
}

function InitiallCallings() {
  return new Promise((resolve) => {
    if (kicked === "true") {
      toggleKickedStatus();
    }

    loadOffensiveWords();
    loadReplacements();

    fetch(`/get-lobbies?username=${username}&role=${role}`)
      .then((response) => response.json())
      .then((data) => {
        const lobbies = data.lobbies;
        loadLobbies(lobbies);
      })
      .then(() => {
        document.getElementById("burger").checked = false;
        document.getElementById("burgerHelper").checked = false;
        resolve();
      })
      .catch((error) => {
        console.error("Error loading lobbies:", error);
        resolve(); // Resolve even on error to continue chain
      });
  });
}

function decryptData(encryptedData) {
  try {
    if (!encryptedData || typeof encryptedData !== "string") {
      throw new Error("Invalid encrypted data format");
    }
    return JSON.parse(atob(encryptedData));
  } catch (error) {
    console.error("Error decrypting data:", error);
    return null;
  }
}

function encryptData(data) {
  return btoa(JSON.stringify(data));
}

function fadeIn(element, duration) {
  element.style.opacity = 0;
  element.style.display = "flex";

  let opacity = 0;
  const interval = 50;
  const increment = interval / duration;

  const fade = setInterval(() => {
    opacity += increment;
    if (opacity >= 1) {
      clearInterval(fade);
      element.style.opacity = 1;
    } else {
      element.style.opacity = opacity;
    }
  }, interval);
}

function fadeOut(element, duration) {
  let opacity = 1;
  const interval = 50;
  const decrement = interval / duration;

  const fade = setInterval(() => {
    opacity -= decrement;
    if (opacity <= 0) {
      clearInterval(fade);
      element.style.opacity = 1;
      element.style.display = "none";
    } else {
      element.style.opacity = opacity;
    }
  }, interval);
}

let offensiveWords = [];
let replacements = {};

function loadOffensiveWords() {
  fetch("blacklist/offensiveWords.json")
    .then((response) => response.json())
    .then((data) => {
      offensiveWords = data;
    })
    .catch((error) => {
      console.error("Failed to load offensive words:", error);
    });
}

function loadReplacements() {
  fetch("blacklist/replacements.json")
    .then((response) => response.json())
    .then((data) => {
      replacements = data;
    })
    .catch((error) => {
      console.error("Failed to load replacements:", error);
    });
}

function createRegex(word) {
  function escapeRegexChar(char) {
    const specialChars = [
      "\\",
      ".",
      "^",
      "$",
      "*",
      "+",
      "?",
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      "|",
      "/",
      "!",
      "@",
      "#",
      "&",
      "-",
      "_",
    ];
    return specialChars.includes(char) ? "\\" + char : char;
  }

  let regexString = word
    .split("")
    .map((char) => {
      if (replacements[char.toLowerCase()]) {
        return `[${replacements[char.toLowerCase()].join("")}]`; // Include replacements in a character set
      }
      return escapeRegexChar(char); // Escape any special character
    })
    .join("[\\.\\-_]?"); // Allow optional ".", "-", or "_" between characters

  // Add word boundaries and ensure the regex is valid
  return new RegExp(`\\b${regexString}\\b`, "gi");
}

function cleanMessage(message) {
  let cleanedMessage = message;
  let isCleaned = false;

  // Sort offensive words by length (longest first) to prioritize longer matches
  const sortedOffensiveWords = [...offensiveWords].sort(
    (a, b) => b.length - a.length
  );

  for (const word of sortedOffensiveWords) {
    const regex = createRegex(word);
    if (regex.test(cleanedMessage)) {
      const replacement = "*".repeat(word.length);
      cleanedMessage = cleanedMessage.replace(regex, replacement);
      isCleaned = true;
    }
  }

  return isCleaned ? cleanedMessage : message;
}

sendButton.onclick = () => {
  let message = messageInput.value.trim();

  if (message) {
    const cleanedMessage = cleanMessage(message);

    if (cleanedMessage !== message) {
      alert("Your message contains offensive words and has been sanitized.");
      alert("Beware, you can get banned.");
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      sendMessage(cleanedMessage);
    } else {
      alert("Not connected. Connecting to Lobby...");
      join().then(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          sendMessage(cleanedMessage);
        } else {
          alert("Failed to autoconnect. Please connect manually.");
        }
      });
    }
  }
};

function sendMessage(message) {
  const messageId = chat.childElementCount;
  const timestamp = new Date().toISOString();
  console.log("Sending message:", message);
  ws.send(
    JSON.stringify({
      type: "message",
      id: messageId,
      username: username,
      timestamp: timestamp,
      message: message,
      lobby: currentLobby,
    })
  );
  messageInput.value = "";
}

// Handle checkbox toggle
document
  .getElementById("enablePassword")
  .addEventListener("change", function () {
    const passwordInput = document.getElementById("lobbyPasswordInput");
    passwordInput.style.display = this.checked ? "block" : "none";
  });

function hasSpaces(str) {
  return /\s/.test(str);
}

function createLobby(lobbyName, username) {
  if (hasSpaces(lobbyName)) {
    alert("Lobby name should not contain spaces.");
    return;
  }

  const enablePassword = document.getElementById("enablePassword").checked;
  const passwordInput = document.getElementById("lobbyPasswordInput");
  const password = enablePassword ? passwordInput.value : null;

  fetch("/create-lobby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lobbyName, username, password }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert(data.error); // Alert if lobby already exists
      } else {
        const lobbyNameInput = document.getElementById("lobbyNameInput");
        const lobbyMenu = document.getElementById("lobbyMenu");
        updateLobbies();
        fadeOut(lobbyMenu, 400);
        lobbyNameInput.value = ""; // Clear input field
        passwordInput.value = ""; // Clear password field
        document.getElementById("enablePassword").checked = false; // Reset checkbox
        passwordInput.style.display = "none"; // Hide password input
      }
    })
    .catch((error) => {
      console.error("Error creating lobby:", error);
    });
}

function updateLobbies() {
  fetch(`/get-lobbies?username=${username}&role=${role}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.lobbies) {
        loadLobbies(data.lobbies); // Call loadLobbies with the retrieved lobbies
      } else {
        console.error("No lobbies found.");
      }
    })
    .catch((error) => {
      console.error("Error fetching lobbies:", error);
    });
}

function loadLobbies(lobbies) {
  const lobbyList = document.getElementById("lobby-list");
  lobbyList.innerHTML = ""; // Clear the existing list

  // Material Symbols Outlined array for random selection
  let materialIcons = [
    "star",
    "check_circle",
    "check_box",
    "bolt",
    "lock",
    "star",
    "add_box",
    "do_not_disturb_on",
    "access_alarm",
    "location_on",
    "indeterminate_check_box",
    "dynamic_form",
    "data_thresholding",
    "view_compact_alt",
    "deployed_code",
    "empty_dashboard",
    "page_info",
    "capture",
    "buttons_alt",
    "bottom_navigation",
    "iframe",
    "error_med",
    "thumb_up",
    "pets",
    "water_drop",
    "rocket_launch",
    "recommend",
    "partly_cloudy_day",
    "south_america",
    "taunt",
    "bomb",
    "priority",
    "battery_4_bar",
    "wifi_2_bar",
    "heart_check",
    "sweep",
    "patient_list",
    "expansion_panels",
    "settings_heart",
    "category_search",
    "error_med",
    "multimodal_hand_eye",
    "iframe_off",
    "cyclone",
    "severe_cold",
    "globe_asia",
    "specific_gravity",
    "sentiment_calm",
    "raven",
    "sentiment_stressed",
    "mountain_flag",
    "lab_research",
    "weather_hail",
    "altitude",
    "emoticon",
    "emoji_objects",
    "rocket",
    "cruelty_free",
    "mood_bad",
    "skull",
    "person_alert",
    "sentiment_calm",
    "skull_list",
    "planet",
    "flutter_dash",
    "contacts_product",
    "water_lock",
    "satellite_alt",
    "work",
  ];

  // Loop through each lobby and create a list item
  lobbies.forEach((lobby) => {
    const li = document.createElement("li");
    li.classList.add("lobby-li");
    const a = document.createElement("a");
    a.href = "#";
    a.classList.add("lobby-option");
    a.setAttribute("data-lobby", lobby.lobby);

    const LobbyName = document.createElement("div");
    LobbyName.textContent = lobby.lobby;
    LobbyName.classList.add("LobbyName");
    a.appendChild(LobbyName);

    // Create the random icon element
    const iconContainer = document.createElement("div");
    const icon = document.createElement("span");
    icon.classList.add("material-symbols-outlined");
    iconContainer.classList.add("lobby-icon");
    shuffle(materialIcons);
    icon.textContent =
      materialIcons[Math.floor(Math.random() * materialIcons.length)];

    // Prepend the icon to the anchor tag
    a.prepend(iconContainer);
    iconContainer.prepend(icon);

    const moreLink = document.createElement("a");
    moreLink.href = "#";
    moreLink.innerHTML = `<span class="material-symbols-outlined" id=${lobby.lobby}>more_vert</span>`;
    moreLink.classList.add("more-link");
    moreLink.id = lobby.lobby;
    moreLink.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation(); // Stop the event from propagating
      showMoreMenu(event);
    });

    li.appendChild(moreLink);

    if (lobby.lobbyOwner !== username) {
      moreLink.style.display = "none";
    }
    if (role !== "owner") {
      moreLink.style.transform = "translateX(-25px)";
    }

    const leave = document.createElement("a");
    leave.href = "#";
    leave.innerHTML = `<span class="material-symbols-outlined" id=${lobby.lobby}>logout</span>`;
    leave.classList.add("leaveLobbyButton");
    leave.id = lobby.lobby;
    leave.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation(); // Stop the event from propagating
      leaveLobby();
    });
    li.appendChild(leave);

    if (lobby.status === "public" || role === "owner") {
      leave.style.display = "none";
    }

    li.appendChild(a);
    lobbyList.appendChild(li);
  });

  // Add the "Create Lobby" button after all lobbies
  const createLobbyLi = document.createElement("li");
  const createLobbyButton = document.createElement("button");
  const addIcon = document.createElement("span");

  // Add classes and IDs
  createLobbyLi.classList.add("createLobbyLi");
  createLobbyButton.classList.add("lobby-icon");
  createLobbyButton.id = "createLobbyButton";
  addIcon.id = "add";
  addIcon.classList.add("material-symbols-outlined");
  addIcon.textContent = "add";

  // Append the "add" icon to the button and the button to the <li>
  createLobbyButton.appendChild(addIcon);
  createLobbyLi.appendChild(createLobbyButton);

  // Append to the lobby list
  lobbyList.appendChild(createLobbyLi);

  // Open the menu on button click
  createLobbyLi.addEventListener("click", () => {
    const lobbyMenu = document.getElementById("lobbyMenu");
    const lobbyNameInput = document.getElementById("lobbyNameInput");

    fadeIn(lobbyMenu, 400);
    lobbyNameInput.focus();
  });

  // Modal functionality (closing and creating lobby)
  const lobbyMenu = document.getElementById("lobbyMenu");
  const closeModal = document.querySelector(".close-modal");
  const createLobbySubmit = document.getElementById("createLobbySubmit");

  // Close modal when "x" is clicked
  closeModal.addEventListener("click", () => {
    fadeOut(lobbyMenu, 400);
  });

  // Create lobby when "Create Lobby" button in modal is clicked
  createLobbySubmit.addEventListener("click", () => {
    const lobbyNameInput = document.getElementById("lobbyNameInput");
    const lobbyName = lobbyNameInput.value.trim();

    if (lobbyName) {
      createLobby(lobbyName, username); // Use your createLobby function
    } else {
      alert("Please enter a valid lobby name.");
    }
  });

  // Close modal when clicking outside the content
  window.addEventListener("click", (event) => {
    if (event.target === lobbyMenu) {
      fadeOut(lobbyMenu, 200);
    }
  });
}

function addMemberToLobby(lobbyName, username) {
  fetch("/add-member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lobbyName, username }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        console.log(`User '${username}' added to lobby '${lobbyName}'`);
      } else {
        console.error(data.message);
      }
    })
    .catch((error) => console.error("Error adding member to lobby:", error));
}

function removeMemberFromLobby(lobbyName, username) {
  if (username === "root") {
    return;
  }

  fetch("/remove-member", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lobbyName, username }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        console.log(`User '${username}' removed from lobby '${lobbyName}'`);
      } else {
        console.error(data.message);
      }
    })
    .catch((error) =>
      console.error("Error removing member from lobby:", error)
    );
}

function showMoreMenu(event) {
  const moreMenu = document.getElementById("moreMenu");
  moreMenu.style.display = "flex";

  const lobbyNameText = event.target.id;

  moreMenu.setAttribute("data-lobby", lobbyNameText);
}

function inviteMember() {
  const moreMenu = document.getElementById("moreMenu");
  const lobbyName = moreMenu.getAttribute("data-lobby");
  const username = prompt("Enter the username to invite:");
  if (username) {
    addMemberToLobby(lobbyName, username);
  }
  moreMenu.style.display = "none";
}

function removeMember() {
  const moreMenu = document.getElementById("moreMenu");
  const lobbyName = moreMenu.getAttribute("data-lobby");
  const username = prompt("Enter the username to remove:");
  if (username) {
    removeMemberFromLobby(lobbyName, username);
  }
  moreMenu.style.display = "none";
}

function leaveLobby() {
  const lobbyName = event.target.id;

  if (
    window.confirm(`Are you sure you want to leave the lobby '${lobbyName}'?`)
  ) {
    removeMemberFromLobby(lobbyName, username);
  }
}

function deleteLobby() {
  const moreMenu = document.getElementById("moreMenu");
  const lobbyName = moreMenu.getAttribute("data-lobby");

  if (
    window.confirm(`Are you sure you want to delete the lobby '${lobbyName}'?`)
  ) {
    fetch("/delete-lobby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lobbyName }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          moreMenu.style.display = "none";
        } else {
          alert(`Failed to delete lobby '${lobbyName}'.`);
        }
      })
      .catch((error) => {
        console.error("Error deleting lobby:", error);
        alert("There was an error deleting the lobby.");
      });
  }
}

window.addEventListener("click", function (event) {
  const moreMenu = document.getElementById("moreMenu");
  if (
    !moreMenu.contains(event.target) &&
    !event.target.classList.contains("more-button")
  ) {
    moreMenu.style.display = "none";
  }
});

window.addEventListener("autoJoinChecked", (event) => {
  if (event.detail.checked) {
    join();
  }
});

const backgroundSelector = document.getElementById("background-selector");

// Function to change the background
function changeBackground() {
  const randomBackground = document.getElementById("randomBackground").checked;

  if (randomBackground === true) {
    changeBackgroundRandom();
  } else {
    backgroundSelector.style.display = "block";
  }
}

// Set the background when a thumbnail is clicked
backgroundSelector.addEventListener("click", (event) => {
  if (event.target.classList.contains("thumbnail")) {
    const selectedImage = event.target.dataset.url;
    chat.style.backgroundImage = `url("${selectedImage}")`;
  }
});

function shuffle(array) {
  let currentIndex = array.length;

  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
}

let arr = []; // Initialize an empty array

// Fetch and parse the JSON from the correct path
fetch("/userdata/background.json") // Use the correct URL based on the server configuration
  .then((response) => response.json()) // Parse the JSON from the response
  .then((data) => {
    arr = data.map((item) => item.url); // Update 'arr' with the data from the JSON
    thumbnail();
  })
  .catch((error) => {
    console.error("Error loading background.json:", error); // Handle any errors
  });

function changeBackgroundRandom() {
  shuffle(arr);
  shuffle(arr);
  shuffle(arr);
  chat.style.backgroundImage = `url("${arr.at(
    Math.floor(Math.random() * arr.length)
  )}")`;
}

function thumbnail() {
  const backgroundSelector = document.getElementById("background-selector");

  const observer = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        const thumbnailDiv = entry.target;

        if (entry.isIntersecting) {
          // Set the background image when the thumbnail is in view
          const url = thumbnailDiv.getAttribute("data-url");
          thumbnailDiv.style.backgroundImage = `url('${url}')`;
          thumbnailDiv.style.opacity = "1"; // Make the background visible
        } else {
          // Hide the background when the thumbnail goes out of view
          thumbnailDiv.style.opacity = "0";
        }
      });
    },
    { threshold: 0.1 }
  );

  // Assume 'arr' is an array of URLs for the background images
  arr.forEach((url, id) => {
    const thumbnailDiv = document.createElement("div");
    thumbnailDiv.className = "thumbnail";
    thumbnailDiv.setAttribute("data-url", url);

    // Initially, hide the background image
    thumbnailDiv.style.backgroundImage = "none";
    thumbnailDiv.style.opacity = "0"; // Start hidden

    // Start observing the thumbnail
    observer.observe(thumbnailDiv);

    backgroundSelector.appendChild(thumbnailDiv);
  });
}

function generateColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  const saturation = 100; // High saturation for bright color
  const lightness = 80 + (hash % 10); // High lightness for readability
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

let lastMessageDate = null; // Track the last message date
const stickyDateSeparator = document.createElement("div");
stickyDateSeparator.classList.add("sticky-date-separator");

function formatDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isNaN(date.getTime())) {
    return null;
  }

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
}

// Assuming currentLobby and chat are already defined
let lastMessageUsername = null;
let selectedMessageContainer = null;
let lobbyMessageData = {};
let FirstMessageAfterJoin = true;

function initializeLobbyData(lobbyName) {
  if (lobbyName && !lobbyMessageData[lobbyName]) {
    lobbyMessageData[lobbyName] = {
      lastMessageDate: null,
      lastMessageUsername: null,
      lastMessageLobby: lobbyName,
    };
  }
}

function appendMessage({
  id,
  username,
  timestamp,
  message,
  imageUrl,
  lobbyName,
  type = "message", // Default type is "message"
}) {
  let lobby = lobbyName || currentLobby;

  if (!lobby) {
    console.error("No lobby passed to appendMessage function!");
    return;
  }

  // Ensure username is defined
  if (!username) {
    console.error("Username is missing in message data.");
    return;
  }

  // Initialize lobby data if not already done
  initializeLobbyData(lobby);

  const messageDate = new Date(timestamp);
  const formattedDate = formatDate(messageDate); // Format the date for the message
  const lobbyData = lobbyMessageData[lobby];

  if (FirstMessageAfterJoin === true) {
    FirstMessageAfterJoin = false;
  }

  // Check if we need to add a new date separator (only for the current lobby)
  if (
    !lobbyData.lastMessageDate ||
    lobbyData.lastMessageDate.toDateString() !== messageDate.toDateString()
  ) {
    const dateSeparator = document.createElement("div");
    dateSeparator.setAttribute("data-timestamp", timestamp);
    dateSeparator.classList.add("date-separator", "message-container");
    dateSeparator.textContent = formattedDate;
    dateSeparator.dataset.lobby = lobby;
    chat.prepend(dateSeparator);
    lobbyData.lastMessageDate = messageDate; // Update the last message date for this lobby
    lobbyData.lastMessageUsername = null; // Reset last username for a new date
    if (formattedDate === "") {
      dateSeparator.style.display = "none"; // Hide date separator if formattedDate is empty
    }
  }

  const messageContainer = document.createElement("div");
  messageContainer.classList.add("message-container");

  const currentUser = decryptData(sessionStorage.getItem("username"));
  const isCurrentUser = username === currentUser;

  if (isCurrentUser) {
    messageContainer.classList.add("you");
    username = "You"; // Display "You" for the current user
  } else {
    messageContainer.classList.add("others");
  }

  const usernameDiv = document.createElement("div");
  usernameDiv.classList.add("username");
  usernameDiv.textContent = username;

  // Ensure the username color is generated
  if (username) {
    usernameDiv.style.color = generateColor(username);
  }

  const isFirstMessageAfterJoin = FirstMessageAfterJoin;
  const isSameUser =
    username === lobbyData.lastMessageUsername &&
    lobby === lobbyData.lastMessageLobby &&
    !isFirstMessageAfterJoin &&
    id !== 0;

  if (isSameUser) {
    usernameDiv.style.display = "none"; // Hide username for the same user
    messageContainer.classList.add("same-user");
  } else {
    usernameDiv.style.display = "block";
    messageContainer.classList.remove("same-user");
  }

  const messageBubble = document.createElement("div");
  messageBubble.classList.add("message-bubble");

  if (type === "picture" && imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Uploaded image";
    img.classList.add("uploaded-image");
    messageBubble.appendChild(img);
  } else if (type === "message" && message) {
    const messageTextElement = document.createElement("span");
    messageTextElement.textContent = message;
    messageTextElement.classList.add("message-text");
    messageBubble.appendChild(messageTextElement);
  } else {
    console.error("Unknown message type:", type);
  }

  const timestampDiv = document.createElement("div");
  timestampDiv.classList.add("timestamp");
  timestampDiv.textContent = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  messageBubble.appendChild(document.createTextNode(" "));
  messageBubble.appendChild(timestampDiv);

  messageContainer.dataset.id = id;
  messageContainer.dataset.lobby = lobby;
  messageContainer.dataset.timestamp = timestamp;
  messageContainer.dataset.username = username;
  messageContainer.dataset.type = type;
  messageContainer.appendChild(usernameDiv);
  messageContainer.appendChild(messageBubble);

  messageBubble.addEventListener("click", () => {
    selectedMessageContainer = messageContainer;
    messageContainer.classList.toggle("selected");
  });

  if (FirstMessageAfterJoin) {
    FirstMessageAfterJoin = false; // Reset after the first message
  }

  chat.prepend(messageContainer);

  lobbyData.lastMessageUsername = username;
  lobbyData.lastMessageLobby = lobby;
  // Initialize sticky date observer if needed
  initializeStickyDateObserver();
}

const chatContainer = document.getElementById("chat");

const observer = new MutationObserver((mutationsList) => {
  let shouldReprocessAll = false;

  for (const mutation of mutationsList) {
    if (mutation.type === "childList" || mutation.type === "characterData") {
      const addedNodes = mutation.addedNodes || [];
      const removedNodes = mutation.removedNodes || [];
      const targetNode = mutation.target;

      addedNodes.forEach((node) => {
        if (
          node.nodeType === 1 &&
          node.classList.contains("message-container")
        ) {
          processMessageContainer(node);
        }
      });

      if (
        targetNode &&
        targetNode.nodeType === 1 &&
        targetNode.classList.contains("message-container")
      ) {
        processMessageContainer(targetNode);
      }

      // Reprocess all messages if any were removed
      if (removedNodes.length > 0) {
        shouldReprocessAll = true;
      }
    }
  }

  // If a deletion was detected, reprocess all messages
  if (shouldReprocessAll) {
    updateAllMessages();
  }
});

// Set up the observer configuration
const config = { childList: true, subtree: true, characterData: true };

// Start observing changes in the #chat container
observer.observe(chatContainer, config);

function processMessageContainer(messageContainer) {
  const messageLobby = messageContainer.dataset.lobby;

  if (!messageLobby) {
    console.error("No 'data-lobby' found on message container");
    return;
  }

  const lobbyData = lobbyMessageData[messageLobby]; // Get the lobby data from the `lobbyMessageData` object
  const originalUsername = messageContainer.dataset.username;

  if (!lobbyData) {
    console.error(`No lobby data found for lobby: ${messageLobby}`);
    return;
  }

  const previousMessageContainer = messageContainer.nextElementSibling;
  const isSameUser =
    previousMessageContainer &&
    previousMessageContainer.dataset.username === originalUsername &&
    previousMessageContainer.dataset.lobby === messageLobby &&
    messageContainer.dataset.id !== "0";

  const usernameDiv = messageContainer.querySelector(".username");
  if (isSameUser) {
    if (usernameDiv) {
      usernameDiv.style.display = "none"; // Hide username for the same user
    }
    messageContainer.classList.add("same-user");
  } else {
    if (usernameDiv) {
      usernameDiv.style.display = "block"; // Show username for different user
    }
    messageContainer.classList.remove("same-user");
  }

  // Update last message data for the lobby after processing the new message
  lobbyData.lastMessageUsername = originalUsername;
  lobbyData.lastMessageLobby = messageLobby;

  if (FirstMessageAfterJoin) {
    FirstMessageAfterJoin = false; // Reset after the first message
  }
}

// Function to update all messages in #chat
function updateAllMessages() {
  const messageContainers =
    chatContainer.querySelectorAll(".message-container");

  messageContainers.forEach((messageContainer, index) => {
    const messageLobby = messageContainer.dataset.lobby;
    const originalUsername = messageContainer.dataset.username;

    if (messageContainer.classList.contains("date-separator")) {
      return; // Skip date-separator elements
    }

    if (!messageLobby || !originalUsername) {
      console.error("Invalid message attributes:", messageContainer);
      return;
    }

    const previousMessageContainer = messageContainers[index + 1];
    const isSameUser =
      previousMessageContainer &&
      previousMessageContainer.dataset.username === originalUsername &&
      previousMessageContainer.dataset.lobby === messageLobby &&
      messageContainer.dataset.id !== "0";

    const usernameDiv = messageContainer.querySelector(".username");
    if (isSameUser) {
      if (usernameDiv) usernameDiv.style.display = "none";
      messageContainer.classList.add("same-user");
    } else {
      if (usernameDiv) usernameDiv.style.display = "block";
      messageContainer.classList.remove("same-user");
    }
  });
}

function sendNotification(username, message, imageUrl) {
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      const notificationTitle = `New message from ${username}`;
      const notificationBody = imageUrl ? "Sent an image" : message;
      const notification = new Notification(notificationTitle, {
        body: notificationBody,
        icon: imageUrl || "", // Safari may ignore this
      });

      notification.onclick = () => window.focus();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          const notificationTitle = `New message from ${username}`;
          const notificationBody = imageUrl ? "Sent an image" : message;
          const notification = new Notification(notificationTitle, {
            body: notificationBody,
            icon: imageUrl || "", // Safari may ignore this
          });

          notification.onclick = () => window.focus();
        } else {
          console.log(
            "Notifications are not permitted on this device/browser."
          );
        }
      });
    }
  } else {
    console.log("Notifications are not supported in this browser.");
  }
}

// Function to handle the sticky date display
function initializeStickyDateObserver() {
  const messageContainers = document.querySelectorAll(".message-container");
  const stickyDateContainer = document.querySelector("#sticky-date-container");
  document.getElementById("chat-container").prepend(stickyDateSeparator); // Add the sticky separator to the chat

  const observer = new IntersectionObserver(
    (entries) => {
      let currentStickyDate = null;

      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Set the topmost visible date as the sticky date
          currentStickyDate = new Date(
            entry.target.getAttribute("data-timestamp")
          );
        }
      });

      // Update the sticky container content based on the topmost date
      if (currentStickyDate) {
        stickyDateContainer.textContent = formatDate(currentStickyDate);
        stickyDateContainer.classList.add("visible");
      }
    },
    {
      root: chat,
      threshold: 0,
      rootMargin: "0px 0px -100%",
    }
  );

  messageContainers.forEach((messageContainer) =>
    observer.observe(messageContainer)
  );
}

const messageMenu = document.getElementById("messageMenu");
let selectedMessage = null;

document.querySelectorAll(".chat-message").forEach((message) => {
  message.addEventListener("click", (event) => {
    selectedMessage = event.currentTarget;
    openMessageMenu(selectedMessage, event);
  });
});

function openMessageMenu(messageElement, clickEvent) {
  const chat = document.getElementById("chat");
  const chatContainer = document.getElementById("chat-container");
  const messageMenu = document.getElementById("messageMenu");

  clickEvent.stopPropagation();

  const messageRect = messageElement.getBoundingClientRect();
  const chatRect = chat.getBoundingClientRect();

  const currentUser = decryptData(sessionStorage.getItem("username"));
  const isCurrentUser = messageElement.classList.contains("you");

  const topPosition = messageRect.bottom - chatRect.top;
  const leftPosition = isCurrentUser
    ? messageRect.right - chatRect.left - messageMenu.offsetWidth
    : messageRect.left - chatRect.left;

  messageMenu.style.top = `${topPosition}px`;
  messageMenu.style.left = `${leftPosition}px`;

  messageMenu.style.display = "block";

  chat.classList.add("blur");

  let selectedMessageContainer = document.querySelector(
    ".selected-message-container"
  );

  const clonedMessageContainer = messageElement.parentNode.cloneNode(true);
  const usernameDiv = clonedMessageContainer.querySelector(".username");
  if (usernameDiv) {
    usernameDiv.remove();
  }

  clonedMessageContainer.style.maxWidth = "100%";
  clonedMessageContainer.style.margin = "0";
  clonedMessageContainer.style.boxSizing = "border-box";

  if (!selectedMessageContainer) {
    selectedMessageContainer = document.createElement("div");
    selectedMessageContainer.className = "selected-message-container";
    chatContainer.appendChild(selectedMessageContainer);
  } else {
    selectedMessageContainer.innerHTML = "";
  }

  selectedMessageContainer.style.position = "absolute";
  selectedMessageContainer.style.top = `${messageRect.top - chatRect.top}px`;
  selectedMessageContainer.style.left = `${leftPosition}px`;

  selectedMessageContainer.appendChild(clonedMessageContainer);

  document.addEventListener("click", (event) => {
    if (
      !messageMenu.contains(event.target) &&
      !selectedMessageContainer.contains(event.target)
    ) {
      closeMessageMenu();
    }
  });
}

function closeMessageMenu() {
  const messageMenu = document.getElementById("messageMenu");
  messageMenu.style.display = "none";

  const chat = document.getElementById("chat");
  chat.classList.remove("blur");

  const selectedMessageContainer = document.querySelector(
    ".selected-message-container"
  );
  if (selectedMessageContainer) {
    selectedMessageContainer.remove();
  }

  document.removeEventListener("click", closeMessageMenu);
}

// Pin message
document.getElementById("pinMessage").addEventListener("click", () => {
  const id = selectedMessageContainer.dataset.id;
  const timestamp = selectedMessageContainer.dataset.timestamp;
  if (selectedMessageContainer) {
    console.log("Pinning message:", id, timestamp);
    closeMessageMenu();
  }
});

// Reply message
document.getElementById("replyMessage").addEventListener("click", () => {
  const id = selectedMessageContainer.dataset.id;
  const timestamp = selectedMessageContainer.dataset.timestamp;
  if (selectedMessageContainer) {
    console.log("Replying message:", id, timestamp);
    closeMessageMenu();
  }
});

// Delete message
document.getElementById("deleteMessage").addEventListener("click", () => {
  if (selectedMessageContainer) {
    const id = selectedMessageContainer.dataset.id;
    const timestamp = selectedMessageContainer.dataset.timestamp;
    const originalUsername = selectedMessageContainer.dataset.username;
    const currentUser = decryptData(sessionStorage.getItem("username"));
    const role = decryptData(sessionStorage.getItem("role"));
    const type = selectedMessageContainer.dataset.type; // Retrieve message type
    const isMessageOwner =
      originalUsername === currentUser ||
      selectedMessageContainer.classList.contains("you");

    if (isMessageOwner || role === "admin" || role === "owner") {
      let confirmMessage;

      // Handle the message and picture types separately
      if (type === "picture") {
        confirmMessage = `Delete this image?`;
        if (ws && ws.readyState !== WebSocket.OPEN) {
          alert("Not connected. Cannot send image.");
        }
      } else {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          alert("Not connected. Cannot send message.");
        }
        const messageTextElement =
          selectedMessageContainer.querySelector(".message-text");
        const messageText = messageTextElement
          ? messageTextElement.textContent.trim()
          : "";

        confirmMessage = messageText
          ? `Delete this message: "${messageText}"?`
          : `Delete this message?`;
      }

      if (confirm(confirmMessage)) {
        // Send WebSocket message without "messageType"
        ws.send(
          JSON.stringify({ type: "delete", id, timestamp, messageType: type })
        );
        if (selectedMessageContainer) {
          const nextMessageContainer =
            selectedMessageContainer.nextElementSibling || null;
          const previousMessageContainer =
            selectedMessageContainer.previousElementSibling || null;

          selectedMessageContainer.remove();
          selectedMessageContainer = null;

          let lobby =
            currentLobby || selectedMessageContainer.dataset.lobbyName;
          if (
            lobbyMessageData[lobby] &&
            lobbyMessageData[lobby].lastMessageUsername === originalUsername
          ) {
            lobbyMessageData[lobby].lastMessageUsername = null;
          }

          closeMessageMenu();
        }
      }
    } else {
      console.log("You don't have permission to delete this message.");
    }
  } else {
    console.log("No message selected for deletion.");
  }
});

// Edit message
document.getElementById("editMessage").addEventListener("click", () => {
  if (selectedMessageContainer) {
    const id = selectedMessageContainer.dataset.id;
    const timestamp = selectedMessageContainer.dataset.timestamp;
    const originalUsername = selectedMessageContainer.dataset.username;
    const currentUser = decryptData(sessionStorage.getItem("username"));
    const role = decryptData(sessionStorage.getItem("role"));
    const type = selectedMessageContainer.dataset.type; // Retrieve message type
    const isMessageOwner =
      originalUsername === currentUser ||
      selectedMessageContainer.classList.contains("you");

    if (isMessageOwner || role === "admin" || role === "owner") {
      if (type === "picture") {
        alert("Editing images is not supported.");
        return;
      }

      // Prompt the user to enter a new message text
      // Prompt the user to enter a new message text
      const currentMessageTextElement =
        selectedMessageContainer.querySelector(".message-text");
      const currentMessageText = currentMessageTextElement
        ? currentMessageTextElement.innerHTML.trim() // Use innerHTML instead of textContent if you want to capture HTML content
        : "";
      const newMessageText = prompt("Edit your message:", currentMessageText);

      if (newMessageText && newMessageText !== currentMessageText) {
        // Send the edit request to the server
        ws.send(
          JSON.stringify({
            type: "edit",
            id: id,
            username: originalUsername,
            timestamp: timestamp,
            newText: newMessageText,
          })
        );

        // Update the message text on the client side immediately
        if (currentMessageTextElement) {
          currentMessageTextElement.textContent = newMessageText;
        }

        closeMessageMenu();
      }
    } else {
      console.log("You don't have permission to edit this message.");
    }
  } else {
    console.log("No message selected for editing.");
  }
});

chat.addEventListener("click", (event) => {
  const messageBubble = event.target.closest(".message-bubble");
  if (messageBubble) {
    event.stopPropagation();
    selectedMessage = messageBubble;
    openMessageMenu(selectedMessage, event);
  }
});

// Ensure the sticky date container is created and added to DOM
function setupStickyDateContainer() {
  const chatContainer = document.getElementById("chat-container");
  const stickyDateContainer = document.createElement("div");
  stickyDateContainer.id = "sticky-date-container";
  stickyDateContainer.classList.add("sticky-date-container");
  chatContainer.appendChild(stickyDateContainer);
  chat.parentNode.insertBefore(stickyDateContainer, chat);
}

setupStickyDateContainer();
const imageInput = document.getElementById("imageInput");
const sendImageButton = document.getElementById("sendImage");

// Trigger file input when 'Send Image' button is clicked
sendImageButton.onclick = () => {
  imageInput.click();
};

// Handle the image file selection
imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (file && ws && ws.readyState === WebSocket.OPEN) {
    const reader = new FileReader();
    reader.onload = () => {
      const imageBase64 = reader.result.split(",")[1]; // Extract the base64 part
      const timestamp = new Date().toISOString();

      // Send the image data as a message
      ws.send(
        JSON.stringify({
          type: "image",
          username: username,
          timestamp: timestamp,
          data: imageBase64,
        })
      );
    };
    reader.readAsDataURL(file); // Read the file as a base64 encoded string
  } else {
    alert("Not connected. Cannot send image.");
  }
};

const dateSeparator = document.getElementById("sticky-date-container");

let scrollTimeout;

chatContainer.addEventListener("scroll", () => {
  // Add the active class to fade in the separator
  dateSeparator.classList.add("active");
  chatContainer.classList.add("chatScroll");

  // Clear any previous timeout to prevent premature fade out
  clearTimeout(scrollTimeout);

  // Set a timeout to fade out the separator after scrolling stops
  scrollTimeout = setTimeout(() => {
    dateSeparator.classList.remove("active");
    chatContainer.classList.remove("chatScroll");
  }, 1500); // Adjust timeout duration as needed

  // Ensure the baseline is the position of the sticky-date-container relative to the viewport
  const baseLine = document
    .querySelector(".sticky-date-container")
    .getBoundingClientRect().y;

  const separators = document.getElementsByClassName("date-separator");

  for (let i = 0; i < separators.length; i++) {
    const separator = separators[i];
    const sy = separator.getBoundingClientRect().y;

    // Adjust the calculation for the separator's position
    const diff = (sy - baseLine) / 5; // Difference from baseline
    const diffPercent = diff.toString() + "%";

    separator.style.width = "calc(20% + " + diffPercent + ")";

    // Adjust visibility based on position relative to the baseline
    if (diff < 0) {
      separator.style.visibility = "hidden";
    } else {
      separator.style.visibility = "visible";
    }
  }
});

// Initial fade-out if no scrolling occurs after loading
dateSeparator.classList.remove("active");

function updateOnlineUsers(users) {
  const username = decryptData(sessionStorage.getItem("username"));
  const currentRole = decryptData(sessionStorage.getItem("role"));

  fetch(`/api/user-settings/${username}`)
    .then((response) => response.json())
    .then((settings) => {
      const hideOwner = settings.hideOwner;
      let displayUsers = [...users];

      statuslobbyDiv.textContent = `-- ${currentLobby} --`;
      statusDiv.textContent = `-- Online: ${displayUsers.join(", ")} --`;
    })
    .catch((error) => console.error("Error fetching user settings:", error));
}

const alwaysOnCheckbox = document.getElementById("alwaysOnCheckbox");
const statusText = document.getElementById("statusText");

function updateStatusText() {
  if (alwaysOnCheckbox.checked) {
    statusText.textContent = "Always Connected";
    statusText.classList.add("fade-in");
  } else {
    statusText.textContent = "Disconnect after Inactivity";
    statusText.classList.add("fade-in");
  }
  setTimeout(() => {
    statusText.classList.remove("fade-in");
  }, 2000);
}

// Add event listener for the checkbox
alwaysOnCheckbox.addEventListener("change", updateStatusText);

const PING_INTERVAL = 150000; // 2.5 min.
const PONG_TIMEOUT = 10000; // 10 seconds

let pingInterval; // For ping intervals
let pongTimeout; // For pong timeout

function startPing() {
  if (alwaysOnCheckbox.checked) {
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (alwaysOnCheckbox.checked) {
          ws.send(JSON.stringify({ type: "ping" }));
          startPongTimeout();
        }
      } else {
        if (alwaysOnCheckbox.checked) {
          console.warn("WebSocket is not open. Current state:", ws.readyState);
          reconnect();
        }
      }
    }, PING_INTERVAL);
  }
}

function startPongTimeout() {
  clearTimeout(pongTimeout);
  pongTimeout = setTimeout(() => {
    console.warn("No pong received. Attempting to reconnect...");
    reconnect();
  }, PONG_TIMEOUT);
}

function stopPing() {
  clearInterval(pingInterval);
  clearTimeout(pongTimeout);
}

function reconnect() {
  if (ws) {
    ws.close();
  }
  join();
}

function updateLobbyStatus(lobbyName, status) {
  fetch("/update-lobby-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lobbyName: lobbyName,
      status: status,
    }),
  })
    .then((response) => response.json())
    .catch((error) => {
      console.error("Error updating lobby status:", error);
    });
}

function join() {
  if (ws) {
    ws.close();
  }

  checkLobbyPassword(currentLobby, () => {
    ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`
    );

    ws.onopen = () => {
      console.log("Connected to the server");
      updateLobbyStatus(currentLobby, true);
      ws.send(
        JSON.stringify({
          type: "join",
          lobby: currentLobby,
          username: username,
          role: role,
        })
      );

      chat.innerHTML = "";

      initializeLobbyData(currentLobby);

      if (alwaysOnCheckbox.checked) {
        startPing();
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      statusDiv.textContent = "-- Connection error --";
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "pong") {
        clearTimeout(pongTimeout); // Clear pong timeout on receiving pong
        if (alwaysOnCheckbox.checked) {
          startPing();
        }
      } else if (data.type === "ROLE_CHANGE") {
        const { username, role } = data;

        const encryptedUserDataRole = encryptData(role);

        // Update sessionStorage for the specific user
        sessionStorage.setItem(`role`, encryptedUserDataRole);

        if (role === "banned") {
          window.location.href = "/banned.html";
        }

        // Optional: Log to confirm the change
        console.log(`Role of ${username} changed to ${role}`);
      } else if (data.type === "delete") {
        const messageDiv = chat.querySelector(
          `div[data-id="${data.id}"][data-timestamp="${data.timestamp}"]`
        );
        if (messageDiv) {
          messageDiv.remove();
        }
      } else if (data.type === "onlineUsers") {
        updateOnlineUsers(data.users);
      } else if (data.type === "chatHistory") {
        data.messages.forEach(appendMessage);
      } else if (data.type === "clear") {
        chat.innerHTML = "";
      } else if (data.type === "newLobby") {
        updateLobbies();
      } else if (data.type === "system" && username === data.requester) {
        alert(data.message);
      } else if (data.type === "kick") {
        const usernameFromSession = decryptData(
          sessionStorage.getItem("username")
        );
        const encryptedKickedStatus = encryptData("true");

        // Check if the decrypted username matches the incoming data.username
        if (data.username === usernameFromSession) {
          toggleKickedStatus();
          sessionStorage.setItem("kicked", encryptedKickedStatus);
        }
      } else if (data.type === "AdminClear") {
        chat.innerHTML = "";

        appendMessage({
          id: Date.now(),
          username: "System",
          timestamp: new Date().toISOString(),
          message: "Chat has been cleared by the admin.",
        });
      } else if (data.type === "lobby-deleted") {
        const { lobbyName, redirectTo } = data;

        if (currentLobby === lobbyName) {
          currentLobby = redirectTo;

          console.log(
            `Redirecting to the first available lobby: ${redirectTo}`
          );

          fetchUpdatedLobbies().then(() => {
            const firstLobbyElement =
              document.getElementsByClassName("lobby-option")[0];
            if (firstLobbyElement) {
              const newLobbyName = firstLobbyElement.getAttribute("data-lobby");
              joinLobby(newLobbyName);
            }
          });
        }
      } else if (data.type === "edit") {
        const messageDiv = chat.querySelector(
          `div[data-id="${data.id}"][data-timestamp="${data.timestamp}"]`
        );

        if (messageDiv) {
          const messageTextElement = messageDiv.querySelector(".message-text");
          if (messageTextElement) {
            messageTextElement.textContent = data.message;
          } else {
            console.error("Message text element not found.");
          }
        } else {
          console.error("Message not found for editing.");
        }
      } else {
        if (!data.username) {
          console.error("Username is missing in the received data.");
          return;
        }
        const currentUser = decryptData(sessionStorage.getItem("username"));
        const isCurrentUser = data.username === currentUser;
        const notificationsCheckbox = document.getElementById("notifications");
        appendMessage(data);
        if (!isCurrentUser && notificationsCheckbox.checked) {
          sendNotification(data.username, data.message, data.imageUrl);
        }
      }
    };

    ws.onclose = () => {
      console.log("Connection closed");
      statusDiv.textContent = "-- Connection closed --";
      clearInterval(pingInterval);
    };

    console.log(`Joining ${currentLobby} as ${username}`);

    document.getElementById("burger").checked = true;
    document.getElementById("burgerHelper").checked = true;
  });
}

function checkLobbyPassword(lobbyName, callback) {
  fetch("userdata/lobby.json")
    .then((response) => response.json())
    .then((data) => {
      const lobby = data.find((lobby) => lobby.lobby === lobbyName);
      let password = null;

    if (role === "owner") {
      password = null;
    } else if (lobby && lobby.password) {
        password = prompt("Enter the password for this lobby:");
      }

      fetch("/join-lobby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lobbyName, username, role, password }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            callback();
          } else {
            alert(data.message);
          }
        })
        .catch((error) => {
          console.error("Error joining lobby:", error);
        });
    })
    .catch((error) => {
      console.error("Error fetching lobbies:", error);
    });
}

function toggleKickedStatus() {
  const rulesBackground = document.getElementById("rulesBackground");
  const rulesInput = document.querySelector(".rulesInput");
  const countdownElement = document.getElementById("kickCountdown");
  let countdown = 30;
  countdownElement.textContent = `You can rejoin in ${countdown} seconds`;

  fadeIn(rulesBackground, 300);
  rulesInput.focus();
  document.body.style.overflow = "hidden";

  const countdownInterval = setInterval(() => {
    countdown--;
    countdownElement.textContent = `You can rejoin in ${countdown} seconds`;

    if (countdown <= 0) {
      const encryptedKickedStatus = encryptData("false");

      sessionStorage.setItem("kicked", encryptedKickedStatus);
      clearInterval(countdownInterval);
      fadeOut(rulesBackground, 500);
      document.body.style.overflow = "auto";
    }
  }, 1000);
}

function fetchUpdatedLobbies() {
  return fetch("userdata/lobby.json")
    .then((response) => response.json())
    .then((updatedLobbies) => {
      loadLobbies(updatedLobbies);
    })
    .catch((error) => console.error("Error fetching updated lobbies:", error));
}

function joinLobby(lobbyName) {
  currentLobby = lobbyName;
  changeBackground();
  join();
}

const hideOwnerToggle = document.getElementById("hideOwner");

hideOwnerToggle.addEventListener("change", reconnect);

messageInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    sendButton.click();
  }
});

lobbySelect.addEventListener("change", (event) => {
  currentLobby = event.target.value;
  chat.innerHTML = "";
  console.log(`Selected lobby: ${currentLobby}`);
  FirstMessageAfterJoin = true;
});

alwaysOnCheckbox.addEventListener("change", () => {
  clearInterval(pingInterval); // Clear existing interval
  if (alwaysOnCheckbox.checked) {
    startPing(); // Restart ping if "Always On" is checked
  } else {
    stopPing();
  }
});

document
  .getElementById("lobby-list")
  .addEventListener("click", function (event) {
    // Check if the clicked element is a .lobby-li or its child
    const lobbyLi = event.target.closest(".lobby-li");
    if (lobbyLi) {
      // Find the .lobby-option link inside the clicked .lobby-li
      const lobbyOption = lobbyLi.querySelector(".lobby-option");

      if (lobbyOption) {
        const lobbyName = lobbyOption.getAttribute("data-lobby");
        const imageInput = document.getElementById("imageInput");

        // Update currentLobby to the new lobby name
        currentLobby = lobbyName;
        // Change background randomly
        changeBackground();

        // Call the join function with the updated lobby name
        join();

        if (
          lobbyName === "Announcements" &&
          (username === "Nico" || (role !== "admin" && role !== "owner"))
        ) {
          messageInput.disabled = true;
          imageInput.disabled = true;
        } else {
          messageInput.disabled = false;
          imageInput.disabled = false;
        }
      }
    }
  });

document.querySelectorAll("#statuslobby").forEach((link) => {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    //change background randomly
    changeBackground();
    reconnect();
  });
});

// Add this inside your script, where the WebSocket connection is being managed.
window.addEventListener("beforeunload", () => {
  if (ws) {
    ws.close();
  }
});



/*----------------------------------------------------------------------------------------------*/

function InitiallyCalls() {
  InitiallCallings()
    .then(() => {
      document.getElementById("ScriptJS").checked = true;
    });
}

InitiallyCalls();