import { useEffect, useRef, useState, useCallback } from 'react';

// Types
interface Vector2D {
  x: number;
  y: number;
}

interface Ship {
  position: Vector2D;
  velocity: Vector2D;
  rotation: number;
  rotationSpeed: number;
  thrusting: boolean;
}

interface Asteroid {
  position: Vector2D;
  velocity: Vector2D;
  size: 'large' | 'medium' | 'small';
  rotation: number;
  rotationSpeed: number;
  points: Vector2D[];
}

interface Bullet {
  position: Vector2D;
  velocity: Vector2D;
  life: number;
}

interface Particle {
  position: Vector2D;
  velocity: Vector2D;
  life: number;
  maxLife: number;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SHIP_SIZE = 15;
const SHIP_THRUST = 0.15;
const SHIP_ROTATION_SPEED = 0.08;
const SHIP_FRICTION = 0.99;
const BULLET_SPEED = 7;
const BULLET_LIFE = 60;
const ASTEROID_SIZES = {
  large: 40,
  medium: 25,
  small: 15,
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  
  // Game state refs
  const shipRef = useRef<Ship>({
    position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    rotationSpeed: 0,
    thrusting: false,
  });
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef(new Set<string>());
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastShotTimeRef = useRef(0);

  // Generate random asteroid
  const generateAsteroid = useCallback((size: 'large' | 'medium' | 'small', x?: number, y?: number): Asteroid => {
    const radius = ASTEROID_SIZES[size];
    const numPoints = 8 + Math.floor(Math.random() * 4);
    const points: Vector2D[] = [];
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const variance = 0.5 + Math.random() * 0.5;
      points.push({
        x: Math.cos(angle) * radius * variance,
        y: Math.sin(angle) * radius * variance,
      });
    }

    let position: Vector2D;
    if (x !== undefined && y !== undefined) {
      position = { x, y };
    } else {
      // Spawn at edge
      const side = Math.floor(Math.random() * 4);
      switch (side) {
        case 0: position = { x: Math.random() * CANVAS_WIDTH, y: -radius }; break;
        case 1: position = { x: CANVAS_WIDTH + radius, y: Math.random() * CANVAS_HEIGHT }; break;
        case 2: position = { x: Math.random() * CANVAS_WIDTH, y: CANVAS_HEIGHT + radius }; break;
        default: position = { x: -radius, y: Math.random() * CANVAS_HEIGHT };
      }
    }

    const velocityAngle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;

    return {
      position,
      velocity: {
        x: Math.cos(velocityAngle) * speed,
        y: Math.sin(velocityAngle) * speed,
      },
      size,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.04,
      points,
    };
  }, []);

  // Initialize level
  const initLevel = useCallback((levelNum: number) => {
    asteroidsRef.current = [];
    const numAsteroids = 3 + levelNum;
    for (let i = 0; i < numAsteroids; i++) {
      asteroidsRef.current.push(generateAsteroid('large'));
    }
  }, [generateAsteroid]);

  // Start game
  const startGame = useCallback(() => {
    shipRef.current = {
      position: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      velocity: { x: 0, y: 0 },
      rotation: 0,
      rotationSpeed: 0,
      thrusting: false,
    };
    bulletsRef.current = [];
    particlesRef.current = [];
    setScore(0);
    setLevel(1);
    initLevel(1);
    setGameState('playing');
  }, [initLevel]);

