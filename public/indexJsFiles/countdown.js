function startCountdown() {
  return new Promise((resolve) => {
    const countElement = document.getElementById("count");
    let countdownInterval;

    function updateCountdown() {
      const now = new Date();
      let targetTime = new Date();

      const day = now.getDay();

      if (day === 5) {
        targetTime.setHours(13, 40, 0, 0);
      } else if (day === 6 || day === 0) {
        countElement.innerHTML = "Weekend";
        return;
      } else {
        targetTime.setHours(16, 0, 0, 0);
      }

      if (now >= targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);

        if (day === 5) {
          countElement.innerHTML = "Weekend";
          return;
        }
      }

      if (
        day === 0 &&
        ((now.getHours() === 0 && now.getMinutes() === 0) ||
          now.getTime() > targetTime.getTime())
      ) {
        targetTime.setDate(targetTime.getDate() + 1);
        targetTime.setHours(16, 0, 0, 0);
      }

      const timeDifference = targetTime - now;

      if (timeDifference <= 0) {
        countElement.innerHTML = "Schule Aus!";
        return;
      } else {
        const hours = String(
          Math.floor(
            (timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
          )
        ).padStart(2, "0");
        const minutes = String(
          Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60))
        ).padStart(2, "0");
        const seconds = String(
          Math.floor((timeDifference % (1000 * 60)) / 1000)
        ).padStart(2, "0");

        countElement.innerHTML = `${hours}h ${minutes}m ${seconds}s`;
      }
    }

    countdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown();
    resolve();
  });
}

/*----------------------------------------------------------------------------------------------*/

function InitiallyCalls() {
    startCountdown()
        .then(() => {
            document.getElementById("CountdownJS").checked = true;
        });
}

InitiallyCalls();