//server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const multer = require("multer");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const upload = multer({ dest: "uploads/" });

const settingsFilePath = path.join(__dirname, "userdata", "settings.json");
const lobbyFilePath = path.join(__dirname, "userdata", "lobby.json");

const { encrypt, decrypt } = require("./utils/encryption");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/userdata", express.static("userdata"));
app.use("/blacklist", express.static(path.join(__dirname, "blacklist")));

// Directory for storing chat history
const chatHistoryDir = "./chat_history";
if (!fs.existsSync(chatHistoryDir)) {
  fs.mkdirSync(chatHistoryDir);
}

app.get("/loading-screen", (req, res) => {
  res.status(200).send();
});

// Database setup
const db = new sqlite3.Database("./users.db", (err) => {
  if (err) {
    console.error("Error opening database", err.message);
  } else {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT(12) UNIQUE,
            password TEXT,
            role TEXT
        )`,
      (err) => {
        if (err) {
          console.error(
            "Error creating users table, maybe the username is longer than 12 SYMBOLS",
            err.message
          );
        }
      }
    );
  }
});

// Function to read and decrypt file contents
function readEncryptedFile(filePath) {
  try {
    const encryptedData = fs.readFileSync(filePath, "utf8");
    const decryptedData = decrypt(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error(`Error reading encrypted file ${filePath}:`, error);
    return null;
  }
}

// Function to encrypt and write file contents
function writeEncryptedFile(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const encryptedData = encrypt(jsonString);
    fs.writeFileSync(filePath, encryptedData);
    return true;
  } catch (error) {
    console.error(`Error writing encrypted file ${filePath}:`, error);
    return false;
  }
}

function changeUserRole(username, newRole) {
  const sql = `UPDATE users SET role = ? WHERE username = ?`;
  db.run(sql, [newRole, username], (err) => {
    if (err) {
      console.error("Error changing user role", err.message);
    } else {
      console.log("User role updated successfully");
    }
  });
}

// Endpoint to update the lobby status
app.post("/update-lobby-status", (req, res) => {
  const { lobbyName, status } = req.body;

  if (!lobbyName || status === undefined) {
    return res
      .status(400)
      .json({ success: false, message: "Lobby name and status are required" });
  }

  const lobbyFilePath = path.join(__dirname, "userdata", "lobby.json");

  fs.readFile(lobbyFilePath, "utf8", (err, data) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Error reading lobby data" });
    }

    let lobbies;
    try {
      lobbies = JSON.parse(data);
    } catch (parseError) {
      return res
        .status(500)
        .json({ success: false, message: "Error parsing lobby data" });
    }

    // Find the lobby in the array
    const lobbyIndex = lobbies.findIndex((lobby) => lobby.lobby === lobbyName);
    if (lobbyIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: `Lobby '${lobbyName}' not found` });
    }

    // Update the status of the lobby
    lobbies[lobbyIndex].active = status;

    // Save the updated lobbies to the file
    fs.writeFile(
      lobbyFilePath,
      JSON.stringify(lobbies, null, 2),
      (writeError) => {
        if (writeError) {
          return res
            .status(500)
            .json({ success: false, message: "Error saving lobby data" });
        }

        res.json({
          success: true,
          message: `Lobby '${lobbyName}' status updated to ${
            status ? "active" : "inactive"
          }`,
        });
      }
    );
  });
});

// Function to read the existing lobby data
function getLobbies() {
  try {
    // Read the file synchronously
    const data = fs.readFileSync(lobbyFilePath, "utf8"); // 'utf8' ensures it's read as a string

    // Parse the JSON data
    const lobbies = JSON.parse(data);

    // Ensure all lobbies have the 'active', 'status', and 'members' properties
    lobbies.forEach((lobby) => {
      if (typeof lobby.active === "undefined") {
        lobby.active = false; // Default to false if 'active' is missing
      }
      if (typeof lobby.status === "undefined") {
        lobby.status = "private"; // Default to 'private' if 'status' is missing
      }
      if (!Array.isArray(lobby.members)) {
        lobby.members = []; // Default to an empty array if 'members' is missing
      }
    });

    return lobbies;
  } catch (error) {
    // Log detailed error information
    console.error("Error reading or parsing lobbies:", error);
    return [];
  }
}

// Function to save updated lobbies to the JSON file
function saveLobbies(lobbies) {
  try {
    fs.writeFileSync(lobbyFilePath, JSON.stringify(lobbies, null, 2));
  } catch (error) {
    console.error("Error saving lobby data:", error);
  }
}

function deleteLobbyAndRedirect(lobbyName) {
  const lobbies = getLobbies();
  const updatedLobbies = lobbies.filter((lobby) => lobby.lobby !== lobbyName);
  saveLobbies(updatedLobbies);

  clearChatHistory(lobbyName);

  // Prepare a message to send to users in the deleted lobby
  const message = {
    type: "lobby-deleted",
    lobbyName,
    redirectTo: updatedLobbies[0]?.lobby || "default-lobby", // Redirect to the first lobby or a default
  };

  // Broadcast to users in the deleted lobby
  broadcastToLobby(message, lobbyName);
  // Broadcast to active lobbies only
  const activeLobbies = getActiveLobbies(); // Get the list of active lobbies
  activeLobbies.forEach((activeLobby) => {
    broadcastToLobby(
      { type: "newLobby", lobbyName }, // Include the new lobby name in the message
      activeLobby // Broadcast to each active lobby
    );
  });
}

// Endpoint to handle lobby deletion
app.post("/delete-lobby", (req, res) => {
  const { lobbyName } = req.body;
  if (!lobbyName) {
    return res
      .status(400)
      .json({ success: false, message: "Lobby name is required" });
  }

  const lobbies = getLobbies();
  const lobbyExists = lobbies.some((lobby) => lobby.lobby === lobbyName);

  if (lobbyExists) {
    deleteLobbyAndRedirect(lobbyName);
    closeLobby(lobbyName);
    res.json({
      success: true,
      message: `Lobby '${lobbyName}' deleted successfully.`,
    });
  } else {
    res
      .status(404)
      .json({ success: false, message: `Lobby '${lobbyName}' not found.` });
  }
});

// Function to add a new lobby with active set to false, members as an empty array, and status as private
function addLobby(lobbyName, username, password = null) {
  try {
    const lobbies = getLobbies();

    // Check if the lobby already exists
    if (lobbies.some((lobby) => lobby.lobby === lobbyName)) {
      return { error: "Lobby already exists" };
    }

    // Add the new lobby to the list
    const newLobby = {
      lobby: lobbyName,
      active: false,
      status: "private",
      password,
      lobbyOwner: username,
      members: [username],
    };
    lobbies.push(newLobby);

    saveLobbies(lobbies);

    // Broadcast the new lobby to active lobbies only
    const activeLobbies = getActiveLobbies();
    activeLobbies.forEach((activeLobby) => {
      broadcastToLobby({ type: "newLobby", lobby: newLobby }, activeLobby);
    });

    return { success: true, lobby: newLobby }; // Ensure success is returned
  } catch (error) {
    console.error("Error in addLobby:", error);
    return { error: "Internal server error" }; // Graceful error handling
  }
}

app.post("/join-lobby", (req, res) => {
  const { lobbyName, username, role, password } = req.body;

  const lobbies = JSON.parse(fs.readFileSync(lobbyFilePath, "utf8"));
  const lobby = lobbies.find((lobby) => lobby.lobby === lobbyName);

  if (!role) {
    return res.status(404).json({
      success: false,
      message: `Role of user '${username}' not found`,
    });
  }

  if (role === "owner") {
    return res.json({
      success: true,
      message: `Joined lobby '${lobbyName}'`,
      lobbies,
    });
  }

  if (!lobby) {
    return res
      .status(404)
      .json({ success: false, message: `Lobby '${lobbyName}' not found` });
  }

  if (lobby.password && lobby.password !== password) {
    return res
      .status(403)
      .json({ success: false, message: "Incorrect password" });
  }

  if (!lobby.members.includes(username)) {
    lobby.members.push(username);
    fs.writeFileSync(lobbyFilePath, JSON.stringify(lobbies, null, 2));
  }

  res.json({ success: true, message: `Joined lobby '${lobbyName}'`, lobbies });
});

// Endpoint to create a new lobby
app.post("/create-lobby", (req, res) => {
  const { lobbyName, username, password } = req.body;

  const result = addLobby(lobbyName, username, password || null);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ message: "Lobby created successfully", lobbies: getLobbies() });
});

// Add member to lobby
app.post("/add-member", (req, res) => {
  const { lobbyName, username } = req.body;

  if (!lobbyName || !username) {
    return res.status(400).json({
      success: false,
      message: "Lobby name and username are required",
    });
  }

  const lobbies = getLobbies();
  const lobby = lobbies.find((lobby) => lobby.lobby === lobbyName);

  if (!lobby) {
    return res
      .status(404)
      .json({ success: false, message: `Lobby '${lobbyName}' not found` });
  }

  if (!lobby.members.includes(username)) {
    lobby.members.push(username);
    saveLobbies(lobbies);
    res.json({
      success: true,
      message: `User '${username}' added to lobby '${lobbyName}'`,
    });
    // Broadcast to active lobbies only
    const activeLobbies = getActiveLobbies();
    activeLobbies.forEach((activeLobby) => {
      broadcastToLobby({ type: "newLobby" }, activeLobby);
    });
  } else {
    res.status(400).json({
      success: false,
      message: `User '${username}' is already a member of lobby '${lobbyName}'`,
    });
  }
});

// Remove member from lobby
app.post("/remove-member", (req, res) => {
  const { lobbyName, username } = req.body;

  if (!lobbyName || !username) {
    return res.status(400).json({
      success: false,
      message: "Lobby name and username are required",
    });
  }

  const lobbies = getLobbies();
  const lobby = lobbies.find((lobby) => lobby.lobby === lobbyName);

  if (!lobby) {
    return res
      .status(404)
      .json({ success: false, message: `Lobby '${lobbyName}' not found` });
  }

  const memberIndex = lobby.members.indexOf(username);
  if (memberIndex !== -1) {
    lobby.members.splice(memberIndex, 1);
    saveLobbies(lobbies);
    res.json({
      success: true,
      message: `User '${username}' removed from lobby '${lobbyName}'`,
    });
    // Broadcast to active lobbies only
    const activeLobbies = getActiveLobbies();
    activeLobbies.forEach((activeLobby) => {
      broadcastToLobby({ type: "newLobby" }, activeLobby);
    });
  } else {
    res.status(400).json({
      success: false,
      message: `User '${username}' is not a member of lobby '${lobbyName}'`,
    });
  }
});

// Get lobbies visible to the user
app.get("/get-lobbies", (req, res) => {
  const username = req.query.username;
  const role = req.query.role;

  try {
    const lobbies = getLobbies();
    let visibleLobbies;

    if (role === "owner") {
      visibleLobbies = lobbies; // Return all lobbies if the role is "owner"
    } else {
      visibleLobbies = lobbies.filter(
        (lobby) => lobby.status === "public" || lobby.members.includes(username)
      );
    }

    res.json({ lobbies: visibleLobbies });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lobbies" });
  }
});

// Endpoint to get user settings
app.get("/api/user-settings/:username", (req, res) => {
  const username = req.params.username;

  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading settings file:", err);
      return res.status(500).json({ error: "Failed to load user settings" });
    }

    let settings = [];
    try {
      settings = JSON.parse(data); // Parse the existing settings if available
    } catch (parseErr) {
      console.error("Error parsing settings file:", parseErr);
      return res.status(500).json({ error: "Failed to parse settings file" });
    }

    const userSettings = settings.find((s) => s.username === username);

    if (userSettings) {
      res.json(userSettings);
    } else {
      // Send default settings if user settings do not exist
      res.json({
        username,
        theme: true, // Default to Light Mode
        notifications: true, // Default notifications on
        randomBackground: true, // Default random background off
        autoJoin: false, // Default autoJoin off
        currentBackgroundId: 1, // Default background ID (1 if not set)
      });
    }
  });
});

// Endpoint to save user settings
app.post("/api/user-settings", (req, res) => {
  const newSettings = req.body;

  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading settings file:", err);
      return res
        .status(500)
        .json({ error: "Failed to save user settings due to file read error" });
    }

    let settings = [];
    try {
      if (data) {
        settings = JSON.parse(data); // Parse existing settings
      }
    } catch (parseErr) {
      console.error("Error parsing settings JSON:", parseErr);
      return res.status(500).json({ error: "Failed to parse settings JSON" });
    }

    const existingIndex = settings.findIndex(
      (s) => s.username === newSettings.username
    );
    if (existingIndex >= 0) {
      settings[existingIndex] = newSettings; // Update existing settings
    } else {
      settings.push(newSettings); // Add new settings for the user
    }

    // Write the updated settings back to the file
    fs.writeFile(
      settingsFilePath,
      JSON.stringify(settings, null, 2),
      "utf8",
      (writeErr) => {
        if (writeErr) {
          console.error("Error writing settings file:", writeErr);
          return res.status(500).json({
            error: "Failed to save user settings due to file write error",
          });
        }
        res.json({ message: "Settings saved successfully" });
      }
    );
  });
});

// Register route
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
    [username, hashedPassword, role],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          res
            .status(400)
            .send({ success: false, message: "Username already taken" });
        } else {
          res
            .status(500)
            .send({ success: false, message: "Error registering user" });
        }
        return;
      }
      res.send({ success: true, message: "Registration successful" });
    }
  );
});

// Login route
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, row) => {
      if (err) {
        res.status(500).send({ success: false, message: "Error during login" });
        return;
      }

      if (row) {
        // Compare the password with the hashed password
        if (await bcrypt.compare(password, row.password)) {
          // Successfully logged in
          res.send({
            success: true,
            message: "Login successful",
            role: row.role, // Include the user's role
          });
        } else if (row.role === "banned") {
          // Send a response indicating redirection to banned page
          return res.status(403).json({ redirect: "/banned.html" });
        } else {
          res
            .status(401)
            .send({ success: false, message: "Invalid username or password" });
        }
      } else {
        res
          .status(401)
          .send({ success: false, message: "Invalid username or password" });
      }
    }
  );
});

// Change assword route
app.post("/change-password", async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, row) => {
      if (err) {
        res
          .status(500)
          .send({ success: false, message: "Error fetching user" });
        return;
      }

      if (row && (await bcrypt.compare(oldPassword, row.password))) {
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        db.run(
          `UPDATE users SET password = ? WHERE username = ?`,
          [hashedNewPassword, username],
          function (err) {
            if (err) {
              res
                .status(500)
                .send({ success: false, message: "Error updating password" });
            } else {
              res.send({
                success: true,
                message: "Password changed successfully.",
              });
            }
          }
        );
      } else {
        res
          .status(401)
          .send({ success: false, message: "Old password is incorrect" });
      }
    }
  );
});
// Change Username Route
app.post("/change-username", async (req, res) => {
  const { currentUsername, newUsername, password } = req.body;

  // Ensure no empty fields
  if (!currentUsername || !newUsername || !password) {
    return res
      .status(400)
      .send({ success: false, message: "Please provide all fields." });
  }

  // Check if the new username is already taken
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [newUsername],
    (err, row) => {
      if (err) {
        return res
          .status(500)
          .send({ success: false, message: "Error checking new username." });
      }

      if (row) {
        return res
          .status(400)
          .send({ success: false, message: "Username is already taken." });
      }

      // Now verify the current password
      db.get(
        `SELECT * FROM users WHERE username = ?`,
        [currentUsername],
        async (err, user) => {
          if (err) {
            return res.status(500).send({
              success: false,
              message: "Error fetching user details.",
            });
          }

          if (!user || !(await bcrypt.compare(password, user.password))) {
            return res
              .status(401)
              .send({ success: false, message: "Incorrect password." });
          }

          // Update the username if password is correct
          db.run(
            `UPDATE users SET username = ? WHERE username = ?`,
            [newUsername, currentUsername],
            function (err) {
              if (err) {
                return res.status(500).send({
                  success: false,
                  message: "Error updating username.",
                });
              }

              return res.send({
                success: true,
                message: "Username updated successfully.",
              });
            }
          );
        }
      );
    }
  );
});

// DELETE user account route
app.post("/delete-account", (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res
      .status(400)
      .json({ success: false, message: "Username is required." });
  }

  // Delete user from the database
  db.run(`DELETE FROM users WHERE username = ?`, [username], function (err) {
    if (err) {
      console.error("Error deleting user:", err);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the account.",
      });
    }

    // Check if the user was actually deleted
    if (this.changes === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Delete settings from the settings.json file
    const settingsFilePath = path.join(__dirname, "userdata", "settings.json");

    fs.readFile(settingsFilePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading settings file:", err);
        return res.status(500).json({
          success: false,
          message: "An error occurred while reading the settings file.",
        });
      }

      let settings = [];
      try {
        settings = JSON.parse(data); // Parse the settings JSON
      } catch (parseErr) {
        console.error("Error parsing settings file:", parseErr);
        return res.status(500).json({
          success: false,
          message: "An error occurred while parsing the settings file.",
        });
      }

      // Filter out the settings for the deleted user
      settings = settings.filter((setting) => setting.username !== username);

      // Write the updated settings back to the file
      fs.writeFile(
        settingsFilePath,
        JSON.stringify(settings, null, 2),
        "utf8",
        (err) => {
          if (err) {
            console.error("Error updating settings file:", err);
            return res.status(500).json({
              success: false,
              message: "An error occurred while updating the settings file.",
            });
          }
        }
      );
    });

    // If the deletion was successful
    res.json({
      success: true,
      message: "User account and settings deleted successfully.",
    });
  });
});

// Get role route
app.get("/getRole", (req, res) => {
  const { username } = req.query;

  db.get(
    `SELECT role FROM users WHERE username = ?`,
    [username],
    (err, row) => {
      if (err) {
        res
          .status(500)
          .send({ success: false, message: "Error retrieving role" });
        return;
      }

      if (row) {
        res.send({ success: true, role: row.role });
      } else {
        res.status(404).send({ success: false, message: "User not found" });
      }
    }
  );
});

function clearChatHistory(lobby) {
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);
  const lobbyFolder = path.join(__dirname, "uploads", lobby);

  // Delete chat history file if it exists
  if (fs.existsSync(chatHistoryFile)) {
    fs.unlinkSync(chatHistoryFile);
    console.log(`Chat history for lobby '${lobby}' has been cleared by Admin.`);
  }

  // Delete all images in the lobby folder
  if (fs.existsSync(lobbyFolder)) {
    fs.readdirSync(lobbyFolder).forEach((file) => {
      const filePath = path.join(lobbyFolder, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        console.log(`Image ${file} deleted from lobby folder.`);
      }
    });
  }

  // Broadcast clear message to all clients in the lobby
  broadcastToLobby({ type: "AdminClear" }, lobby);
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// WebSocket connection handling
const lobbies = {};
const clients = new Map();

wss.on("connection", (ws) => {
  let currentLobby = null;
  let username = null;
  let role = null;

  ws.on("message", (message) => {
    const parsedMessage = JSON.parse(message);
    const data = JSON.parse(message);

    if (parsedMessage.type === "join") {
      clients.set(ws, {
        username: data.username,
        role: data.role,
      });

      console.log(`${data.username} joined the chat.`);
      currentLobby = parsedMessage.lobby;
      username = parsedMessage.username;
      role = parsedMessage.role;

      // Initialize lobby if it doesn't exist
      if (!lobbies[currentLobby]) {
        lobbies[currentLobby] = new Set();
      }

      // Store complete client info in lobby
      lobbies[currentLobby].add({
        ws,
        username,
        role,
      });

      sendChatHistory(ws, currentLobby);
      broadcastOnlineUsers(currentLobby);
      console.log(`Client ${username} (${role}) joined lobby: ${currentLobby}`);

      ws.username = username;
      ws.role = role;
    } else if (parsedMessage.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (parsedMessage.type === "message" && currentLobby) {
      // Handle admin commands
      if (
        (role === "admin" && parsedMessage.message.startsWith("/")) ||
        (role === "owner" && parsedMessage.message.startsWith("/"))
      ) {
        handleAdminCommand(parsedMessage.message, currentLobby, username);
      } else {
        const id = getNextMessageId(currentLobby);
        const timestamp = new Date().toISOString(); // Assuming this is how timestamp is set
        if (isValidDate(timestamp)) {
          const fullMessage = {
            id: id,
            username: username,
            timestamp: timestamp,
            message: parsedMessage.message,
            type: "message",
            lobby: currentLobby,
          };

          broadcastToLobby(fullMessage, currentLobby);
          saveToChatHistory(fullMessage, currentLobby);
          console.log("Received message:", parsedMessage);
        } else {
          console.log("Invalid timestamp. Not showing date separator.");
        }
      }
    } else if (data.type === "image") {
      const id = getNextMessageId(currentLobby);
      const lobbyFolder = path.join(__dirname, "uploads", currentLobby);

      // Ensure the lobby folder exists
      if (!fs.existsSync(lobbyFolder)) {
        fs.mkdirSync(lobbyFolder, { recursive: true });
      }

      const imagePath = path.join(lobbyFolder, `${data.timestamp}.png`);
      const imageBuffer = Buffer.from(data.data, "base64");

      fs.writeFile(imagePath, imageBuffer, (err) => {
        if (err) {
          console.error(err);
          ws.send(JSON.stringify({ error: "Error saving image" }));
        } else {
          console.log("Image saved successfully");

          const imageMessage = {
            id: id, // Unique ID for the image
            username: username,
            timestamp: data.timestamp,
            type: "picture",
            imageUrl: `/uploads/${currentLobby}/${data.timestamp}.png`, // Updated image URL
          };

          saveToChatHistory(imageMessage, currentLobby);
          broadcastToLobby(imageMessage, currentLobby);
        }
      });
    } else if (parsedMessage.type === "edit" && currentLobby) {
      const messageId = parseInt(parsedMessage.id, 10);
      const timestamp = parsedMessage.timestamp;
      const newText = parsedMessage.newText;

      console.log(
        `User ${username} attempting to edit message ID: ${messageId} at ${timestamp}`
      );

      // Get the message to be edited
      const messageToEdit = getMessageById(messageId, timestamp, currentLobby);

      // Check if the message exists
      if (!messageToEdit) {
        console.log(
          `Message with ID ${messageId} and timestamp ${timestamp} not found.`
        );
        ws.send(
          JSON.stringify({ type: "error", message: "Message not found." })
        );
        return;
      }

      // Update the message text and save to the file
      messageToEdit.message = newText; // Ensure the message property is updated

      // Save the updated message to the chat history file
      saveToChatHistory(messageToEdit, currentLobby);

      const fullMessage = {
        id: messageId,
        username: messageToEdit.username,
        timestamp: messageToEdit.timestamp,
        message: newText,
        type: "edit",
      };

      // Broadcast the edit to all clients in the lobby
      broadcastToLobby(fullMessage, currentLobby);
    } else if (parsedMessage.type === "delete" && currentLobby) {
      const messageId = parseInt(parsedMessage.id, 10);
      const timestamp = parsedMessage.timestamp; // Extract timestamp for validation

      console.log(
        `User ${username} attempting to delete message ID: ${messageId} at ${timestamp}`
      );

      // Get message by ID and timestamp for validation
      const messageToDelete = getMessageById(
        messageId,
        timestamp,
        currentLobby
      );

      // Check if the message exists
      if (!messageToDelete) {
        console.log(
          `Message with ID ${messageId} and timestamp ${timestamp} not found.`
        );
        ws.send(
          JSON.stringify({ type: "error", message: "Message not found." })
        );
        return;
      }

      const messageOwnerUsername = messageToDelete.username;

      // Allow deletion if the role is "Admin" or if they own the message
      if (
        role === "admin" ||
        role === "owner" ||
        messageOwnerUsername === username
      ) {
        console.log(
          `User ${username} is deleting message ID: ${messageId} from ${messageOwnerUsername}.`
        );

        // Attempt to delete message from file
        if (deleteMessageFromFile(messageId, timestamp, currentLobby)) {
          console.log(`Message ID: ${messageId} deleted successfully.`);

          // If the message is an image, delete the file from the lobby's folder
          if (messageToDelete.type === "picture") {
            const imagePath = path.join(
              __dirname,
              "uploads",
              currentLobby,
              `${timestamp}.png`
            );
            fs.unlink(imagePath, (err) => {
              if (err) {
                console.error(`Failed to delete image at ${imagePath}:`, err);
              } else {
                console.log(`Image ${imagePath} deleted successfully.`);
              }
            });
          }

          // Broadcast the deletion to the lobby
          broadcastToLobby(
            { type: "delete", id: messageId, timestamp: timestamp },
            currentLobby
          );
        } else {
          console.log(`Failed to delete message ID: ${messageId} from file.`);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Failed to delete the message from file.",
            })
          );
        }
      } else {
        // Access denied for other users
        console.log(
          `User ${username} is not allowed to delete message ID: ${messageId}.`
        );
        ws.send(
          JSON.stringify({
            type: "error",
            message: "You can only delete your own messages.",
          })
        );
      }
    }
  });

  function getMessageById(messageId, timestamp, lobby) {
    const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);
    if (fs.existsSync(chatHistoryFile)) {
      try {
        // Read and decrypt the chat history
        const encryptedData = fs.readFileSync(chatHistoryFile, "utf-8");
        const decryptedData = decrypt(encryptedData);
        const chatHistory = JSON.parse(decryptedData);
        // Find the message that matches both the id and timestamp
        return chatHistory.find(
          (msg) => msg.id === messageId && msg.timestamp === timestamp
        );
      } catch (error) {
        console.error("Error getting message by ID:", error);
        return null;
      }
    }
    return null;
  }

  ws.on("close", () => {
    const clientInfo = clients.get(ws);
    clients.delete(ws);

    if (currentLobby && lobbies[currentLobby]) {
      lobbies[currentLobby] = new Set(
        [...lobbies[currentLobby]].filter((client) => client.ws !== ws)
      );
      broadcastOnlineUsers(currentLobby);
    }
  });

  function getNextMessageId(lobby) {
    const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);
    if (fs.existsSync(chatHistoryFile)) {
      try {
        // Read the encrypted data
        const encryptedData = fs.readFileSync(chatHistoryFile, "utf-8");
        // Decrypt the data
        const decryptedData = decrypt(encryptedData);
        // Parse the decrypted data
        const chatHistory = JSON.parse(decryptedData);
        const lastMessage = chatHistory[chatHistory.length - 1];
        return lastMessage ? lastMessage.id + 1 : 0;
      } catch (error) {
        console.error("Error getting next message ID:", error);
        return 0;
      }
    }
    return 0;
  }

  // Handle admin commands
  function handleAdminCommand(command, lobby, requester) {
    const args = command.split(" ");
    const action = args[0];

    switch (action) {
      case "/clear":
        clearChatHistory(lobby);
        break;
      case "/kick":
        if (args[1]) {
          kickUserFromLobby(args[1], lobby);
        }
        break;
      case "/ban":
        if (args[1]) {
          banUser(args[1], requester, lobby);
        }
        break;
      case "/owner":
        if (args[1]) {
          makeOwner(args[1], requester, lobby);
        }
        break;
      case "/admin":
        if (args[1]) {
          makeAdmin(args[1], requester, lobby);
        }
        break;
      case "/user":
        if (args[1]) {
          makeUser(args[1], requester, lobby);
        }
        break;
      case "/close":
        closeLobby(lobby);
        break;
      case "/system":
        if (args.length > 1) {
          const id = getNextMessageId(currentLobby);
          const timestamp = new Date().toISOString();
          if (isValidDate(timestamp)) {
            const messageContent = args.slice(1).join(" ");
            const fullMessage = {
              id: id,
              username: "System",
              timestamp: timestamp,
              message: messageContent,
              type: "message",
              lobby: currentLobby,
            };

            broadcastToLobby(fullMessage, currentLobby);
            saveToChatHistory(fullMessage, currentLobby);
            console.log("Received message:", fullMessage);
          }
        }
        break;
      case "/delete":
        if (args[1]) {
          const target = args[1];
          if (!isNaN(parseInt(target))) {
            const messageId = parseInt(target, 10);
            deleteMessage(messageId, lobby);
          } else {
            deleteMessagesByUsername(target, lobby);
          }
        }
        break;
      default:
        ws.send(JSON.stringify({ type: "error", message: "Unknown command" }));
    }
  }
});

function broadcastOnlineUsers(lobby) {
  if (!lobbies[lobby]) return;

  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading settings:", err);
      return;
    }

    try {
      const settings = JSON.parse(data);
      const lobbyUsers = Array.from(lobbies[lobby]);

      // Create filtered list - include non-owners and visible owners
      const filteredUsers = lobbyUsers
        .filter((client) => {
          if (client.role !== "owner") return true;
          const ownerSettings = settings.find(
            (s) => s.username === client.username
          );
          return ownerSettings?.hideOwner === false;
        })
        .map((client) => client.username);

      // Broadcast same filtered list to everyone
      lobbyUsers.forEach(({ ws }) => {
        ws.send(
          JSON.stringify({
            type: "onlineUsers",
            users: filteredUsers,
          })
        );
      });
    } catch (error) {
      console.error("Error processing online users:", error);
    }
  });
}

function sendChatHistory(client, lobby) {
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);
  let chatHistory = [];

  if (fs.existsSync(chatHistoryFile)) {
    const encryptedData = fs.readFileSync(chatHistoryFile, "utf-8");
    chatHistory = JSON.parse(decrypt(encryptedData));
  }

  client.send(JSON.stringify({ type: "chatHistory", messages: chatHistory }));
}

// Route to make a user an admin
function makeOwner(username, requester, lobby, res) {
  if (requester !== "root") {
    broadcastToLobby(
      {
        type: "system",
        message: `Access denied. Only the root can make someone an owner.`,
        requester: requester,
      },
      lobby
    );
  } else {
    db.get(
      `SELECT role FROM users WHERE username = ?`,
      [username],
      function (err, row) {
        if (err) {
          console.error("Error fetching user role:", err.message);
          return res.status(500).json({
            success: false,
            message: "Error fetching user role.",
          });
        }
        if (
          row &&
          (row.role !== "owner" ||
            (row.role === "owner" && requester === "root"))
        ) {
          db.run(
            `UPDATE users SET role = 'owner' WHERE username = ?`,
            [username],
            function (err) {
              if (err) {
                console.error("Error promoting user to owner:", err.message);
                return res.status(500).json({
                  success: false,
                  message: "Error promoting user to owner.",
                });
              }
              if (this.changes > 0) {
                sendRoleChangeToClient(username, "owner"); // Send role change to the specific client
                broadcastToLobby(
                  {
                    type: "system",
                    message: `${username} is now an owner.`,
                    requester: requester,
                  },
                  lobby
                );
              } else {
                res
                  .status(404)
                  .json({ success: false, message: "User not found." });
              }
            }
          );
        } else {
          broadcastToLobby(
            {
              type: "system",
              message: `You don't have permission to change status of an owner`,
              requester: requester,
            },
            lobby
          );
        }
      }
    );
  }
}

