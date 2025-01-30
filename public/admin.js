let selectedLobbyElement = null;
let selectedUserElement = null;
let isVisible = false;
let isVisibleLobby = false;

document.addEventListener("DOMContentLoaded", () => {
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

  const username = decryptData(sessionStorage.getItem("username"));
  if (!username) {
    window.location.href = "/login.html";
  }

  checkAccess(username);

  // Function to get user role
  async function getUserRole(username) {
    try {
      const response = await fetch(`/getRole?username=${username}`);
      const data = await response.json();

      if (data.success) {
        return data.role;
      } else {
        console.log(data.message);
        return null;
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      return null;
    }
  }

  // Main code to check role and redirect if needed
  async function checkAccess(username) {
    const role = await getUserRole(username);

    if (role !== "admin" && role !== "owner" && username !== "root") {
      alert("Access denied. Only Admin or Owner can access this page.");
      window.location.href = "/index.html";
    }
    if (role === "admin" && role !== "owner") {
      document.getElementById("deleteUser").style.display = "none";
    }
    if (username !== "root") {
    document.getElementById("makeOwner").style.display = "none";
  }
  }

 function fetchUsers() {
  fetch("/admin/users", { headers: { "x-username": username || "" } })
    .then((response) => response.json())
    .then((data) => {
      const userList = document.getElementById("user-list");
      userList.innerHTML = "";

      data.users.forEach((user) => {
        if (user.username === "Nico") {
          user.role = "owner";
        }
      });

      const roleOrder = { owner: 1, admin: 2, user: 3, banned: 4 };
      data.users.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

      let previousRole = null;

      data.users.forEach((user, index) => {
        if (index === 0 || previousRole !== user.role) {
          const separator = document.createElement("li");
          separator.className = "role-separator";
          separator.textContent = `--- ${user.role.toUpperCase()} ---`;
          userList.appendChild(separator);
        }

        const li = document.createElement("li");
        li.textContent = `${user.username} -- ${user.role}`;
        li.dataset.username = user.username;
        li.dataset.role = user.role;
        li.addEventListener("click", (event) => {
          event.stopPropagation();
          openUserMenu(event.currentTarget, user);
        });
        userList.appendChild(li);

        previousRole = user.role;
      });
    })
    .catch((error) => console.error("Error fetching users:", error));
}

  const openUserMenu = (userElement, userData) => {
  const menu = document.getElementById("messageMenu");
  selectedUserElement = userElement;
  const rect = userElement.getBoundingClientRect();
  
  const currentUser = decryptData(sessionStorage.getItem("username"));

  if (selectedUserElement.dataset.role === "owner" && currentUser !== "root") {
    alert("You cannot change the status of an owner!");
    return;
  }

  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom}px`;
  menu.style.left = `${rect.left}px`;

  // Display the menu
  menu.style.display = "block";

  // Close menu when clicking outside
  document.removeEventListener("click", closeUserMenu);
  document.addEventListener("click", closeUserMenu);
};

  const closeUserMenu = (event) => {
    const menu = document.getElementById("messageMenu");
    if (!menu.contains(event?.target)) {
      menu.style.display = "none";
      document.removeEventListener("click", closeUserMenu);
    }
  };

const updateUserRole = (url, successMessage) => {
  const targetUsername = selectedUserElement.dataset.username;
  const currentUser = decryptData(sessionStorage.getItem("username"));

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: targetUsername, requester: currentUser }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        alert(`Error: ${data.message}`);
      } else {
        alert(successMessage);
      }
      fetchUsers();
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("An error occurred while processing the request.");
    });
  closeUserMenu();
};

document.getElementById("makeOwner").addEventListener("click", () => {
  if (
    window.confirm(
      `Are you sure you want to make ${selectedUserElement.dataset.username} an Owner?`
    )
  ) {
    updateUserRole(
      "/admin/make-owner",
      `${selectedUserElement.dataset.username} is now an owner.`
    );
  }
});

  document.getElementById("makeAdmin").addEventListener("click", () => {
    if (
      window.confirm(
        `Are you sure you want to make ${selectedUserElement.dataset.username} an Admin?`
      )
    ) {
      updateUserRole(
        "/admin/make-admin",
        `${selectedUserElement.dataset.username} is now an admin.`
      );
    }
  });

  document.getElementById("makeUser").addEventListener("click", () => {
    if (
      window.confirm(
        `Are you sure you want to make ${selectedUserElement.dataset.username} a User?`
      )
    ) {
      updateUserRole(
        "/admin/make-user",
        `${selectedUserElement.dataset.username} is now a user.`
      );
    }
  });

  document.getElementById("banUserAdmin").addEventListener("click", () => {
    if (
      window.confirm(
        `Are you sure you want to ban ${selectedUserElement.dataset.username}?`
      )
    ) {
      updateUserRole(
        "/admin/ban-user",
        `${selectedUserElement.dataset.username} has been banned.`
      );
    }
  });

  document.getElementById("deleteUser").addEventListener("click", () => {
    const targetUsername = selectedUserElement.dataset.username;
    if (window.confirm(`Are you sure you want to delete ${targetUsername}?`)) {
      fetch("/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: targetUsername }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            console.log(`${targetUsername} has been deleted.`);
            selectedUserElement.remove();
          } else {
            console.error(`Error: ${data.message}`);
          }
        })
        .catch((error) => console.error("Error deleting user:", error));
      closeUserMenu();
    }
  });

  const openLobbyMenu = (lobbyElement, lobbyName) => {
    const lobbyMenu = document.getElementById("lobbyMenu");
    selectedLobbyElement = lobbyElement;
    const rect = lobbyElement.getBoundingClientRect();

    lobbyMenu.style.position = "fixed";
    lobbyMenu.style.top = `${rect.bottom}px`;
    lobbyMenu.style.left = `${rect.left}px`;
    lobbyMenu.style.display = "block";

    document.removeEventListener("click", closeLobbyMenu);
    document.addEventListener("click", closeLobbyMenu);
  };

  const closeLobbyMenu = (event) => {
    const lobbyMenu = document.getElementById("lobbyMenu");
    if (!lobbyMenu.contains(event?.target)) {
      lobbyMenu.style.display = "none";
      document.removeEventListener("click", closeLobbyMenu);
    }
  };

  function viewActiveLobby() {
    fetch("/admin/active-lobbies")
      .then((response) => response.json())
      .then((data) => {
        const lobbyList = document.getElementById("lobby-list");
        lobbyList.innerHTML = ""; // Clear the current list of lobbies

        if (data.lobbies.length === 0) {
          lobbyList.innerHTML = "<li>No lobbies found.</li>"; // Display if no lobbies are found
          return;
        }

        // Loop through each lobby and create a list item
        data.lobbies.forEach((lobby) => {
          const li = document.createElement("li");
          li.textContent = lobby.lobby; // Set the lobby name as the text content

          if (lobby.active) {
            const activeSpan = document.createElement("span");
            activeSpan.textContent = " -- active"; // Text for active status
            activeSpan.style.color = "yellow"; // Optional: You can style it
            activeSpan.classList.add("activeSpan");
            li.appendChild(activeSpan); // Append the span with the active text to the li
          }

          // Add an event listener to each lobby
          li.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevent the event from propagating
            openLobbyMenu(event.currentTarget, lobby.lobby); // Open the lobby menu on click
          });

          // Append the lobby list item to the list
          lobbyList.appendChild(li);
        });
      })
      .catch((error) => console.error("Error fetching lobbies:", error)); // Handle errors
  }

  document.getElementById("clearHistory").addEventListener("click", () => {
    const lobbyName = selectedLobbyElement
      ? selectedLobbyElement.textContent.replace(/ -- active$/, "").trim()
      : null;
    if (
      window.confirm(
        `Are you sure you want to clear the chat history for lobby '${lobbyName}'?`
      )
    ) {
      fetch("/admin/clear-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby: lobbyName }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (!data.success) {
            console.error(`Error: ${data.message}`);
          }
        })
        .catch((error) => console.error("Error:", error));
      closeLobbyMenu();
    }
  });

  document.getElementById("closeLobby").addEventListener("click", () => {
    const lobbyName = selectedLobbyElement
      ? selectedLobbyElement.textContent.replace(/ -- active$/, "").trim()
      : null;
    if (
      lobbyName &&
      window.confirm(`Are you sure you want to close the lobby '${lobbyName}'?`)
    ) {
      fetch("/admin/close-lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobby: lobbyName }), // Send the lobby name in the request body
      })
        .then((response) => response.json())
        .then((data) => {
          if (!data.success) {
            console.error(`Error: ${data.message}`);
          }
          if (data.success) {
            selectedLobbyElement.remove();
            viewActiveLobby(); // Update the view after lobby removal
          }
        })
        .catch((error) => console.error("Error:", error));

      closeLobbyMenu(); // Close the menu after sending the request
    }
  });

  document.getElementById("deleteLobby").addEventListener("click", () => {
    const lobbyName = selectedLobbyElement
      ? selectedLobbyElement.textContent.replace(/ -- active$/, "").trim()
      : null;
    if (
      window.confirm(
        `Are you sure you want to delete the lobby '${lobbyName}'?`
      )
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
            closeLobbyMenu();

            selectedLobbyElement.remove();
            viewActiveLobby();
          } else {
            alert(`Failed to delete lobby '${lobbyName}'.`);
          }
        })
        .catch((error) => {
          console.error("Error deleting lobby:", error);
          alert("There was an error deleting the lobby.");
        });
    }
  });

  document.getElementById("view-lobbies").addEventListener("click", () => {
    const lobbyList = document.getElementById("lobby-list");
    if (isVisibleLobby === true) {
      lobbyList.innerHTML = "";
      isVisibleLobby = false;
    } else {
      viewActiveLobby();
      isVisibleLobby = true;
    }
  });

  document.getElementById("kick-user").addEventListener("click", () => {
    const usernameToKick = document.getElementById("kick-username").value;
    const lobbyToKick = document.getElementById("kick-lobby").value;
    fetch("/admin/kick-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameToKick, lobby: lobbyToKick }),
    })
      .then((response) => response.json())
      .then((data) => {
        document.getElementById("kick-user-status").textContent = data.message;
      })
      .catch((error) => console.error("Error kicking user:", error));
  });

  document.getElementById("fetch-users").addEventListener("click", () => {
    const userList = document.getElementById("user-list");
    if (isVisible === true) {
      userList.innerHTML = "";
      isVisible = false;
    } else {
      fetchUsers();
      isVisible = true;
    }
  });

  document.addEventListener("scroll", closeUserMenu);
  document.addEventListener("scroll", closeLobbyMenu);
});
