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

document.addEventListener("DOMContentLoaded", () => {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        console.log("Notification permission granted.");
      } else {
        console.log("Notification permission denied or dismissed.");
      }
    });
  }
  // Check for admin privileges
  const adminLink = document.getElementById("adminLink");
  const adminLinkMobile = document.getElementById("adminLinkMobile");
  const createLobby = document.getElementById("createLobbyButton");
  const role = decryptData(sessionStorage.getItem("role")); // Get the role from sessionStorage
  if (role === "banned") {
    window.location.href = "/banned.html";
  }
  if (role !== "admin" && role !== "owner") {
    adminLink.style.display = "none";
    adminLinkMobile.style.display = "none";
  }
  document.getElementById("currentUserDisplay").textContent = `-- User: ${decryptData(sessionStorage.getItem("username"))} --`;
});

const tooltip = document.getElementById("tooltip");
const icons = document.querySelectorAll(".icon");

function addTooltipBehavior(element) {
    element.addEventListener("mouseenter", (event) => {
        const iconText = event.target.getAttribute("data-tooltip");
        tooltip.textContent = iconText;
        tooltip.style.display = "block";
    });

    element.addEventListener("mousemove", (event) => {
        tooltip.style.left = `${event.pageX + 10}px`;
        tooltip.style.top = `${event.pageY + 10}px`;
    });

    element.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
    });
}

// Add tooltips to all elements
const tooltipElements = [
    ...document.querySelectorAll(".icon"),
    document.getElementById("statuslobby"),
    document.getElementById("status"),
    document.getElementById("clock"),
    document.getElementById("count"),
    ...document.querySelectorAll(".lobby-li")
];

tooltipElements.forEach(addTooltipBehavior);


function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const timeString = `${hours}:${minutes}:${seconds}`;

  document.getElementById("clock").textContent = timeString;
}

// Update the clock every second
setInterval(updateClock, 1000);

document.getElementById("burger").addEventListener("change", () => {
    document.getElementById("burgerHelper").checked = document.getElementById("burger").checked;
});

function adjustChatForIOS() {
  const platform = navigator.platform || "";
  const chatElement = document.getElementById("chat");

  const isIOS = /iPhone|iPad|iPod/.test(platform) || 
                (/Mac/.test(platform) && 'ontouchend' in document);

  const isMacOSDesktop = /Mac/.test(platform) && !('ontouchend' in document);

  if (isIOS && !isMacOSDesktop) {
    chatElement.style.padding = "10px";
  }
}

window.addEventListener("load", adjustChatForIOS);



/*----------------------------------------------------------------------------------------------*/

function InitiallyCalls() {
  updateClock();
  document.getElementById("AuthJS").checked = true;
}

InitiallyCalls();