// Route to make a user an admin
function makeAdmin(username, requester, lobby, res) {
  db.get(
    `SELECT role FROM users WHERE username = ?`,
    [username],
    function (err, row) {
      if (err) {
        console.error("Error fetching user role:", err.message);
        return res.status(500).json({
          success: false,
          message: "Error fetching user role.",
        });
      }
      if (
        row &&
        (row.role !== "owner" || (row.role === "owner" && requester === "root"))
      ) {
        db.run(
          `UPDATE users SET role = 'admin' WHERE username = ?`,
          [username],
          function (err) {
            if (err) {
              console.error("Error promoting user to admin:", err.message);
              return res.status(500).json({
                success: false,
                message: "Error promoting user to admin.",
              });
            }
            if (this.changes > 0) {
              sendRoleChangeToClient(username, "admin"); // Send role change to the specific client
              broadcastToLobby(
                {
                  type: "system",
                  message: `${username} is now an admin.`,
                  requester: requester,
                },
                lobby
              );
            } else {
              res
                .status(404)
                .json({ success: false, message: "User not found." });
            }
          }
        );
      } else {
        broadcastToLobby(
          {
            type: "system",
            message: `You don't have permission to change status of an owner`,
            requester: requester,
          },
          lobby
        );
      }
    }
  );
}

