import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import './Frogger.css';

import frogFrame0 from './assets/frog-frames/frame-0.svg'; // crouch / at rest
import frogFrame1 from './assets/frog-frames/frame-1.svg'; // launch
import frogFrame2 from './assets/frog-frames/frame-2.svg'; // apex
import frogFrame3 from './assets/frog-frames/frame-3.svg'; // descend
import frogFrame4 from './assets/frog-frames/frame-4.svg'; // landed, eating the fly

import car0  from './assets/cars/car-0.svg';
import car1  from './assets/cars/car-1.svg';
import car2  from './assets/cars/car-2.svg';
import car3  from './assets/cars/car-3.svg';
import car4  from './assets/cars/car-4.svg';
import car5  from './assets/cars/car-5.svg';
import car6  from './assets/cars/car-6.svg';
import car7  from './assets/cars/car-7.svg';
import car8  from './assets/cars/car-8.svg';
import car9  from './assets/cars/car-9.svg';
import car10 from './assets/cars/car-10.svg';
import car11 from './assets/cars/car-11.svg';

const FROG_FRAMES = [frogFrame0, frogFrame1, frogFrame2, frogFrame3, frogFrame4];

// Each car sprite faces right by default; ratio = natural width / height,
// used to size the sprite to CAR_H while keeping its own proportions.
const CAR_SHAPES = [
  { img: car0,  ratio: 2.890 },
  { img: car1,  ratio: 2.370 },
  { img: car2,  ratio: 2.485 },
  { img: car3,  ratio: 2.521 },
  { img: car4,  ratio: 2.703 },
  { img: car5,  ratio: 2.558 },
  { img: car6,  ratio: 2.783 },
  { img: car7,  ratio: 2.530 },
  { img: car8,  ratio: 2.634 },
  { img: car9,  ratio: 2.116 },
  { img: car10, ratio: 2.216 },
  { img: car11, ratio: 2.737 },
];

// ─── Constants ────────────────────────────────────────────────────────────────
const GAME_W     = 1000;
const GAME_H     = 560;
const CELL       = 80;
const FROG_S     = 50;  // collision hitbox — unchanged from the original game
const FROG_VIS_S = 60;  // on-screen sprite size; larger than the hitbox, centered over it
const CAR_H      = 44;
const INIT_LIVES = 3;
const HOP_DURATION  = 0.25; // seconds per hop, grid-to-grid
const HOP_HEIGHT    = 26;   // px visual rise at the peak of the arc
const FINISH_HOLD   = 0.7;  // seconds to hold the fly-eaten pose before next level

const LANES = [
  { dir:  1, baseSpeed: 12, count: 2 },
  { dir: -1, baseSpeed: 2, count: 3 },
  { dir:  1, baseSpeed: 1, count: 2 },
  { dir: -1, baseSpeed: 6, count: 2 },
  { dir:  1, baseSpeed: 2, count: 3 },
];

const START = { x: GAME_W / 2 - FROG_S / 2, y: CELL * 6, row: 6 };

// Module-level audio – initialized once, never reassigned
const SFX = {
  hit:     new Audio('/hit.mp3'),
  jump:    new Audio('/jump.mp3'),
  levelUp: new Audio('/level-up.mp3'),
};
Object.values(SFX).forEach(a => { a.preload = 'auto'; a.volume = 0.45; });

function makeCars(mult = 1) {
  return LANES.flatMap((lane, li) =>
    Array.from({ length: lane.count }, (_, ci) => {
      const shape = CAR_SHAPES[Math.floor(Math.random() * CAR_SHAPES.length)];
      return {
        id:    `${li}-${ci}`,
        row:   li + 1,
        x:     (ci / lane.count) * GAME_W,
        speed: lane.baseSpeed * mult * lane.dir,
        img:   shape.img,
        w:     Math.round(CAR_H * shape.ratio),
        flip:  lane.dir === -1,
      };
    })
  );
}

