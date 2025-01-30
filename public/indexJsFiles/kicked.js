document.addEventListener("DOMContentLoaded", () => {
// Data for the rules
const rulesData = [
  "Be respectful and considerate to others.",
  "Do not use offensive language or call others names.",
  "Refrain from sharing inappropriate content.",
  "Respect everyone's privacy and do not share personal information.",
  "Follow all guidelines as set by the community admins.",
  "Avoid spamming or flooding the chat with unnecessary messages.",
  "Hacking is not permitted.",
  "Do not elvis other users.",
  "Report any violations to the moderators immediately to kotzapp@outlook.com."
];

// Select the container where the rules will be displayed
const rulesContainer = document.querySelector('.rulesContent');

// Dynamically create the rules and append to the container
rulesData.forEach((ruleText, index) => {
  const ruleDiv = document.createElement('div');
  ruleDiv.classList.add('rule');
  if (index === 0) {
    ruleDiv.classList.add('visible'); // Make the first rule visible initially
  }

  // Set the data-rule attribute
  ruleDiv.dataset.rule = ruleText;

  // Create the paragraph element
  const p = document.createElement('p');
  p.textContent = ruleText;

  // Create the input element
  const input = document.createElement('input');
  input.classList.add('rulesInput');
  input.type = 'text';
  input.placeholder = 'Type the rule exactly to proceed';

  // Append the paragraph and input to the rule div
  ruleDiv.appendChild(p);
  ruleDiv.appendChild(input);

  // Append the rule div to the container
  rulesContainer.appendChild(ruleDiv);
});

// Select all the rules (now generated dynamically)
const rules = document.querySelectorAll(".rule");
let currentRuleIndex = 0;

rules.forEach((rule, index) => {
  const input = rule.querySelector("input");

  // Add event listener to each input
  input.addEventListener("input", () => {
    // Check if the input matches the rule
    if (input.value === rule.dataset.rule) {
      input.disabled = true;
      input.style.backgroundColor = "#004d00"; // Indicate success

      // Move to the next rule if there's one
      if (index < rules.length - 1) {
        rules[index].classList.remove("visible");
        rules[index + 1].classList.add("visible");
        currentRuleIndex++;
      } else {
        // If it's the last rule, show a completion message
        alert("Congratulations! You have completed all the rules.");

        // Reset the rules and start from the beginning
        resetRules();
        currentRuleIndex = 0;
        rules[currentRuleIndex].classList.add("visible");
      }
    }
  });
});

// Function to reset all rules
function resetRules() {
  rules.forEach((rule) => {
    const input = rule.querySelector("input");
    input.disabled = false;  // Re-enable the input
    input.value = '';        // Clear the input field
    input.style.backgroundColor = ''; // Reset background color
    rule.classList.remove('visible');  // Remove the visible class
  });
}
});