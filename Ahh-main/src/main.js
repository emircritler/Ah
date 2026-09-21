import Phaser from 'phaser';
import VirtualJoyStickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

const FRAME_W = 64;
const FRAME_H = 64;
const ATTACK_COLUMNS = 8;
const ATTACK_ROWS = 4;
const ATTACK_FRAME_W = FRAME_W;
const ATTACK_FRAME_H = FRAME_H;
const ATTACK_ROW_BY_DIRECTION = {
  front: 0,
  side_left: 1,
  side_right: 2,
  back: 3
};
const SWORD_IDLE_COLUMNS = 12;
const SWORD_WALK_COLUMNS = 6;
const SWORD_RUN_COLUMNS = 8;
const STANDARD_DISPLAY_W = 64;
const STANDARD_DISPLAY_H = 64;
const STANDARD_HITBOX_W = 32;
const STANDARD_HITBOX_H = 48;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_SPEED = 150;
const RUN_SPEED = 240;

class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
    this.currentWeapon = 'unarmed';
    this.isAttacking = false;
    this.lastDirection = 1;
    this.lastFacing = 'front';
    this.attackHitLock = false;
    this.attackRange = 90;
    this.attackTimer = null;
  }

  preload() {
    this.load.on('loaderror', (file) => {
      console.warn('Asset load error:', file.key || file.src || 'unknown');
    });

    this.load.spritesheet('sword_attack_atlas', '/assets/sword_attack_atlas.png', {
      frameWidth: ATTACK_FRAME_W,
      frameHeight: ATTACK_FRAME_H
    });
    this.load.spritesheet('sword_idle_atlas', '/assets/sword_idle_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_walk_atlas', '/assets/sword_walk_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_run_atlas', '/assets/sword_run_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_idle_atlas', '/assets/unarmed_idle_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_walk_atlas', '/assets/unarmed_walk_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_run_atlas', '/assets/unarmed_run_atlas.png', {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
  }

  safePlayAnimation(target, animationKey, fallbackKey = 'idle_unarmed') {
    if (!target || !target.anims) {
      return false;
    }

    const resolvedAnimationKey = this.anims.exists(animationKey)
      ? animationKey
      : fallbackKey && this.anims.exists(fallbackKey)
        ? fallbackKey
        : null;

    if (resolvedAnimationKey) {
      target.setVisible(true);
      target.setAlpha(1);
      if (target.anims.currentAnim?.key !== resolvedAnimationKey || !target.anims.isPlaying) {
        target.anims.play(resolvedAnimationKey, true);
      }
      return true;
    }

    return false;
  }

  getDirectionKey(vx, vy) {
    if (Math.abs(vx) > Math.abs(vy)) {
      return vx >= 0 ? 'side_right' : 'side_left';
    }
    if (Math.abs(vy) > 0) {
      return vy >= 0 ? 'front' : 'back';
    }
    return this.lastFacing || 'front';
  }

  updateFacingFromVelocity(vx, vy) {
    this.lastFacing = this.getDirectionKey(vx, vy);
    this.player.setFlipX(false);
    this.player.setFlipY(false);
  }

  playMovementAnimation(vx, vy) {
    if (!this.player || !this.player.body) {
      return;
    }

    if (this.isAttacking) {
      return;
    }

    const moveSpeed = Math.hypot(vx, vy);
    const weaponSuffix = this.currentWeapon === 'sword' ? 'sword' : 'unarmed';
    const directionKey = this.getDirectionKey(vx, vy);

    if (moveSpeed <= 8) {
      this.lastFacing = directionKey;
      const idleKey = `${weaponSuffix}_idle_${directionKey}`;
      this.safePlayAnimation(this.player, idleKey, `${weaponSuffix}_idle_front`);
      return;
    }

    this.updateFacingFromVelocity(vx, vy);

    const action = moveSpeed >= RUN_SPEED * 0.75 ? 'run' : 'walk';
    const animationKey = `${weaponSuffix}_${action}_${this.lastFacing}`;
    const fallbackKey = `${weaponSuffix}_idle_${this.lastFacing}`;
    this.safePlayAnimation(this.player, animationKey, fallbackKey);
  }

  playIdleAnimation() {
    if (this.isAttacking) {
      return;
    }

    const weaponSuffix = this.currentWeapon === 'sword' ? 'sword' : 'unarmed';
    const directionKey = this.lastFacing || 'front';
    const idleKey = `${weaponSuffix}_idle_${directionKey}`;
    this.player.setFlipX(false);
    this.player.setFlipY(false);
    this.safePlayAnimation(this.player, idleKey, `${weaponSuffix}_idle_front`);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.roundPixels = true;

    const ground = this.add.graphics();
    ground.fillStyle(0x3a8f5b, 1);
    ground.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ground.setDepth(0);

    const grassPatch = this.add.graphics();
    grassPatch.fillStyle(0x4dbb6a, 0.2);

    for (let i = 0; i < 30; i += 1) {
      const x = Phaser.Math.Between(0, WORLD_WIDTH - 150);
      const y = Phaser.Math.Between(0, WORLD_HEIGHT - 150);
      grassPatch.fillRoundedRect(x, y, 120, 120, 12);
    }

    grassPatch.setDepth(1);

    this.createAnimations();

    this.lastFacing = 'front';
    this.player = this.physics.add.sprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'unarmed_idle_front');
    this.player.setOrigin(0.5, 0.5);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(1.25);
    this.player.setDisplaySize(STANDARD_DISPLAY_W, STANDARD_DISPLAY_H);
    this.setPlayerHitbox();
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.player.body.setMaxVelocity(RUN_SPEED, RUN_SPEED);
    this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT));

    this.dummy = this.physics.add.sprite(
      Phaser.Math.Between(500, WORLD_WIDTH - 500),
      Phaser.Math.Between(300, WORLD_HEIGHT - 300),
      'unarmed_idle_front'
    );
    this.dummy.setTexture('unarmed_idle_front');
    this.dummy.setScale(1.2);
    this.dummy.setDepth(9);
    this.dummy.setImmovable(true);
    this.dummy.body.setAllowGravity(false);
    this.dummy.body.moves = false;
    this.dummy.body.setCollideWorldBounds(true);
    this.dummy.setTint(0x88cc88);
    this.safePlayAnimation(this.dummy, 'unarmed_idle_front', 'unarmed_idle_front');
    this.dummy.setAlpha(0.9);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setZoom(1.25);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.uiCamera = this.cameras.add();
    this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');
    this.uiCamera.setRoundPixels(true);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);

    this.uiCamera.ignore(this.children.list);
    this.uiContainer = this.add.container();
    this.uiContainer.setScrollFactor(0);
    this.cameras.main.ignore(this.uiContainer);

    this.createMobileControls();

    this.player.on('animationcomplete', (anim) => {
      if (anim.key && anim.key.startsWith('sword_attack_')) {
        this.finishAttack();
      }
    });

    this.lastFacing = 'front';
    this.player.setFlipX(false);
    this.player.setFlipY(false);
    this.safePlayAnimation(this.player, 'unarmed_idle_front', 'unarmed_idle_front');
    this.scale.on('resize', this.resizeUi, this);
    this.resizeUi();
  }

  createAnimations() {
    const animationDefs = [];

    const actionColumns = {
      idle: SWORD_IDLE_COLUMNS,
      walk: SWORD_WALK_COLUMNS,
      run: SWORD_RUN_COLUMNS
    };
    ['sword', 'unarmed'].forEach((weapon) => {
      ['idle', 'walk', 'run'].forEach((action) => {
        const textureKey = `${weapon}_${action}_atlas`;
        const frameRate = action === 'run' ? 12 : action === 'walk' ? 10 : 8;
        const columns = actionColumns[action];
        ['back', 'front', 'side_left', 'side_right'].forEach((direction) => {
          const row = ATTACK_ROW_BY_DIRECTION[direction];
          const key = `${weapon}_${action}_${direction}`;
          const start = row * columns;
          animationDefs.push([key, textureKey, start, start + columns - 1, frameRate, -1]);
        });
      });
    });

    ['back', 'front', 'side_left', 'side_right'].forEach((direction) => {
      const row = ATTACK_ROW_BY_DIRECTION[direction];
      const textureKey = 'sword_attack_atlas';
      const key = `sword_attack_${direction}`;
      if (!this.textures.exists(textureKey) || row === undefined) {
        return;
      }

      const start = row * ATTACK_COLUMNS;
      animationDefs.push([key, textureKey, start, start + ATTACK_COLUMNS - 1, 10, 0]);
    });

    animationDefs.forEach(([key, textureKey, start, end, frameRate, repeat]) => {
      if (!this.textures.exists(textureKey)) {
        return;
      }

      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(textureKey, { start, end }),
          frameRate,
          repeat
        });
      }
    });
  }

  setPlayerHitbox() {
    if (!this.player?.body) {
      return;
    }

    this.player.body.setSize(STANDARD_HITBOX_W, STANDARD_HITBOX_H);
    this.player.body.setOffset(
      (this.player.width - STANDARD_HITBOX_W) / 2,
      (this.player.height - STANDARD_HITBOX_H) / 2
    );
  }

  finishAttack() {
    this.isAttacking = false;

    if (this.attackTimer) {
      this.attackTimer.remove(false);
      this.attackTimer = null;
    }

    this.playIdleAnimation();
    this.setPlayerHitbox();
  }

  createMobileControls() {
    const width = this.scale.width;
    const height = this.scale.height;

    const joystickBase = this.add.circle(0, 0, 72, 0x111111, 0.35).setStrokeStyle(4, 0xffffff, 0.85);
    const joystickThumb = this.add.circle(0, 0, 26, 0xffffff, 0.9);
    this.joystick = this.plugins.get('rexVirtualJoystick').add(this, {
      x: 120,
      y: height - 120,
      radius: 72,
      base: joystickBase,
      thumb: joystickThumb,
      fixed: true
    });

    this.uiContainer.add([joystickBase, joystickThumb]);

    this.attackButton = this.createActionButton('ATTACK', width - 118, height - 118, 48, 0x1f8fff, () => {
      this.triggerAttack();
    });

    this.equipButton = this.createActionButton('EQUIP', width - 118, height - 210, 42, 0x7b4dff, () => {
      this.currentWeapon = this.currentWeapon === 'sword' ? 'unarmed' : 'sword';
      this.updateEquipButtonLabel();
      const idleKey = `${this.currentWeapon === 'sword' ? 'sword' : 'unarmed'}_idle_${this.lastFacing || 'front'}`;
      if (!this.isAttacking) {
        this.safePlayAnimation(this.player, idleKey, `${this.currentWeapon === 'sword' ? 'sword' : 'unarmed'}_idle_front`);
      }
    });

    this.updateEquipButtonLabel();
  }

  createActionButton(labelText, x, y, radius, color, onPress) {
    const container = this.add.container(x, y);
    const bg = this.add.circle(0, 0, radius, color, 0.85).setStrokeStyle(4, 0xffffff, 0.9);
    const label = this.add.text(0, 0, labelText, {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    container.add([bg, label]);
    container.setScrollFactor(0);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onPress);
    bg.on('pointerup', () => {});

    this.uiContainer.add(container);
    this.cameras.main.ignore(container);
    return { container, bg, label };
  }

  updateEquipButtonLabel() {
    if (!this.equipButton) {
      return;
    }
    const text = this.currentWeapon === 'sword' ? 'UNEQUIP' : 'EQUIP';
    this.equipButton.label.setText(text);
  }

  resizeUi() {
    const width = this.scale.width;
    const height = this.scale.height;

    if (this.joystick) {
      this.joystick.setPosition(120, height - 120);
    }

    if (this.attackButton) {
      this.attackButton.container.setPosition(width - 118, height - 118);
    }

    if (this.equipButton) {
      this.equipButton.container.setPosition(width - 118, height - 210);
    }

    if (this.uiCamera) {
      this.uiCamera.setViewport(0, 0, width, height);
    }
  }

  triggerAttack() {
    if (this.isAttacking) {
      return;
    }

    if (this.currentWeapon !== 'sword') {
      return;
    }

    this.isAttacking = true;
    this.attackHitLock = false;
    this.player.setVisible(true);
    this.player.setAlpha(1);
    this.player.setOrigin(0.5, 0.5);
    this.setPlayerHitbox();
    const attackDirection = this.lastFacing || 'front';
    const attackKey = `sword_attack_${attackDirection}`;
    const fallbackKey = 'sword_attack_front';
    const attackStarted = this.safePlayAnimation(this.player, attackKey, fallbackKey);

    if (!attackStarted) {
      this.finishAttack();
      return;
    }

    this.attackTimer = this.time.delayedCall(1200, () => {
      if (this.isAttacking) {
        this.finishAttack();
      }
    });
  }

  checkAttackHit() {
    if (this.attackHitLock || !this.dummy) {
      return;
    }

    const dx = this.player.x - this.dummy.x;
    const dy = this.player.y - this.dummy.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= this.attackRange) {
      this.attackHitLock = true;
      this.dummy.setTint(0xff6666);
      this.tweens.add({
        targets: this.dummy,
        alpha: 0.7,
        duration: 70,
        yoyo: true,
        repeat: 0,
        onComplete: () => {
          this.dummy.clearTint();
          this.dummy.setAlpha(0.9);
        }
      });
    }
  }

  update() {
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const keyboardDx = (right ? 1 : 0) - (left ? 1 : 0);
    const keyboardDy = (down ? 1 : 0) - (up ? 1 : 0);

    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.triggerAttack();
    }

    let vx = 0;
    let vy = 0;
    let moveSpeed = PLAYER_SPEED;
    let usingJoystick = false;

    if (this.joystick && this.joystick.force > 5) {
      const force = this.joystick.force;
      const magnitude = Phaser.Math.Clamp(force / this.joystick.radius, 0, 1);
      const nx = this.joystick.forceX / Math.max(1, force);
      const ny = this.joystick.forceY / Math.max(1, force);
      vx = nx * (magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED);
      vy = ny * (magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED);
      moveSpeed = magnitude > 0.7 ? RUN_SPEED : PLAYER_SPEED;
      usingJoystick = true;
    } else if (keyboardDx !== 0 || keyboardDy !== 0) {
      const keyboardMagnitude = Math.hypot(keyboardDx, keyboardDy);
      vx = (keyboardDx / keyboardMagnitude) * PLAYER_SPEED;
      vy = (keyboardDy / keyboardMagnitude) * PLAYER_SPEED;
      moveSpeed = PLAYER_SPEED;
    }

    if (this.isAttacking) {
      this.player.setVelocity(0, 0);
      const frameIndex = this.player.anims.currentFrame ? this.player.anims.currentFrame.index % ATTACK_COLUMNS : 0;
      if (frameIndex >= 3 && frameIndex <= 5 && !this.attackHitLock) {
        this.checkAttackHit();
      }
      return;
    }

    if (Math.abs(vx) > 0 || Math.abs(vy) > 0) {
      this.player.setVelocity(vx, vy);
      this.playMovementAnimation(vx, vy);
      return;
    }

    this.player.setVelocity(0, 0);

    if (usingJoystick && this.joystick.force <= 5) {
      this.playIdleAnimation();
      return;
    }

    this.playIdleAnimation();
  }
}

const config = {
  type: Phaser.WEBGL,
  parent: 'app',
  backgroundColor: '#0b2414',
  pixelArt: true,
  render: {
    antialias: false,
    roundPixels: true
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scale: {
    width: window.innerWidth,
    height: window.innerHeight,
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  fps: {
    target: 60,
    forceSetTimeOut: false
  },
  plugins: {
    global: [{ key: 'rexVirtualJoystick', plugin: VirtualJoyStickPlugin, start: true }]
  },
  scene: [MainScene]
};

window.addEventListener('resize', () => {
  if (window.__phaserGame) {
    window.__phaserGame.scale.resize(window.innerWidth, window.innerHeight);
  }
});

window.__phaserGame = new Phaser.Game(config);