// ─── Frog Sprite ──────────────────────────────────────────────────────────────
// Animated frog built from 5 pre-cropped pose frames (crouch, launch, apex,
// descend, landed+fly-eaten). GSAP swaps the <img> src to cycle poses while a
// separate transform layer drives the hop arc / squash-stretch / facing flip,
// so the frame swap never fights the movement tween.
function FrogSprite({ size, imgRef, squashRef, flipRef, shadowRef }) {
  return (
    <div className="fg-frog-visual" style={{ width: size, height: size }}>
      <div ref={shadowRef} className="fg-frog-shadow" />
      <div ref={squashRef} className="fg-frog-squash">
        <div ref={flipRef} className="fg-frog-flip">
          <img
            ref={imgRef}
            src={FROG_FRAMES[0]}
            width={size}
            height={size}
            draggable={false}
            alt=""
            className="fg-frog-img"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Frogger() {
  const [phase, setPhase] = useState('idle');
  const [score, setScore] = useState(0);
  const [best,  setBest]  = useState(0);
  const [lives, setLives] = useState(INIT_LIVES);
  const [cars,  setCars]  = useState([]);

  // DOM refs
  const frogEl   = useRef(null);
  const boardEl  = useRef(null);
  const flashEl  = useRef(null);
  const carEls   = useRef({});

  // Mutable game state (no re-render on change)
  const carsData    = useRef([]);
  const frogPos     = useRef({ ...START });
  const visited     = useRef(new Set());
  const speedMul    = useRef(1);
  const scoreR      = useRef(0);
  const livesR      = useRef(INIT_LIVES);
  const phaseR      = useRef('idle');
  const moving      = useRef(false);
  // inputLocked: true during hit animation — blocks movement + collision re-trigger
  const inputLocked = useRef(false);

  // Frog sprite refs: img (frame source) + transform layers for the hop
  const frogImgRef    = useRef(null);
  const frogSquashRef = useRef(null); // arc translateY + squash/stretch scale
  const frogFlipRef   = useRef(null); // horizontal flip for left/right facing
  const frogShadowRef = useRef(null);
  const facing        = useRef(1);    // 1 = facing right, -1 = facing left
  const hopTl         = useRef(null); // current hop timeline, so a hit can cancel its pending frame swaps

  useEffect(() => { phaseR.current = phase; }, [phase]);

  // ─── Boot: transform origin for the squash/stretch layer ─────────────────
  useEffect(() => {
    gsap.set(frogSquashRef.current, { transformOrigin: '50% 50%' });
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const playSound = useCallback((name) => {
    const a = SFX[name];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }, []);

  const setFrogFrame = useCallback((i) => {
    if (frogImgRef.current) frogImgRef.current.src = FROG_FRAMES[i];
  }, []);

  const resetFrogVisual = useCallback(() => {
    gsap.set(frogSquashRef.current, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 });
    gsap.set(frogFlipRef.current, { scaleX: facing.current });
    gsap.set(frogShadowRef.current, { scaleX: 1, scaleY: 1, opacity: 0.35 });
    setFrogFrame(0);
  }, [setFrogFrame]);

  // ─── Start / Restart ──────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    speedMul.current    = 1;
    scoreR.current      = 0;
    livesR.current      = INIT_LIVES;
    visited.current     = new Set();
    moving.current      = false;
    inputLocked.current = false;
    facing.current       = 1;

    setScore(0);
    setLives(INIT_LIVES);
    phaseR.current = 'playing';
    setPhase('playing');

    const fresh = makeCars(1);
    carsData.current = fresh;
    setCars(fresh);

    frogPos.current = { ...START };
    gsap.set(frogEl.current, { x: START.x, y: START.y, opacity: 1 });
    resetFrogVisual();
  }, [resetFrogVisual]);

  // ─── Next run (frog reached goal) ─────────────────────────────────────────
  const nextRun = useCallback(() => {
    moving.current   = false;
    visited.current  = new Set();
    speedMul.current = Math.min(speedMul.current + 0.2, 3);

    playSound('levelUp');

    const fresh = makeCars(speedMul.current);
    carsData.current = fresh;
    setCars(fresh);

    // Kill any in-flight hop/finish tweens immediately so the frog isn't
    // mid-animation when new cars are checked for collision on the next tick.
    hopTl.current?.kill();
    hopTl.current = null;
    gsap.killTweensOf([frogEl.current, frogSquashRef.current, frogFlipRef.current, frogShadowRef.current]);
    frogPos.current = { ...START };
    gsap.set(frogEl.current, { x: START.x, y: START.y });
    resetFrogVisual();
  }, [playSound, resetFrogVisual]);

  // ─── Game Over ────────────────────────────────────────────────────────────
  // Animation already ran in hitFrog; just flip state.
  const endGame = useCallback(() => {
    phaseR.current = 'over';
    setPhase('over');
    setBest(prev => Math.max(prev, scoreR.current));
  }, []);

  // ─── Finish animation (frog reached the goal) ─────────────────────────────
  // Plays after the landing hop completes: a quick "gulp" swap to the
  // fly-eaten frame, held briefly, then hands off to nextRun().
  const playFinish = useCallback(() => {
    const tl = gsap.timeline();
    tl.to(frogSquashRef.current, { scaleX: 1.12, scaleY: 0.85, duration: 0.09, ease: 'power1.out' })
      .call(() => setFrogFrame(4))
      .to(frogSquashRef.current, { scaleX: 0.92, scaleY: 1.08, duration: 0.12, ease: 'power2.out' }, '<0.02')
      .to(frogSquashRef.current, { scaleX: 1, scaleY: 1, duration: 0.18, ease: 'elastic.out(1, 0.55)' })
      .to({}, { duration: FINISH_HOLD })
      .call(() => nextRun());
  }, [nextRun, setFrogFrame]);

  // ─── Hit animation ────────────────────────────────────────────────────────
  // Locks input, flattens the frog "pancake"-style, flashes screen, shakes
  // board. On complete: decrements lives, resets or triggers game over.
  const hitFrog = useCallback(() => {
    if (inputLocked.current) return;
    inputLocked.current = true;
    moving.current = false;

    // Cancel any pending frame-swap calls from an in-flight hop timeline so
    // they can't fire after the flatten/reset below has already run.
    hopTl.current?.kill();
    hopTl.current = null;

    playSound('hit');

    // Full-screen red flash fades out
    gsap.fromTo(
      flashEl.current,
      { opacity: 0.85 },
      { opacity: 0, duration: 0.5, ease: 'power2.out' }
    );

    // Board shake: rapid left-right oscillation
    gsap.to(boardEl.current, {
      x: 7, duration: 0.045, repeat: 6, yoyo: true, ease: 'none',
      onComplete: () => gsap.set(boardEl.current, { x: 0 }),
    });

    const tl = gsap.timeline({
      onComplete: () => {
        const newLives = livesR.current - 1;
        livesR.current = newLives;
        setLives(newLives);

        if (newLives <= 0) {
          endGame();
        } else {
          frogPos.current = { ...START };
          gsap.set(frogEl.current, { x: START.x, y: START.y });
          resetFrogVisual();
          inputLocked.current = false;
        }
      },
    });

    // Snap to the resting pose, then flatten + wobble like a squashed pancake
    tl.call(() => setFrogFrame(0))
      .to(frogSquashRef.current, { scaleX: 1.6, scaleY: 0.25, y: 10, duration: 0.1, ease: 'power3.out' })
      .to(frogSquashRef.current, { rotation: 25, duration: 0.12, ease: 'power1.inOut' }, '<')
      .to(frogSquashRef.current, { rotation: -18, duration: 0.16, ease: 'power1.inOut' })
      .to(frogSquashRef.current, { rotation: 8, duration: 0.14, ease: 'power1.inOut' })
      .to([frogSquashRef.current, frogShadowRef.current], { opacity: 0, duration: 0.25, ease: 'power2.in' }, '-=0.1');
  }, [playSound, endGame, resetFrogVisual, setFrogFrame]);

  // ─── Move Frog ────────────────────────────────────────────────────────────
  // Hops the frog one grid cell: the outer .fg-frog div tweens x/y linearly
  // (this drives collision detection, unchanged from before), while an inner
  // transform layer plays a purely-visual arc bounce + squash/stretch, and
  // the sprite frame cycles through the pose sequence in sync.
  const moveFrog = useCallback((dir) => {
    if (phaseR.current !== 'playing') return;
    if (moving.current || inputLocked.current) return;

    const { x, row } = frogPos.current;
    let nx = x, nr = row;

    if (dir === 'up')    { nr -= 1; }
    if (dir === 'down')  { nr += 1; }
    if (dir === 'left')  { nx -= CELL; }
    if (dir === 'right') { nx += CELL; }

    nx = Math.max(0, Math.min(GAME_W - FROG_S, nx));
    nr = Math.max(0, Math.min(6, nr));
    // ny is always derived from the (now-clamped) row, never clamped on its
    // own — GAME_H - FROG_S doesn't line up with row 6's y (480 vs 510), so
    // clamping ny independently let the frog drift 30px below the start
    // row's slot whenever "down" was pressed at the start.
    const ny = nr * CELL;

    frogPos.current = { x: nx, y: ny, row: nr };
    moving.current  = true;

    if (dir === 'left')  facing.current = -1;
    if (dir === 'right') facing.current = 1;
    gsap.set(frogFlipRef.current, { scaleX: facing.current });

    playSound('jump');

    const reachedGoal = nr === 0;

    const tl = gsap.timeline({
      onComplete: () => {
        moving.current = false;
        hopTl.current = null;
        if (reachedGoal) playFinish();
      },
    });
    hopTl.current = tl;

    // Grid-position tween — the ground-truth position collision uses.
    tl.to(frogEl.current, { x: nx, y: ny, duration: HOP_DURATION, ease: 'power1.inOut' }, 0);

    // Visual arc: rise then fall.
    tl.to(frogSquashRef.current, { y: -HOP_HEIGHT, duration: HOP_DURATION * 0.45, ease: 'power2.out' }, 0)
      .to(frogSquashRef.current, { y: 0, duration: HOP_DURATION * 0.55, ease: 'power2.in' }, HOP_DURATION * 0.45);

    // Squash on takeoff, stretch mid-air, squash again on landing.
    tl.to(frogSquashRef.current, { scaleX: 1.15, scaleY: 0.8, duration: 0.06, ease: 'power1.out' }, 0)
      .to(frogSquashRef.current, { scaleX: 0.88, scaleY: 1.18, duration: HOP_DURATION * 0.36, ease: 'power1.out' }, 0.06)
      .to(frogSquashRef.current, { scaleX: 1.2, scaleY: 0.78, duration: 0.05, ease: 'power2.in' }, HOP_DURATION - 0.09)
      .to(frogSquashRef.current, { scaleX: 1, scaleY: 1, duration: 0.09, ease: 'power1.out' }, HOP_DURATION - 0.04);

    // Ground shadow shrinks/fades as the frog rises, returns on landing.
    tl.to(frogShadowRef.current, { scaleX: 0.55, scaleY: 0.55, opacity: 0.12, duration: HOP_DURATION * 0.45, ease: 'power2.out' }, 0)
      .to(frogShadowRef.current, { scaleX: 1, scaleY: 1, opacity: 0.35, duration: HOP_DURATION * 0.55, ease: 'power2.in' }, HOP_DURATION * 0.45);

    // Cycle the sprite frames across the hop: launch → apex → descend → land.
    tl.call(() => setFrogFrame(1), [], 0)
      .call(() => setFrogFrame(2), [], HOP_DURATION * 0.38)
      .call(() => setFrogFrame(3), [], HOP_DURATION * 0.66)
      .call(() => setFrogFrame(0), [], HOP_DURATION * 0.92);

    if (dir === 'up' && nr >= 1 && nr <= 5 && !visited.current.has(nr)) {
      visited.current.add(nr);
      scoreR.current += 1;
      setScore(scoreR.current);
    }
  }, [playFinish, playSound, setFrogFrame]);

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (map[e.key]) { e.preventDefault(); moveFrog(map[e.key]); }
      if ((e.key === ' ' || e.key === 'Enter') && phaseR.current === 'idle') startGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveFrog, startGame]);

  // ─── GSAP ticker: move cars + collision ───────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    gsap.set(frogEl.current, { opacity: 1 });

    const tick = () => {
      if (phaseR.current !== 'playing') return;

      for (const car of carsData.current) {
        car.x += car.speed;
        if (car.speed > 0 && car.x >  GAME_W + car.w) car.x = -car.w;
        if (car.speed < 0 && car.x < -car.w)          car.x =  GAME_W + car.w;
        const el = carEls.current[car.id];
        if (el) gsap.set(el, { x: car.x });
      }

      // Skip collision while hit animation is running
      if (inputLocked.current) return;

      const fEl = frogEl.current;
      if (!fEl) return;

      // Math-based AABB instead of getBoundingClientRect(): both frog and
      // cars live in the same local coordinate space (position: absolute,
      // left/top: 0, moved via GSAP transform x/y), so comparing those
      // values directly is equivalent to comparing viewport rects — but
      // without forcing a synchronous layout reflow on every element, every
      // frame. That reflow is the single biggest jank source on weak TV
      // CPUs/GPUs (e.g. LG webOS sets), so this loop must stay DOM-read-free.
      const fx = gsap.getProperty(fEl, 'x');
      const fy = gsap.getProperty(fEl, 'y');
      const M  = 5;
      const fx1 = fx + M, fx2 = fx + FROG_S - M;
      const fy1 = fy + M, fy2 = fy + FROG_S - M;

      for (const car of carsData.current) {
        const cy1 = car.row * CELL + (CELL - CAR_H) / 2;
        const cy2 = cy1 + CAR_H;
        const cx1 = car.x, cx2 = car.x + car.w;
        if (fx1 < cx2 && fx2 > cx1 && fy1 < cy2 && fy2 > cy1) {
          hitFrog();
          return;
        }
      }
    };

    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [phase, hitFrog]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fg-wrap">
      {/* HUD */}
      <div className="fg-hud">
        <div className="fg-stat">
          <span className="fg-label">SCORE</span>
          <span className="fg-value">{score}</span>
        </div>
        <div className="fg-title-badge">FROGGER</div>
        <div className="fg-stat">
          <span className="fg-label">LIVES</span>
          <span className="fg-lives-row">
            {Array.from({ length: INIT_LIVES }, (_, i) => (
              <span key={i} className={i < lives ? 'fg-heart' : 'fg-heart fg-heart--lost'}>♥</span>
            ))}
          </span>
        </div>
        <div className="fg-stat">
          <span className="fg-label">BEST</span>
          <span className="fg-value">{best}</span>
        </div>
      </div>

      {/* Board */}
      <div ref={boardEl} className="fg-board" style={{ width: GAME_W, height: GAME_H }}>

        <div className="fg-zone fg-goal" style={{ top: 0, height: CELL }}>
          <span>🏁  G O A L  🏁</span>
        </div>

        {LANES.map((_, i) => (
          <div key={i} className="fg-lane" style={{ top: (i + 1) * CELL, height: CELL }}>
            <div className="fg-dash" />
          </div>
        ))}

        <div className="fg-zone fg-start" style={{ top: CELL * 6, height: CELL }}>
          <span>S T A R T</span>
        </div>

        {cars.map(car => (
          <img
            key={car.id}
            ref={el => {
              if (el) {
                carEls.current[car.id] = el;
                gsap.set(el, { scaleX: car.flip ? -1 : 1 });
              }
            }}
            src={car.img}
            draggable={false}
            alt=""
            className="fg-car"
            style={{ top: car.row * CELL + (CELL - CAR_H) / 2, width: car.w, height: CAR_H }}
          />
        ))}

        {/* Frog: outer div driven by GSAP x/y (collision hitbox); inner layers animate the hop */}
        <div ref={frogEl} className="fg-frog" style={{ width: FROG_S, height: FROG_S }}>
          <FrogSprite
            size={FROG_VIS_S}
            imgRef={frogImgRef}
            squashRef={frogSquashRef}
            flipRef={frogFlipRef}
            shadowRef={frogShadowRef}
          />
        </div>

        {/* Full-screen flash overlay — opacity driven by GSAP on hit */}
        <div ref={flashEl} className="fg-flash" />

        {phase === 'idle' && (
          <div className="fg-overlay">
            <div className="fg-card">
              <div className="fg-card-emoji">🐸</div>
              <h1>FROGGER</h1>
              <p>Cross all five lanes without getting hit!</p>
              <div className="fg-key-hint">
                <span>↑</span><span>↓</span><span>←</span><span>→</span>
                <em>to move</em>
              </div>
              <p className="fg-sub">Score 1 point per lane · {INIT_LIVES} lives</p>
              <button className="fg-btn" onClick={startGame}>▶ Start Game</button>
              <p className="fg-sub">or press Space / Enter</p>
            </div>
          </div>
        )}

        {phase === 'over' && (
          <div className="fg-overlay">
            <div className="fg-card fg-card--dead">
              <div className="fg-card-emoji">💀</div>
              <h1>GAME OVER</h1>
              <p className="fg-score-big">{score} pts</p>
              {score === best && best > 0 && <p className="fg-new-best">🏆 New best!</p>}
              <button className="fg-btn" onClick={startGame}>↺ Play Again</button>
            </div>
          </div>
        )}
      </div>

      <p className="fg-hint">Arrow keys to move · reach the goal to advance</p>
    </div>
  );
}