// Route to make a user a regular user
function makeUser(username, requester, lobby, res) {
  db.get(
    `SELECT role FROM users WHERE username = ?`,
    [username],
    function (err, row) {
      if (err) {
        console.error("Error fetching user role:", err.message);
        return res.status(500).json({
          success: false,
          message: "Error fetching user role.",
        });
      }
      if (
        row &&
        (row.role !== "owner" || (row.role === "owner" && requester === "root"))
      ) {
        db.run(
          `UPDATE users SET role = 'user' WHERE username = ?`,
          [username],
          function (err) {
            if (err) {
              return res.status(500).json({
                success: false,
                message: "Error promoting user to user.",
              });
            }
            if (this.changes > 0) {
              sendRoleChangeToClient(username, "user"); // Send role change to the specific client
              broadcastToLobby(
                {
                  type: "system",
                  message: `${username} is now an user.`,
                  requester: requester,
                },
                lobby
              );
            } else {
              res
                .status(404)
                .json({ success: false, message: "User not found." });
            }
          }
        );
      } else {
        broadcastToLobby(
          {
            type: "system",
            message: `You don't have permission to change status of an owner`,
            requester: requester,
          },
          lobby
        );
      }
    }
  );
}

// Route to ban a user
function banUser(username, requester, lobby, res) {
  db.get(
    `SELECT role FROM users WHERE username = ?`,
    [username],
    function (err, row) {
      if (err) {
        console.error("Error fetching user role:", err.message);
        return res.status(500).json({
          success: false,
          message: "Error fetching user role.",
        });
      }
      if (
        row &&
        (row.role !== "owner" || (row.role === "owner" && requester === "root"))
      ) {
        db.run(
          'UPDATE users SET role = "banned" WHERE username = ?',
          [username],
          function (err) {
            if (err) {
              return res
                .status(500)
                .json({ success: false, message: "Error banning user." });
            }
            if (this.changes > 0) {
              sendRoleChangeToClient(username, "banned"); // Send role change to the specific client
              broadcastToLobby(
                {
                  type: "system",
                  message: `${username} banned successfully.`,
                  requester: requester,
                },
                lobby
              );
            } else {
              res
                .status(404)
                .json({ success: false, message: "User not found." });
            }
          }
        );
      } else {
        broadcastToLobby(
          {
            type: "system",
            message: `You don't have permission to change status of an owner`,
            requester: requester,
          },
          lobby
        );
      }
    }
  );
}