  // Create particles
  const createExplosion = useCallback((x: number, y: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 1 + Math.random() * 3;
      particlesRef.current.push({
        position: { x, y },
        velocity: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        life: 30 + Math.random() * 30,
        maxLife: 60,
      });
    }
  }, []);

  // Wrap position around screen
  const wrapPosition = (pos: Vector2D): Vector2D => {
    return {
      x: (pos.x + CANVAS_WIDTH) % CANVAS_WIDTH,
      y: (pos.y + CANVAS_HEIGHT) % CANVAS_HEIGHT,
    };
  };

  // Check collision
  const checkCollision = (pos1: Vector2D, radius1: number, pos2: Vector2D, radius2: number): boolean => {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < radius1 + radius2;
  };

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      const ship = shipRef.current;
      const asteroids = asteroidsRef.current;
      const bullets = bulletsRef.current;
      const particles = particlesRef.current;
      const keys = keysRef.current;

      // Handle input
      if (keys.has('ArrowLeft')) {
        ship.rotation -= SHIP_ROTATION_SPEED;
      }
      if (keys.has('ArrowRight')) {
        ship.rotation += SHIP_ROTATION_SPEED;
      }
      if (keys.has('ArrowUp')) {
        ship.thrusting = true;
        ship.velocity.x += Math.cos(ship.rotation) * SHIP_THRUST;
        ship.velocity.y += Math.sin(ship.rotation) * SHIP_THRUST;
        
        // Thrust particles
        if (Math.random() > 0.5) {
          const exhaustAngle = ship.rotation + Math.PI + (Math.random() - 0.5) * 0.5;
          particles.push({
            position: { ...ship.position },
            velocity: {
              x: Math.cos(exhaustAngle) * 2 + ship.velocity.x * 0.5,
              y: Math.sin(exhaustAngle) * 2 + ship.velocity.y * 0.5,
            },
            life: 10 + Math.random() * 10,
            maxLife: 20,
          });
        }
      } else {
        ship.thrusting = false;
      }

      if (keys.has(' ')) {
        const now = Date.now();
        if (now - lastShotTimeRef.current > 200) {
          bullets.push({
            position: {
              x: ship.position.x + Math.cos(ship.rotation) * SHIP_SIZE,
              y: ship.position.y + Math.sin(ship.rotation) * SHIP_SIZE,
            },
            velocity: {
              x: Math.cos(ship.rotation) * BULLET_SPEED + ship.velocity.x,
              y: Math.sin(ship.rotation) * BULLET_SPEED + ship.velocity.y,
            },
            life: BULLET_LIFE,
          });
          lastShotTimeRef.current = now;
        }
      }

      // Update ship
      ship.velocity.x *= SHIP_FRICTION;
      ship.velocity.y *= SHIP_FRICTION;
      ship.position.x += ship.velocity.x;
      ship.position.y += ship.velocity.y;
      ship.position = wrapPosition(ship.position);

      // Update asteroids
      asteroids.forEach(asteroid => {
        asteroid.position.x += asteroid.velocity.x;
        asteroid.position.y += asteroid.velocity.y;
        asteroid.position = wrapPosition(asteroid.position);
        asteroid.rotation += asteroid.rotationSpeed;
      });

      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].position.x += bullets[i].velocity.x;
        bullets[i].position.y += bullets[i].velocity.y;
        bullets[i].position = wrapPosition(bullets[i].position);
        bullets[i].life--;
        
        if (bullets[i].life <= 0) {
          bullets.splice(i, 1);
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].position.x += particles[i].velocity.x;
        particles[i].position.y += particles[i].velocity.y;
        particles[i].life--;
        
        if (particles[i].life <= 0) {
          particles.splice(i, 1);
        }
      }

      // Check bullet-asteroid collisions
      for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = asteroids.length - 1; j >= 0; j--) {
          if (checkCollision(
            bullets[i].position,
            2,
            asteroids[j].position,
            ASTEROID_SIZES[asteroids[j].size]
          )) {
            const asteroid = asteroids[j];
            createExplosion(asteroid.position.x, asteroid.position.y, 10);
            
            // Split asteroid
            if (asteroid.size === 'large') {
              asteroids.push(generateAsteroid('medium', asteroid.position.x, asteroid.position.y));
              asteroids.push(generateAsteroid('medium', asteroid.position.x, asteroid.position.y));
              setScore(s => s + 20);
            } else if (asteroid.size === 'medium') {
              asteroids.push(generateAsteroid('small', asteroid.position.x, asteroid.position.y));
              asteroids.push(generateAsteroid('small', asteroid.position.x, asteroid.position.y));
              setScore(s => s + 50);
            } else {
              setScore(s => s + 100);
            }
            
            asteroids.splice(j, 1);
            bullets.splice(i, 1);
            break;
          }
        }
      }

      // Check ship-asteroid collisions
      for (let i = 0; i < asteroids.length; i++) {
        if (checkCollision(
          ship.position,
          SHIP_SIZE,
          asteroids[i].position,
          ASTEROID_SIZES[asteroids[i].size]
        )) {
          createExplosion(ship.position.x, ship.position.y, 30);
          setGameState('gameover');
          return;
        }
      }

      // Check if level complete
      if (asteroids.length === 0) {
        const nextLevel = level + 1;
        setLevel(nextLevel);
        initLevel(nextLevel);
      }

      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw stars background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      for (let i = 0; i < 50; i++) {
        const x = (i * 137.5) % CANVAS_WIDTH;
        const y = (i * 217.3) % CANVAS_HEIGHT;
        ctx.fillRect(x, y, 1, 1);
      }

      // Draw particles
      particles.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = `rgba(255, 150, 50, ${alpha})`;
        ctx.fillRect(particle.position.x - 1, particle.position.y - 1, 2, 2);
      });

      // Draw ship
      ctx.save();
      ctx.translate(ship.position.x, ship.position.y);
      ctx.rotate(ship.rotation);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE, -SHIP_SIZE / 2);
      ctx.lineTo(-SHIP_SIZE / 2, 0);
      ctx.lineTo(-SHIP_SIZE, SHIP_SIZE / 2);
      ctx.closePath();
      ctx.stroke();

      // Draw thrust
      if (ship.thrusting) {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(-SHIP_SIZE / 2, 0);
        ctx.lineTo(-SHIP_SIZE - 5, -4);
        ctx.lineTo(-SHIP_SIZE - 5, 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Draw asteroids
      asteroids.forEach(asteroid => {
        ctx.save();
        ctx.translate(asteroid.position.x, asteroid.position.y);
        ctx.rotate(asteroid.rotation);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        asteroid.points.forEach((point, i) => {
          if (i === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });

      // Draw bullets
      ctx.fillStyle = '#fff';
      bullets.forEach(bullet => {
        ctx.fillRect(bullet.position.x - 2, bullet.position.y - 2, 4, 4);
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, createExplosion, generateAsteroid, initLevel, level]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-gray-700 rounded-lg shadow-2xl"
        />
        
        {/* HUD */}
        {gameState === 'playing' && (
          <div className="absolute top-4 left-4 right-4 flex justify-between text-white font-mono">
            <div className="bg-black/50 px-4 py-2 rounded">Score: {score}</div>
            <div className="bg-black/50 px-4 py-2 rounded">Level: {level}</div>
          </div>
        )}

        {/* Menu */}
        {gameState === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <h1 className="text-6xl font-bold text-white mb-4 tracking-wider">ASTEROIDS</h1>
            <div className="text-white/70 mb-8 text-center space-y-2">
              <p>← → to rotate | ↑ to thrust | SPACE to shoot</p>
            </div>
            <button
              onClick={startGame}
              className="bg-white text-black px-8 py-3 rounded-lg font-bold text-xl hover:bg-gray-200 transition-colors"
            >
              START GAME
            </button>
          </div>
        )}

        {/* Game Over */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg">
            <h1 className="text-6xl font-bold text-red-500 mb-4">GAME OVER</h1>
            <p className="text-white text-2xl mb-2">Final Score: {score}</p>
            <p className="text-white/70 mb-8">Level: {level}</p>
            <button
              onClick={startGame}
              className="bg-white text-black px-8 py-3 rounded-lg font-bold text-xl hover:bg-gray-200 transition-colors"
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
