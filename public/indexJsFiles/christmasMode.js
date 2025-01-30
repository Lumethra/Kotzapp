document.addEventListener('DOMContentLoaded', function () {
  // Christmas Mode Logic
  const today = new Date();
  const isChristmas = today.getMonth() === 11 && today.getDate() === 24; // Check if today is 24th December

  if (isChristmas) {

    // Alternating green and red colors for the clock and countdown
    const clock = document.getElementById('clock');
    const count = document.getElementById('count');

    if (clock && count) {
      let isGreen = true;
      setInterval(() => {
        const color = isGreen ? 'green' : 'red';
        clock.style.color = color;
        count.style.color = color;
        isGreen = !isGreen;
      }, 500); // Toggle every 500ms
    }
  }
});