function deleteMessage(messageId, timestamp, lobby) {
  if (deleteMessageFromFile(messageId, timestamp, lobby)) {
    broadcastToLobby({ type: "delete", id: messageId }, lobby);
    broadcastToLobby(
      { type: "system", message: `Message ${messageId} deleted by Admin.` },
      lobby
    );
  }
}

function deleteMessagesByUsername(targetUsername, lobby) {
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);
  if (fs.existsSync(chatHistoryFile)) {
    let chatHistory = JSON.parse(fs.readFileSync(chatHistoryFile, "utf-8"));

    // Log the messages being deleted for reference
    const messagesToDelete = chatHistory.filter(
      (message) => message.username === targetUsername
    );
    const messageIdsToDelete = messagesToDelete.map((message) => message.id);

    const filteredHistory = chatHistory.filter(
      (message) => message.username !== targetUsername
    );
    fs.writeFileSync(chatHistoryFile, JSON.stringify(filteredHistory));

    // Notify the lobby of the deletions
    broadcastToLobby(
      {
        type: "system",
        message: `All messages from user ${targetUsername} deleted by Admin.`,
      },
      lobby
    );

    // Optionally log what was deleted
    console.log(
      `Deleted messages from user ${targetUsername}: ${messageIdsToDelete.join(
        ", "
      )}`
    );
  }
}

