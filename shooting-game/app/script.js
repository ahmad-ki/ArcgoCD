let score = 0;
const target = document.getElementById("target");
const scoreDisplay = document.getElementById("score");

function moveTarget() {
  const x = Math.random() * 350;
  const y = Math.random() * 350;
  target.style.left = x + "px";
  target.style.top = y + "px";
}

target.onclick = function () {
  score++;
  scoreDisplay.innerText = score;
  moveTarget();
};

setInterval(moveTarget, 1000);
