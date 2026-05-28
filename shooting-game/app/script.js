let score = 0;
const target = document.getElementById("target");
const scoreDisplay = document.getElementById("score");

// Move target randomly
function moveTarget() {
  const x = Math.random() * 350;
  const y = Math.random() * 350;
  target.style.left = x + "px";
  target.style.top = y + "px";
}

// Click event
target.onclick = function () {
  score++;
  scoreDisplay.innerText = score;
  moveTarget();
};

// Move automatically
setInterval(moveTarget, 800);

// Show pod hostname
fetch("/hostname")
  .then(res => res.text())
  .then(data => {
    document.getElementById("pod").innerText = data;
  })
  .catch(() => {
    document.getElementById("pod").innerText = "unknown";
  });