function deleteMessageFromFile(messageId, timestamp, lobby) {
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);

  try {
    if (fs.existsSync(chatHistoryFile)) {
      // Read and decrypt the chat history
      const encryptedData = fs.readFileSync(chatHistoryFile, "utf-8");
      const decryptedData = decrypt(encryptedData);
      let chatHistory = JSON.parse(decryptedData);

      // Filter out the message with the matching id and timestamp
      const updatedHistory = chatHistory.filter(
        (msg) => !(msg.id === messageId && msg.timestamp === timestamp)
      );

      // Only write back to file if the history has changed
      if (updatedHistory.length !== chatHistory.length) {
        // Encrypt before saving
        const encryptedHistory = encrypt(JSON.stringify(updatedHistory));
        fs.writeFileSync(chatHistoryFile, encryptedHistory);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error in deleteMessageFromFile:", error);
    return false;
  }
}

function saveToChatHistory(message, lobby) {
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);

  // Read and decrypt existing chat history
  let chatHistory = [];
  if (fs.existsSync(chatHistoryFile)) {
    const encryptedData = fs.readFileSync(chatHistoryFile, "utf-8");
    chatHistory = JSON.parse(decrypt(encryptedData));
  }

  const messageIndex = chatHistory.findIndex(
    (msg) => msg.id === message.id && msg.timestamp === message.timestamp
  );

  if (messageIndex !== -1) {
    chatHistory[messageIndex] = message;
  } else {
    chatHistory.push({ ...message, type: message.type || "message" });
  }

  // Encrypt and save updated chat history
  const encryptedHistory = encrypt(JSON.stringify(chatHistory));
  fs.writeFileSync(chatHistoryFile, encryptedHistory);
}

