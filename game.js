(() => {
  "use strict";

  const canvas = document.querySelector("#game-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector("#game-stage");
  const message = document.querySelector("#game-message");
  const scoreEl = document.querySelector("#score");
  const highScoreEl = document.querySelector("#high-score");
  const lifeValueEl = document.querySelector("#life-value");
  const lifeHeartsEl = document.querySelector("#life-hearts");
  const startButton = document.querySelector("#start-game");
  const pauseButton = document.querySelector("#pause-game");
  const restartButton = document.querySelector("#restart-game");
  const grid = { columns: 24, rows: 16 };
  const maxLife = 100;
  const tickMs = 145;
  let worm;
  let food;
  let enemies;
  let heart;
  let direction;
  let queuedDirection;
  let score;
  let highScore = readHighScore();
  let life;
  let state = "ready";
  let loopId = null;
  let lastTick = 0;
  let elapsed = 0;
  let moveElapsed = 0;
  let enemyElapsed = 0;
  let nextHeartAt = 5000;
  let nextExplosionAt = 6000;
  let explosionUntil = 0;
  let respawnTimers = [];

  function readHighScore() {
    try { return Number(localStorage.getItem("worm-high-score")) || 0; } catch { return 0; }
  }

  function writeHighScore() {
    try { localStorage.setItem("worm-high-score", String(highScore)); } catch { /* storage is optional */ }
  }

  function resetGame() {
    clearLoop();
    respawnTimers.forEach((timer) => window.clearTimeout(timer));
    respawnTimers = [];
    worm = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
    direction = { x: 1, y: 0 };
    queuedDirection = { x: 1, y: 0 };
    enemies = [{ x: 17, y: 4, dx: 0, dy: 1 }, { x: 18, y: 12, dx: -1, dy: 0 }];
    food = randomOpenCell();
    heart = null;
    score = 0;
    life = maxLife;
    elapsed = 0;
    moveElapsed = 0;
    enemyElapsed = 0;
    nextHeartAt = randomBetween(4000, 8000);
    nextExplosionAt = 6000;
    explosionUntil = 0;
    state = "ready";
    updateHud();
    setMessage("START // 방향키 또는 WASD로 이동");
    draw();
    updateButtons();
  }

  function startGame() {
    if (state === "gameover") resetGame();
    if (state === "running") return;
    state = "running";
    setMessage("RUNNING // 적과 폭발을 피하세요");
    updateButtons();
    startLoop();
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";
      clearLoop();
      setMessage("PAUSED // Pause를 눌러 계속");
    } else if (state === "paused") {
      state = "running";
      setMessage("RUNNING // 계속 진행 중");
      startLoop();
    }
    updateButtons();
  }

  function startLoop() {
    clearLoop();
    lastTick = performance.now();
    loopId = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - lastTick, 250);
      lastTick = now;
      update(delta);
      draw();
    }, 50);
  }

  function clearLoop() {
    if (loopId !== null) window.clearInterval(loopId);
    loopId = null;
  }

  function update(delta) {
    if (state !== "running") return;
    elapsed += delta;
    moveElapsed += delta;
    enemyElapsed += delta;
    if (moveElapsed >= tickMs) {
      moveElapsed = 0;
      moveWorm();
    }
    if (enemyElapsed >= 420) {
      enemyElapsed = 0;
      moveEnemies();
    }
    if (elapsed >= nextExplosionAt) triggerExplosion();
    if (!heart && elapsed >= nextHeartAt) spawnHeart();
    if (heart && elapsed >= heart.expiresAt) heart = null;
  }

  function moveWorm() {
    direction = queuedDirection;
    const head = { x: worm[0].x + direction.x, y: worm[0].y + direction.y };
    if (isOutside(head) || worm.some((part) => part.x === head.x && part.y === head.y)) {
      endGame("GAME OVER // 벽 또는 몸에 충돌");
      return;
    }
    if (enemies.some((enemy) => enemy.x === head.x && enemy.y === head.y)) {
      endGame("GAME OVER // 적과 충돌");
      return;
    }
    worm.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += 10;
      if (score > highScore) { highScore = score; writeHighScore(); }
      food = randomOpenCell();
    } else {
      worm.pop();
    }
    if (heart && head.x === heart.x && head.y === heart.y) {
      life = Math.min(maxLife, life + 10);
      heart = null;
      setMessage("HEART COLLECTED // LIFE +10");
    }
    updateHud();
  }

  function moveEnemies() {
    enemies.forEach((enemy) => {
      const options = [{ x: enemy.dx, y: enemy.dy }, { x: -enemy.dy, y: enemy.dx }, { x: enemy.dy, y: -enemy.dx }];
      const choice = options[Math.floor(Math.random() * options.length)];
      const next = { x: enemy.x + choice.x, y: enemy.y + choice.y };
      if (!isOutside(next) && !worm.some((part) => part.x === next.x && part.y === next.y)) {
        enemy.x = next.x;
        enemy.y = next.y;
        enemy.dx = choice.x;
        enemy.dy = choice.y;
      } else {
        enemy.dx *= -1;
        enemy.dy *= -1;
      }
    });
  }

  function triggerExplosion() {
    nextExplosionAt += 6000;
    life = Math.max(0, life - 10);
    explosionUntil = performance.now() + 800;
    stage.classList.remove("is-exploding");
    void stage.offsetWidth;
    stage.classList.add("is-exploding");
    setMessage("WARNING // EXPLOSION -10 LIFE");
    if (enemies.length > 0) {
      enemies.splice(Math.floor(Math.random() * enemies.length), 1);
      const timer = window.setTimeout(() => {
        if (state !== "gameover" && enemies.length < 2) enemies.push(newEnemy());
        respawnTimers = respawnTimers.filter((item) => item !== timer);
      }, 2000);
      respawnTimers.push(timer);
    }
    if (life <= 0) endGame("GAME OVER // LIFE ZERO");
    updateHud();
  }

  function spawnHeart() {
    heart = { ...randomOpenCell(), expiresAt: elapsed + 10000 };
    nextHeartAt = elapsed + randomBetween(6000, 10000);
    setMessage("HEART SIGNAL // +10 LIFE AVAILABLE");
  }

  function endGame(text) {
    state = "gameover";
    clearLoop();
    setMessage(text);
    updateButtons();
    draw();
  }

  function setDirection(next) {
    const vectors = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const candidate = vectors[next];
    if (!candidate || (candidate.x === -direction.x && candidate.y === -direction.y)) return;
    queuedDirection = candidate;
    if (state === "ready") startGame();
  }

  function randomOpenCell() {
    const occupied = [...worm, ...enemies, ...(food ? [food] : []), ...(heart ? [heart] : [])];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = { x: Math.floor(Math.random() * grid.columns), y: Math.floor(Math.random() * grid.rows) };
      if (!occupied.some((item) => item.x === candidate.x && item.y === candidate.y)) return candidate;
    }
    return { x: 2, y: 2 };
  }

  function newEnemy() {
    const cell = randomOpenCell();
    return { ...cell, dx: Math.random() > 0.5 ? 1 : -1, dy: 0 };
  }

  function isOutside(cell) { return cell.x < 0 || cell.y < 0 || cell.x >= grid.columns || cell.y >= grid.rows; }
  function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function updateHud() {
    scoreEl.textContent = String(score);
    highScoreEl.textContent = String(highScore);
    lifeValueEl.textContent = String(life);
    lifeHeartsEl.textContent = "♥".repeat(Math.max(0, Math.ceil(life / 20)));
  }

  function updateButtons() {
    startButton.disabled = state === "running" || state === "paused";
    pauseButton.disabled = state !== "running" && state !== "paused";
    pauseButton.textContent = state === "paused" ? "Resume" : "Pause";
  }

  function setMessage(text) { message.textContent = text; }

  function draw() {
    const cellWidth = canvas.width / grid.columns;
    const cellHeight = canvas.height / grid.rows;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#03100a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(88, 255, 134, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= grid.columns; x += 1) { ctx.beginPath(); ctx.moveTo(x * cellWidth, 0); ctx.lineTo(x * cellWidth, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= grid.rows; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * cellHeight); ctx.lineTo(canvas.width, y * cellHeight); ctx.stroke(); }
    drawCell(food, "#ffbd4a", cellWidth, cellHeight, 0.23);
    if (heart) drawCell(heart, "#ff6f91", cellWidth, cellHeight, 0.35);
    enemies.forEach((enemy) => drawCell(enemy, "#ff754d", cellWidth, cellHeight, 0.2));
    worm.forEach((part, index) => drawCell(part, index === 0 ? "#d9ff73" : "#58ff86", cellWidth, cellHeight, 0.18));
    if (performance.now() < explosionUntil) {
      ctx.fillStyle = "rgba(255, 190, 64, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  document.addEventListener("keydown", (event) => {
    const keys = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
    if (keys[event.key]) { event.preventDefault(); setDirection(keys[event.key]); }
    if (event.key === "p") togglePause();
  });
  document.querySelectorAll("[data-direction]").forEach((button) => button.addEventListener("click", () => setDirection(button.dataset.direction)));
  startButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", resetGame);
  resetGame();
})();
