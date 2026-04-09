class PixelOffice {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.pixelSize = 4;
    this.agents = [];
    this.furniture = [];
    this.animationFrame = null;
    this.time = 0;

    this.statusColors = {
      active: '#22c55e',
      idle: '#eab308',
      paused: '#a0a0a0',
      error: '#ef4444'
    };

    this.initFurniture();
  }

  initFurniture() {
    this.furniture = [
      { type: 'desk', x: 20, y: 20, width: 60, height: 30 },
      { type: 'desk', x: 100, y: 20, width: 60, height: 30 },
      { type: 'desk', x: 20, y: 80, width: 60, height: 30 },
      { type: 'desk', x: 100, y: 80, width: 60, height: 30 },
      { type: 'plant', x: 10, y: 10 },
      { type: 'plant', x: 170, y: 10 },
      { type: 'plant', x: 10, y: 130 },
      { type: 'plant', x: 170, y: 130 },
      { type: 'coffee', x: 85, y: 65 }
    ];
  }

  pixel(x, y, color = '#000') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      x * this.pixelSize,
      y * this.pixelSize,
      this.pixelSize,
      this.pixelSize
    );
  }

  drawOffice() {
    this.ctx.fillStyle = '#f5f5f5';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = '#ddd';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(1, 1, this.canvas.width - 2, this.canvas.height - 2);

    this.furniture.forEach(item => {
      if (item.type === 'desk') {
        this.drawDesk(item.x, item.y, item.width, item.height);
      } else if (item.type === 'chair') {
        this.drawChair(item.x, item.y);
      } else if (item.type === 'plant') {
        this.drawPlant(item.x, item.y);
      } else if (item.type === 'coffee') {
        this.drawCoffeeMaker(item.x, item.y);
      }
    });
  }

  drawDesk(x, y, width, height) {
    this.ctx.fillStyle = '#8b4513';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, width * this.pixelSize, height * this.pixelSize);

    this.ctx.strokeStyle = '#654321';
    this.ctx.strokeRect(x * this.pixelSize, y * this.pixelSize, width * this.pixelSize, height * this.pixelSize);
  }

  drawChair(x, y) {
    this.ctx.fillStyle = '#4a4a4a';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, 12 * this.pixelSize, 16 * this.pixelSize);
  }

  drawPlant(x, y) {
    this.ctx.fillStyle = '#22863a';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, 8 * this.pixelSize, 20 * this.pixelSize);
    this.ctx.fillStyle = '#28a745';
    this.ctx.fillRect((x + 2) * this.pixelSize, (y - 8) * this.pixelSize, 4 * this.pixelSize, 10 * this.pixelSize);
  }

  drawCoffeeMaker(x, y) {
    this.ctx.fillStyle = '#666';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, 16 * this.pixelSize, 20 * this.pixelSize);
    this.ctx.fillStyle = '#999';
    this.ctx.fillRect((x + 2) * this.pixelSize, (y + 2) * this.pixelSize, 12 * this.pixelSize, 10 * this.pixelSize);
  }

  drawAgent(name, x, y, status = 'idle', animation = 'idle', progress = 0) {
    const statusColor = this.statusColors[status] || this.statusColors.idle;
    const posX = x * this.pixelSize;
    const posY = y * this.pixelSize;

    switch(animation) {
      case 'typing':
        this.drawTyping(posX, posY, statusColor, progress);
        break;
      case 'coffee':
        this.drawCoffee(posX, posY, statusColor, progress);
        break;
      case 'running':
        this.drawRunning(posX, posY, statusColor, progress);
        break;
      case 'phone':
        this.drawPhone(posX, posY, statusColor, progress);
        break;
      case 'thinking':
        this.drawThinking(posX, posY, statusColor, progress);
        break;
      case 'celebrating':
        this.drawCelebrating(posX, posY, statusColor, progress);
        break;
      case 'sleeping':
        this.drawSleeping(posX, posY, statusColor, progress);
        break;
      case 'waving':
        this.drawWaving(posX, posY, statusColor, progress);
        break;
      case 'stretching':
        this.drawStretching(posX, posY, statusColor, progress);
        break;
      case 'walking':
        this.drawWalking(posX, posY, statusColor, progress);
        break;
      default:
        this.drawIdle(posX, posY, statusColor);
    }

    this.ctx.fillStyle = '#000';
    this.ctx.font = '10px monospace';
    this.ctx.fillText(name, posX, posY - 10);
  }

  drawIdle(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);
    this.ctx.fillRect(x + 2, y + 8, 12, 2);
    this.ctx.fillRect(x + 4, y + 12, 8, 2);
  }

  drawTyping(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const armOffset = Math.sin(progress * Math.PI * 2) * 2;
    this.ctx.fillRect(x + 2 + armOffset, y + 8, 3, 6);
    this.ctx.fillRect(x + 11 - armOffset, y + 8, 3, 6);
    this.ctx.fillRect(x + 4, y + 14, 8, 2);
  }

  drawCoffee(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const cupY = y + 6 + Math.sin(progress * Math.PI * 2) * 1;
    this.ctx.fillStyle = '#8b4513';
    this.ctx.fillRect(x + 12, cupY, 3, 4);
    this.ctx.fillStyle = '#654321';
    this.ctx.fillRect(x + 13, cupY - 2, 2, 1);
  }

  drawRunning(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const legOffset = Math.sin(progress * Math.PI * 2) * 2;
    this.ctx.fillRect(x + 4, y + 10 + legOffset, 2, 4);
    this.ctx.fillRect(x + 10, y + 10 - legOffset, 2, 4);
  }

  drawPhone(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const handOffset = Math.sin(progress * Math.PI * 2) * 1;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(x + 10 + handOffset, y + 6, 4, 2);
    this.ctx.fillRect(x + 12, y + 4, 2, 4);
  }

  drawThinking(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);
    this.ctx.fillRect(x + 4, y + 12, 8, 2);

    const scale = 0.5 + Math.sin(progress * Math.PI * 2) * 0.5;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x + 13, y - 2 - (scale * 3), 2, 2);
    this.ctx.fillRect(x + 14, y - 1 - (scale * 2), 2, 2);
  }

  drawCelebrating(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const armUp = Math.sin(progress * Math.PI * 2) * 3;
    this.ctx.fillRect(x + 2, y + 4 - armUp, 3, 2);
    this.ctx.fillRect(x + 11, y + 4 - armUp, 3, 2);
    this.ctx.fillRect(x + 4, y + 12, 8, 2);
  }

  drawSleeping(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 4, 4, 2);
    this.ctx.fillRect(x + 10, y + 4, 4, 2);

    this.ctx.fillStyle = '#000';
    const eyeOffset = Math.sin(progress * Math.PI * 2) * 1;
    this.ctx.fillRect(x + 3, y + 5 - eyeOffset, 2, 1);
    this.ctx.fillRect(x + 11, y + 5 - eyeOffset, 2, 1);

    this.ctx.fillRect(x + 4, y + 12, 8, 2);
  }

  drawWaving(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const waveAngle = Math.sin(progress * Math.PI * 2) * 4;
    this.ctx.fillRect(x + 13, y + 6 + waveAngle, 2, 2);
    this.ctx.fillRect(x + 4, y + 12, 8, 2);
  }

  drawStretching(x, y, color, progress) {
    this.ctx.fillStyle = color;
    const stretchScale = 1 + Math.sin(progress * Math.PI * 2) * 0.3;
    this.ctx.fillRect(x, y - (stretchScale - 1) * 4, 16, 16 * stretchScale);

    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);
  }

  drawWalking(x, y, color, progress) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 16, 16);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(x + 2, y + 2, 4, 4);
    this.ctx.fillRect(x + 10, y + 2, 4, 4);

    const step = Math.sin(progress * Math.PI * 2) * 2;
    this.ctx.fillRect(x + 4, y + 10, 2, 4 + step);
    this.ctx.fillRect(x + 10, y + 10, 2, 4 - step);
  }

  addAgent(name, x, y, status = 'idle') {
    this.agents.push({
      name,
      x,
      y,
      status,
      animation: 'idle',
      animationStart: 0,
      animationDuration: 2000
    });
  }

  setAgentAnimation(name, animation, duration = 2000) {
    const agent = this.agents.find(a => a.name === name);
    if (agent) {
      agent.animation = animation;
      agent.animationStart = this.time;
      agent.animationDuration = duration;
    }
  }

  setAgentStatus(name, status) {
    const agent = this.agents.find(a => a.name === name);
    if (agent) {
      agent.status = status;
    }
  }

  animate() {
    this.time += 16;
    this.drawOffice();

    this.agents.forEach(agent => {
      const elapsed = this.time - agent.animationStart;
      const progress = (elapsed % agent.animationDuration) / agent.animationDuration;

      if (elapsed > agent.animationDuration && agent.animation !== 'idle') {
        agent.animation = 'idle';
      }

      this.drawAgent(
        agent.name,
        agent.x,
        agent.y,
        agent.status,
        agent.animation,
        progress
      );
    });

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  start() {
    this.animate();
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

export default PixelOffice;