function broadcastToLobby(message, lobbyName) {
  // Ensure the lobby exists
  if (!lobbies[lobbyName]) {
    return; // Stop execution if the lobby doesn't exist
  }

  // Iterate through all clients in the lobby
  lobbies[lobbyName].forEach((client) => {
    try {
      // Only send the message to clients with an open WebSocket connection
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message)); // Send the message to the client
      }
    } catch (error) {
      console.error("Error sending message to client:", error);
    }
  });
}

function closeLobby(lobbyName) {
  // Step 1: Get the current list of lobbies
  let lobbiesList = getLobbies(); // Assuming you have a function that gets the list of lobbies

  // Step 2: Find the lobby in the list
  const selectedLobbyIndex = lobbiesList.findIndex(
    (lobby) => lobby.lobby === lobbyName
  );

  if (selectedLobbyIndex !== -1) {
    // Step 3: Update the lobby's active status to false
    lobbiesList[selectedLobbyIndex].active = false; // Update only the active status

    // Step 4: Save the updated lobbies list
    saveLobbies(lobbiesList); // Save the updated lobbies array

    // Step 5: Disconnect all users in the lobby
    if (lobbies[lobbyName]) {
      lobbies[lobbyName].forEach((client) => {
        // Iterate over the Set of clients
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close();
        }
      });

      console.log(
        `Lobby '${lobbyName}' is now inactive and all users are disconnected.`
      );
    } else {
      console.error(`No users found in lobby '${lobbyName}'`);
    }
  } else {
    console.error(`Lobby '${lobbyName}' not found.`);
  }
}

