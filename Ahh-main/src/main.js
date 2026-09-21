import Phaser from 'phaser';
import VirtualJoyStickPlugin from 'phaser3-rex-plugins/plugins/virtualjoystick-plugin.js';

const ASSET_BASE = import.meta.env.BASE_URL;

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
const ANIMAL_DEFS = {
  fox: {
    actions: { idle: 4, walk: 6, run: 6, hurt: 4, death: 6 },
    scale: 1.35,
    speed: 62
  },
  hare: {
    actions: { idle: 4, walk: 5, run: 6, hurt: 4, death: 6 },
    scale: 1.15,
    speed: 82
  },
  deer: {
    actions: { idle: 4, walk: 6, run: 6, hurt: 4, death: 7 },
    scale: 1.45,
    speed: 72
  },
  black_grouse: {
    actions: { idle: 4, walk: 6, run: 0, flight: 6, hurt: 4, death: 6 },
    scale: 1.15,
    speed: 68
  },
  boar: {
    actions: { idle: 4, walk: 6, run: 5, attack: 5, hurt: 4, death: 6 },
    scale: 1.35,
    speed: 64,
    attackDamage: 8
  }
};
const ANIMAL_DIRECTIONS = {
  back: 'back',
  front: 'front',
  side_left: 'left',
  side_right: 'right'
};

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
    this.animals = [];
    this.playerHealth = 100;
    this.playerHurtTimer = null;
  }

  preload() {
    this.load.on('loaderror', (file) => {
      console.warn('Asset load error:', file.key || file.src || 'unknown');
    });

    this.load.spritesheet('sword_attack_atlas', `${ASSET_BASE}assets/sword_attack_atlas.png`, {
      frameWidth: ATTACK_FRAME_W,
      frameHeight: ATTACK_FRAME_H
    });
    this.load.spritesheet('sword_idle_atlas', `${ASSET_BASE}assets/sword_idle_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_walk_atlas', `${ASSET_BASE}assets/sword_walk_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('sword_run_atlas', `${ASSET_BASE}assets/sword_run_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_idle_atlas', `${ASSET_BASE}assets/unarmed_idle_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_walk_atlas', `${ASSET_BASE}assets/unarmed_walk_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });
    this.load.spritesheet('unarmed_run_atlas', `${ASSET_BASE}assets/unarmed_run_atlas.png`, {
      frameWidth: FRAME_W,
      frameHeight: FRAME_H
    });

    Object.entries(ANIMAL_DEFS).forEach(([species, definition]) => {
      Object.keys(definition.actions).forEach((action) => {
        if (!definition.actions[action]) {
          return;
        }

        Object.entries(ANIMAL_DIRECTIONS).forEach(([direction, fileDirection]) => {
          const fileName = species === 'boar'
            ? fileDirection === 'right'
              ? `boar_${action}_right.png`
              : `boar_${fileDirection}_${action}.png`
            : `${species}_${action}_${fileDirection}.png`;
          this.load.spritesheet(
            `animal_${species}_${action}_${direction}`,
            `${ASSET_BASE}assets/${fileName}`,
            { frameWidth: FRAME_W, frameHeight: FRAME_H }
          );
        });
      });
    });

    Object.entries(ANIMAL_DIRECTIONS).forEach(([direction, fileDirection]) => {
      this.load.spritesheet(
        `unarmed_hurt_${direction}`,
        `${ASSET_BASE}assets/unarmed_hurt_${direction.startsWith('side_') ? direction : fileDirection}.png`,
        { frameWidth: FRAME_W, frameHeight: FRAME_H }
      );
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

    if (this.isAttacking || this.playerHurtTimer) {
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
    if (this.isAttacking || this.playerHurtTimer) {
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

    this.createAnimals();

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
    this.createHealthDisplay();

    this.player.on('animationcomplete', (anim) => {
      if (anim.key && anim.key.startsWith('sword_attack_')) {
        this.finishAttack();
      }

      if (anim.key && anim.key.startsWith('unarmed_hurt_')) {
        this.playerHurtTimer = null;
        this.playIdleAnimation();
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

    Object.entries(ANIMAL_DEFS).forEach(([species, definition]) => {
      Object.entries(definition.actions).forEach(([action, columns]) => {
        if (!columns) {
          return;
        }

        Object.keys(ANIMAL_DIRECTIONS).forEach((direction) => {
          const key = `animal_${species}_${action}_${direction}`;
          if (!this.textures.exists(key) || this.anims.exists(key)) {
            return;
          }

          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(key, { start: 0, end: columns - 1 }),
            frameRate: action === 'run' || action === 'flight' ? 12 : action === 'walk' ? 10 : 8,
            repeat: action === 'hurt' || action === 'death' || action === 'attack' ? 0 : -1
          });
        });
      });
    });

    Object.keys(ANIMAL_DIRECTIONS).forEach((direction) => {
      const key = `unarmed_hurt_${direction}`;
      if (!this.textures.exists(key) || this.anims.exists(key)) {
        return;
      }

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: 0
      });
    });
  }

  createAnimals() {
    const spawnPlan = [
      ['fox', 2],
      ['hare', 2],
      ['deer', 2],
      ['black_grouse', 2],
      ['boar', 2]
    ];

    spawnPlan.forEach(([species, count]) => {
      for (let index = 0; index < count; index += 1) {
        const definition = ANIMAL_DEFS[species];
        const sprite = this.physics.add.sprite(
          Phaser.Math.Between(180, WORLD_WIDTH - 180),
          Phaser.Math.Between(180, WORLD_HEIGHT - 180),
          `animal_${species}_idle_front`
        );
        const animal = {
          species,
          definition,
          sprite,
          health: species === 'boar' ? 45 : 25,
          maxHealth: species === 'boar' ? 45 : 25,
          direction: 'front',
          nextDecisionAt: 0,
          attackCooldownAt: 0,
          hurtUntil: 0,
          attacking: false,
          dead: false
        };

        sprite.setScale(definition.scale);
        sprite.setDepth(5);
        sprite.body.setAllowGravity(false);
        sprite.body.setCollideWorldBounds(true);
        sprite.body.setSize(34, 38);
        sprite.body.setOffset(15, 20);
        sprite.setData('animal', animal);
        this.animals.push(animal);
        this.playAnimalAnimation(animal, 'idle');
        this.chooseAnimalDirection(animal, 0);
      }
    });
  }

  playAnimalAnimation(animal, action) {
    const key = `animal_${animal.species}_${action}_${animal.direction}`;
    const fallback = `animal_${animal.species}_idle_${animal.direction}`;
    this.safePlayAnimation(animal.sprite, key, fallback);
  }

  chooseAnimalDirection(animal, time) {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const speed = animal.definition.speed * Phaser.Math.FloatBetween(0.8, 1.15);
    animal.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    animal.nextDecisionAt = time + Phaser.Math.Between(1400, 3600);
    animal.direction = this.getDirectionKey(animal.sprite.body.velocity.x, animal.sprite.body.velocity.y);
  }

  updateAnimalDirection(animal) {
    const { x, y } = animal.sprite.body.velocity;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) {
      animal.direction = this.getDirectionKey(x, y);
    }
  }

  updateAnimals(time) {
    this.animals.forEach((animal) => {
      if (animal.dead) {
        return;
      }

      const sprite = animal.sprite;
      if (animal.hurtUntil > time) {
        sprite.setVelocity(0, 0);
        this.playAnimalAnimation(animal, 'hurt');
        return;
      }

      if (animal.attacking) {
        sprite.setVelocity(0, 0);
        return;
      }

      const distanceToPlayer = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y);
      if (animal.definition.attackDamage && distanceToPlayer < 120 && animal.attackCooldownAt <= time) {
        animal.attacking = true;
        animal.attackCooldownAt = time + 1800;
        this.playAnimalAnimation(animal, 'attack');
        this.time.delayedCall(380, () => {
          if (!animal.dead && Phaser.Math.Distance.Between(sprite.x, sprite.y, this.player.x, this.player.y) < 135) {
            this.takePlayerDamage(animal.definition.attackDamage);
          }
        });
        this.time.delayedCall(800, () => {
          animal.attacking = false;
          animal.nextDecisionAt = this.time.now;
        });
        return;
      }

      if (animal.nextDecisionAt <= time || sprite.body.speed < 1) {
        this.chooseAnimalDirection(animal, time);
      }

      this.updateAnimalDirection(animal);
      const action = sprite.body.speed > animal.definition.speed * 1.08 ? 'run' : 'walk';
      const resolvedAction = ANIMAL_DEFS[animal.species].actions[action] ? action : animal.species === 'black_grouse' && sprite.body.speed > 70 ? 'flight' : 'walk';
      this.playAnimalAnimation(animal, resolvedAction);
      sprite.setDepth(5 + sprite.y / WORLD_HEIGHT * 4);
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

  createHealthDisplay() {
    this.healthText = this.add.text(24, 24, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0);
    this.uiContainer.add(this.healthText);
    this.cameras.main.ignore(this.healthText);
    this.updateHealthDisplay();
  }

  updateHealthDisplay() {
    if (this.healthText) {
      this.healthText.setText(`HP ${Math.max(0, this.playerHealth)} / 100`);
    }
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
    if (this.attackHitLock || !this.animals.length) {
      return;
    }

    const target = this.animals.find((animal) => {
      if (animal.dead) {
        return false;
      }
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, animal.sprite.x, animal.sprite.y);
      return distance <= this.attackRange;
    });

    if (target) {
      this.attackHitLock = true;
      this.damageAnimal(target, 20);
    }
  }

  damageAnimal(animal, amount) {
    if (animal.dead) {
      return;
    }

    animal.health -= amount;
    animal.hurtUntil = this.time.now + 450;
    animal.sprite.setVelocity(0, 0);
    animal.sprite.setTint(0xff7777);
    this.playAnimalAnimation(animal, animal.health <= 0 ? 'death' : 'hurt');

    this.time.delayedCall(120, () => {
      animal.sprite.clearTint();
    });

    if (animal.health <= 0) {
      animal.dead = true;
      animal.attacking = false;
      animal.sprite.body.enable = false;
      this.time.delayedCall(700, () => {
        animal.sprite.setVisible(false);
      });
      this.time.delayedCall(6000, () => {
        animal.health = animal.maxHealth;
        animal.dead = false;
        animal.hurtUntil = 0;
        animal.sprite.setVisible(true);
        animal.sprite.body.enable = true;
        animal.sprite.setPosition(
          Phaser.Math.Between(180, WORLD_WIDTH - 180),
          Phaser.Math.Between(180, WORLD_HEIGHT - 180)
        );
        this.chooseAnimalDirection(animal, this.time.now);
      });
    }
  }

  takePlayerDamage(amount) {
    if (this.playerHurtTimer || this.isAttacking) {
      return;
    }

    this.playerHealth = Math.max(0, this.playerHealth - amount);
    this.updateHealthDisplay();
    this.playerHurtTimer = this.time.delayedCall(550, () => {
      this.playerHurtTimer = null;
      this.playIdleAnimation();
    });
    this.player.setTint(0xff5555);
    this.safePlayAnimation(this.player, `unarmed_hurt_${this.lastFacing}`, 'unarmed_hurt_front');
    this.time.delayedCall(180, () => this.player.clearTint());

    if (this.playerHealth <= 0) {
      this.playerHealth = 100;
      this.updateHealthDisplay();
      this.player.setPosition(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
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

    this.updateAnimals(this.time.now);

    if (this.playerHurtTimer) {
      this.player.setVelocity(0, 0);
      return;
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