app.post("/admin/close-lobby", (req, res) => {
  const { lobby } = req.body; // Extract the lobby name from the request body

  // Check if lobby name exists in the request body
  if (!lobby) {
    return res
      .status(400)
      .json({ success: false, message: "No lobby name provided" });
  }

  // Get the lobbies list
  const lobbies = getLobbies();

  // Find the lobby in the lobbies list (ensure to trim the names and avoid any whitespace issues)
  const selectedLobby = lobbies.find((l) => l.lobby.trim() === lobby.trim());

  if (selectedLobby) {
    // Call the closeLobby function
    closeLobby(lobby);

    res.json({ success: true, message: `Lobby '${lobby}' has been closed.` });
  } else {
    console.log(`Lobby not found: ${lobby}`); // Debugging
    res.status(404).json({ success: false, message: "Lobby not found." });
  }
});

// Checking if user is Admin
function isAdmin(req, res, next) {
  const username = req.body.username; // You may need to get this from a session or token

  db.get(
    `SELECT role FROM users WHERE username = ?`,
    [username],
    (err, row) => {
      if (err) {
        console.error("Error fetching role:", err.message);
        return res
          .status(500)
          .json({ success: false, message: "Error checking role." });
      }
      if (row && row.role === "admin") {
        next(); // User is admin, proceed to the route handler
      } else {
        res
          .status(403)
          .json({ success: false, message: "Unauthorized access." });
      }
    }
  );
}

function sendRoleChangeToClient(username, newRole) {
  const message = JSON.stringify({
    type: "ROLE_CHANGE",
    username: username,
    role: newRole,
  });

  // Find the client associated with the username
  for (const [client, user] of clients.entries()) {
    if (user === username && client.readyState === WebSocket.OPEN) {
      client.send(message); // Send message to specific client
      break; // Stop after sending to the first matched client
    }
  }
}

// Route to make a user an owner
app.post("/admin/make-owner", (req, res) => {
  const { username, requester } = req.body;

  if (requester === "root") {
    db.run(
      `UPDATE users SET role = 'owner' WHERE username = ?`,
      [username],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, message: err.message });
        }
        if (this.changes > 0) {
          sendRoleChangeToClient(username, "owner");
          res.json({ success: true, message: `${username} is now an owner.` });
        } else {
          res.status(404).json({ success: false, message: "User not found." });
        }
      }
    );
  } else {
    res.status(403).json({ success: false, message: "Access denied." });
  }
});

// Route to make a user a regular user
app.post("/admin/make-user", (req, res) => {
  const { username } = req.body;

  db.run(
    `UPDATE users SET role = 'user' WHERE username = ?`,
    [username],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "Error promoting user to user." });
      }
      if (this.changes > 0) {
        sendRoleChangeToClient(username, "user"); // Send role change to the specific client
        res.json({ success: true, message: `User ${username} is now a user.` });
      } else {
        res.status(404).json({ success: false, message: "User not found." });
      }
    }
  );
});

// Route to ban a user
app.post("/admin/ban-user", (req, res) => {
  const { username } = req.body;

  db.run(
    'UPDATE users SET role = "banned" WHERE username = ?',
    [username],
    function (err) {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: "Error banning user." });
      }
      if (this.changes > 0) {
        sendRoleChangeToClient(username, "banned"); // Send role change to the specific client
        res.json({ success: true, message: "User banned successfully." });
      } else {
        res.status(404).json({ success: false, message: "User not found." });
      }
    }
  );
});
// Route to get all users
app.get("/admin/users", (req, res) => {
  db.all("SELECT username, role FROM users", (err, rows) => {
    if (err) {
      console.error("Error fetching users:", err.message);
      return res
        .status(500)
        .json({ success: false, message: "Error fetching users." });
    }
    res.json({ success: true, users: rows });
  });
});

// Route to delete a user
app.post("/admin/delete-user", (req, res) => {
  const { username } = req.body;

  db.run("DELETE FROM users WHERE username = ?", [username], function (err) {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Error deleting user." });
    }
    if (this.changes > 0) {
      res.json({ success: true, message: "User deleted successfully." });
    } else {
      res.status(404).json({ success: false, message: "User not found." });
    }
  });
});

// Route to clear chat history of a specific lobby
app.post("/admin/clear-chat", (req, res) => {
  const { lobby } = req.body;
  const chatHistoryFile = path.join(chatHistoryDir, `${lobby}.json`);

  if (fs.existsSync(chatHistoryFile)) {
    broadcastToLobby({ type: "clear" }, lobby);
    fs.unlinkSync(chatHistoryFile); // Remove the chat history file
    res.json({
      success: true,
      message: `Chat history cleared for lobby '${lobby}'.`,
    });
  } else {
    res.status(404).json({ success: false, message: "Lobby not found." });
  }
});

function kickUserFromLobby(username, lobby) {
  if (lobbies[lobby]) {
    // Find the user object from the Set
    const userToKick = [...lobbies[lobby]].find(
      (client) => client.username === username
    );

    if (userToKick) {
      // Check if the user is not an owner
      if (userToKick.role !== "owner") {
        // Broadcast the kick event to the remaining users in the lobby
        broadcastToLobby({ type: "kick", username: username }, lobby);

        // Check if the WebSocket is open before closing
        if (userToKick.ws.readyState === WebSocket.OPEN) {
          userToKick.ws.close(); // Close the WebSocket connection of the user being kicked
          console.log(`WebSocket connection for ${username} is now closed.`);
        }

        // Remove the user from the lobby
        lobbies[lobby] = new Set(
          [...lobbies[lobby]].filter((client) => client.username !== username)
        );

        console.log(`${username} has been kicked from the lobby.`);
      } else {
        console.log(`Cannot kick the owner (${username}) from the lobby.`);
      }
    }
  }
}

// Route to kick a user from a lobby
app.post("/admin/kick-user", (req, res) => {
  const { username, lobby } = req.body;

  if (lobbies[lobby]) {
    // Call the kick function to kick the user
    kickUserFromLobby(username, lobby);

    res.json({
      success: true,
      message: `User '${username}' kicked from lobby '${lobby}'.`,
    });
  } else {
    res
      .status(404)
      .json({ success: false, message: "Lobby or user not found." });
  }
});

// Route to get the list of all lobbies and mark active ones
app.get("/admin/active-lobbies", (req, res) => {
  const lobbyFilePath = path.join(__dirname, "userdata", "lobby.json");

  fs.readFile(lobbyFilePath, "utf8", (err, data) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Error reading lobby data" });
    }

    let lobbies;
    try {
      lobbies = JSON.parse(data); // Assuming lobbies are stored as an array in the lobby.json file
    } catch (parseError) {
      return res
        .status(500)
        .json({ success: false, message: "Error parsing lobby data" });
    }

    // Get active lobbies
    const activeLobbies = getActiveLobbies(); // Get active lobbies from the function

    // Combine the lobbies from the file with the active status
    const combinedLobbies = lobbies.map((lobby) => ({
      ...lobby,
      active: activeLobbies.includes(lobby.lobby), // Add active status if lobby is in activeLobbies
    }));

    res.json({ success: true, lobbies: combinedLobbies }); // Send the combined lobbies
  });
});

// Function to get active lobbies from the DOM
function getActiveLobbies() {
  const lobbyFilePath = path.join(__dirname, "userdata", "lobby.json");

  try {
    // Read the lobby.json file where the lobbies are stored
    const data = fs.readFileSync(lobbyFilePath, "utf8");

    // Parse the lobby data (assuming it's in the format you've mentioned earlier)
    const lobbies = JSON.parse(data);

    // Filter out the active lobbies (assuming you have an 'active' property for each lobby)
    const activeLobbies = lobbies
      .filter((lobby) => lobby.active === true)
      .map((lobby) => lobby.lobby);

    return activeLobbies; // Return an array of active lobby names
  } catch (error) {
    console.error("Error reading or parsing lobby file:", error);
    return [];
  }
}

// Error handling for invalid routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
