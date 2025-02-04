// 1. Imports
import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Trophy, Users, Mouse, ZapIcon, Menu, X, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';

// 2. Constants & Types
const POINTS = {
  ACCURATE_PLACEMENT: 100,
  QUICK_PLACEMENT: 50, // Under 5 seconds
  COMBO: 25, // Multiple correct placements in succession
  COMPLETION_BONUS: 1000
};

const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

const CAMERA_PRESETS = {
  // ...existing presets...
  
  sphere: {
    position: new THREE.Vector3(0, 0, 4),
    target: new THREE.Vector3(0, 0, 0),
    controls: {
      maxDistance: 6,
      minDistance: 2,
      enablePan: false,
      maxPolarAngle: Math.PI * 0.85,
      minPolarAngle: Math.PI * 0.15
    }
  },
  
  pyramid: {
    position: new THREE.Vector3(2, 2, 2),
    target: new THREE.Vector3(0, 0, 0),
    controls: {
      maxDistance: 6,
      minDistance: 2,
      maxPolarAngle: Math.PI * 0.75
    }
  }
};

// 3. Reusable Components
const DifficultyMenu = ({ current, onChange, isHost }) => (
  <div className="absolute top-20 right-4 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 w-48 overflow-hidden">
    <div className="p-3 border-b border-gray-700">
      <h3 className="text-sm font-semibold text-white">Difficulty</h3>
    </div>
    <div className="p-2">
      {['easy', 'medium', 'hard', 'expert'].map((diff) => (
        <button
          key={diff}
          onClick={() => onChange(diff)}
          disabled={!isHost}
          className={`w-full p-2 mb-1 rounded-md flex items-center justify-between ${
            current === diff 
              ? 'bg-blue-500/20 text-blue-400' 
              : 'text-gray-300 hover:bg-gray-700/50'
          } transition-colors disabled:opacity-50`}
        >
          <span className="capitalize">{diff}</span>
          {current === diff && <Check size={16} />}
        </button>
      ))}
    </div>
  </div>
);

const StatsPanel = ({ stats }) => (
  <div className="absolute top-20 left-4 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 w-64">
    <div className="p-3 border-b border-gray-700">
      <h3 className="text-sm font-semibold text-white">Game Stats</h3>
    </div>
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <StatItem 
          label="Moves" 
          value={stats.moveCount} 
          icon={<Mouse className="w-4 h-4 text-blue-400" />} 
        />
        <StatItem 
          label="Accuracy" 
          value={`${stats.moveCount > 0 
            ? Math.round((stats.accurateDrops / stats.moveCount) * 100)
            : 0}%`} 
          icon={<Check className="w-4 h-4 text-green-400" />} 
        />
        <StatItem 
          label="Points" 
          value={stats.points} 
          icon={<Trophy className="w-4 h-4 text-yellow-400" />} 
        />
        <StatItem 
          label="Combo" 
          value={`${stats.combos}x`} 
          icon={<ZapIcon className="w-4 h-4 text-purple-400" />} 
        />
      </div>
      {/* Progress bar with percentage */}
      <div className="mt-2">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progress</span>
          <span>{Math.round((stats.accurateDrops / stats.totalPieces) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
            style={{ width: `${(stats.accurateDrops / stats.totalPieces) * 100}%` }}
          />
        </div>
      </div>
    </div>
  </div>
);

const StatItem = ({ label, value, icon }) => (
  <div className="bg-gray-700/30 rounded-lg p-2">
    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <div className="text-white font-medium">{value}</div>
  </div>
);

const MobileMenuButton = ({ icon: Icon, label, onClick, isActive }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 p-2 rounded-lg ${
      isActive ? 'bg-blue-500/20 text-blue-400' : 'text-gray-300'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const FloatingPanel = ({ title, icon: Icon, children, isOpen, onClose, position = "left" }) => {
  const positionClasses = {
    left: "left-4",
    right: "right-4",
    center: "left-1/2 -translate-x-1/2"
  };

  return (
    <div className={`
      fixed ${positionClasses[position]} top-20 
      md:absolute md:top-20 
      bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700
      transition-all duration-300 ease-in-out
      ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
      z-30
      w-[90vw] md:w-64
    `}>
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {title}
        </h3>
        <button
          onClick={onClose}
          className="md:hidden p-1 hover:bg-gray-700/50 rounded-lg"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="p-2 max-h-[60vh] md:max-h-[calc(100vh-12rem)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
};

const MobilePanel = ({ isOpen, onClose, title, children, icon: Icon }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 md:hidden">
      <div className="absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700/50 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
          {children}
        </div>
      </div>
    </div>
  );
};

// 4. Shader Definitions
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// 5. Utility Classes
class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: this.createParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);
  }

  createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  emit(position, count = 20, color = new THREE.Color(0x4a90e2)) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          Math.random() * 0.2
        ),
        color: color.clone(),
        size: 0.05 + Math.random() * 0.05,
        life: 1.0
      });
    }
    this.updateGeometry();
  }
  
  emitMultiple(particles) {
    particles.forEach(particleData => {
      this.particles.push({
        position: particleData.position.clone(),
        velocity: particleData.velocity.clone(),
        color: particleData.color.clone(),
        size: 0.05 + Math.random() * 0.05,
        life: 1.0
      });
    });
    this.updateGeometry();
  }
  
  update(deltaTime) {
    this.particles = this.particles.filter(particle => {
      particle.life -= deltaTime * 0.5;
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
      particle.velocity.y += deltaTime * 0.2; // Add gravity
      return particle.life > 0;
    });
    this.updateGeometry();
  }
  
  updateGeometry() {
    const positions = new Float32Array(this.particles.length * 3);
    const colors = new Float32Array(this.particles.length * 3);
    const sizes = new Float32Array(this.particles.length);
    
    this.particles.forEach((particle, i) => {
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
      
      colors[i * 3] = particle.color.r;
      colors[i * 3 + 1] = particle.color.g;
      colors[i * 3 + 2] = particle.color.b;
      
      sizes[i] = particle.size * particle.life;
    });
    
    this.particleSystem.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    this.particleSystem.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3)
    );
    this.particleSystem.geometry.setAttribute(
      'size',
      new THREE.BufferAttribute(sizes, 1)
    );
  }
}

// 6. Utility Functions
const highlightPiece = (piece) => {
  if (piece && piece.material && piece.material.uniforms && !piece.userData.isPlaced) {
    piece.material.uniforms.selected.value = 0.5;
    // Show "grab" cursor
    document.body.style.cursor = 'grab';
  }
};

const unhighlightPiece = (piece) => {
  if (piece && piece.material && piece.material.uniforms) {
    piece.material.uniforms.selected.value = 0;
    document.body.style.cursor = 'default';
  }
};

const showSnapGuide = (piece, nearestGuide) => {
  if (nearestGuide) {
    const snapLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        piece.position,
        nearestGuide.position
      ]),
      new THREE.LineBasicMaterial({ 
        color: 0x4a90e2,
        opacity: 0.5,
        transparent: true,
        dashSize: 3,
        gapSize: 1
      })
    );
    sceneRef.current.add(snapLine);
    return snapLine;
  }
  return null;
};

const showPlacementFeedback = (isCorrect, position) => {
  // Visual feedback
  const color = isCorrect ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);
  particleSystemRef.current.emit(position, isCorrect ? 30 : 10, color);

  // Sound feedback
  if (isCorrect) {
    new Audio('/sounds/correct-place.mp3').play();
  } else {
    new Audio('/sounds/wrong-place.mp3').play();
  }

  // Haptic feedback (if supported)
  if (navigator.vibrate) {
    navigator.vibrate(isCorrect ? [100] : [50, 50, 50]);
  }
};

const checkSphereSnap = (piece, snapDistance) => {
  const originalPos = piece.userData.originalPosition;
  const radius = 1;
  
  // Check if piece is at correct radius
  const currentRadius = piece.position.length();
  const radiusDiff = Math.abs(currentRadius - radius);
  
  // Check angular position
  const currentTheta = Math.atan2(piece.position.y, piece.position.x);
  const originalTheta = Math.atan2(originalPos.y, originalPos.x);
  const thetaDiff = Math.abs(currentTheta - originalTheta) % (Math.PI * 2);
  
  return radiusDiff < snapDistance && thetaDiff < snapDistance;
};

const checkPyramidSnap = (piece, snapDistance) => {
  const originalPos = piece.userData.originalPosition;
  const originalRot = piece.userData.originalRotation;
  const faceIndex = piece.userData.faceIndex;
  
  // Check position on face
  const positionDistance = piece.position.distanceTo(originalPos);
  
  // Check rotation alignment with face
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(originalRot);
  const currentNormal = new THREE.Vector3(0, 1, 0).applyEuler(piece.rotation);
  const normalDiff = normal.angleTo(currentNormal);
  
  return positionDistance < snapDistance && normalDiff < 0.1;
};

const checkCylinderSnap = (piece, snapDistance) => {
  const originalPos = piece.userData.originalPosition;
  const height = piece.position.y - originalPos.y;
  
  // Check radial position
  const radius = 0.5;
  const currentRadius = new THREE.Vector2(piece.position.x, piece.position.z).length();
  const radiusDiff = Math.abs(currentRadius - radius);
  
  // Check angular position
  const angle = Math.atan2(piece.position.z, piece.position.x);
  const originalAngle = Math.atan2(originalPos.z, originalPos.x);
  const angleDiff = Math.abs(angle - originalAngle) % (Math.PI * 2);
  
  return Math.abs(height) < snapDistance && 
         radiusDiff < snapDistance && 
         angleDiff < snapDistance;
};

const checkTowerSnap = (piece, snapDistance) => {
  const originalPos = piece.userData.originalPosition;
  const heightDiff = Math.abs(piece.position.y - originalPos.y);
  const horizontalDist = new THREE.Vector2(
    piece.position.x - originalPos.x,
    piece.position.z - originalPos.z
  ).length();
  
  // Check rotation in 90-degree increments
  const rotationDiff = Math.abs(piece.rotation.y % (Math.PI / 2));
  
  return heightDiff < snapDistance && 
         horizontalDist < snapDistance &&
         rotationDiff < 0.1;
};

const constrainPieceMovement = (piece, point, puzzleType) => {
  switch (puzzleType) {
    case 'classic':
      // Already implemented
      break;
      
    case 'cube':
      constrainToCubeFace(piece, point);
      break;
      
    case 'sphere':
      constrainToSphereSurface(piece, point);
      break;
      
    case 'pyramid':
      constrainToPyramidFace(piece, point);
      break;
      
    case 'cylinder':
      constrainToCylinderSurface(piece, point);
      break;
      
    case 'tower':
      constrainToTowerLevel(piece, point);
      break;
  }
};

const checkPuzzleCompletion = (puzzleType) => {
  switch (puzzleType) {
    case 'classic':
      return puzzlePiecesRef.current.every(piece => piece.userData.isPlaced);
      
    case 'cube':
      return puzzlePiecesRef.current.every(piece => 
        piece.userData.isPlaced && 
        checkCubeSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
      );
      
    case 'sphere':
      return puzzlePiecesRef.current.every(piece => 
        piece.userData.isPlaced && 
        checkSphereSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
      );
      
    case 'pyramid':
      return puzzlePiecesRef.current.every(piece => 
        piece.userData.isPlaced && 
        checkPyramidSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
      );
      
    case 'cylinder':
      return puzzlePiecesRef.current.every(piece => 
        piece.userData.isPlaced && 
        checkCylinderSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
      );
      
    case 'tower':
      return puzzlePiecesRef.current.every(piece => 
        piece.userData.isPlaced && 
        checkTowerSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
      );
  }
};

const safeThreeOperation = (operation, fallback = null) => {
  try {
    return operation();
  } catch (error) {
    console.error('Three.js operation failed:', error);
    toast.error('An error occurred in the 3D rendering');
    return fallback;
  }
};

// 7. Main Component
const MultiplayerManager = ({ gameId, isHost, user, image }) => {
  const navigate = useNavigate();
  
  // Refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const guideOutlinesRef = useRef([]);
  const lastPlacementTimeRef = useRef(Date.now());
  const comboCountRef = useRef(0);
  const timerRef = useRef(null);

  // State
  const [loading, setLoading] = useState(true);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [gameStats, setGameStats] = useState({
    moveCount: 0,
    accurateDrops: 0,
    startTime: Date.now(),
    points: 0,
    combos: 0
  });
  const [winner, setWinner] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [progress, setProgress] = useState(0); // Add progress state
  const [showTutorial, setShowTutorial] = useState(true);
  const [lastHoveredPiece, setLastHoveredPiece] = useState(null);
  const [currentSnapGuide, setCurrentSnapGuide] = useState(null);
  const [puzzleType, setPuzzleType] = useState('classic'); // Add puzzle type state
  const [activePanel, setActivePanel] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState(null); // Add state for mobile panels

  // Multiplayer hook
  const {
    players,
    gameState,
    error,
    updatePiecePosition,
    syncPieceState,
    updateGameState,
    timer,
    updateTimer,
    progress: syncedProgress, // Add synced progress
    updateProgress,
    difficulty,
    updateDifficulty,
  } = useMultiplayerGame(gameId);

  // Timer functions
  const startTimer = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const newTime = prev + 100;
          updateTimer(newTime); // Sync timer
          return newTime;
        });
      }, 100);
    }
  };

  const pauseTimer = () => {
    if (isPlaying) {
      setIsPlaying(false);
      clearInterval(timerRef.current);
    }
  };

  const resetGame = () => { // Change resetTimer to resetGame
    setIsPlaying(false);
    clearInterval(timerRef.current);
    setElapsedTime(0);
    updateTimer(0); // Sync timer reset
    setCompletedPieces(0);
    setProgress(0); // Reset progress
    setGameStats({
      moveCount: 0,
      accurateDrops: 0,
      startTime: Date.now(),
      points: 0,
      combos: 0
    });
    createPuzzlePieces(image); // Recreate puzzle pieces
  };

  // Format time utility
  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = String(milliseconds % 1000).padStart(3, '0').slice(0, 2);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Add progress celebration effects
const celebrateProgress = (progress) => {
  if (progress % 25 === 0) { // Celebrate at 25%, 50%, 75%, 100%
    const confettiParticles = [];
    for (let i = 0; i < 50; i++) {
      confettiParticles.push({
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.3,
          (Math.random() - 0.5) * 0.3
        ),
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.5)
      });
    }
    
    particleSystemRef.current.emitMultiple(confettiParticles);
    new Audio('/sounds/celebration.mp3').play();
    
    toast.success(`${progress}% Complete! Keep going! 🎉`);
  }
};

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !image) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Ensure the container has proper dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.innerHTML = ''; // Clear any existing content
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,
      0.4,
      0.85
    ));
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Create puzzle immediately after scene setup
    createPuzzlePieces(image);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = clockRef.current.getDelta();
      const time = clockRef.current.getElapsedTime();

      controls.update();
      particleSystemRef.current.update(deltaTime);

      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = time;
        }
      });

      // Update guide outlines
      guideOutlinesRef.current.forEach(guide => {
        if (guide.material.uniforms) {
          guide.material.uniforms.time.value = time;
        }
      });

      composer.render();
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight);
      if (composerRef.current) {
        composerRef.current.setSize(newWidth, newHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [image]);

  // Create placement guides
  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.3
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);

        outline.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        outline.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        outline.position.z = -0.01;

        // Add glow effect
        const glowGeometry = new THREE.PlaneGeometry(
          pieceSize.x * 1.0,
          pieceSize.y * 1.0
        );
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.1
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(outline.position);
        glow.position.z = -0.02;

        sceneRef.current.add(outline);
        sceneRef.current.add(glow);
        guideOutlinesRef.current.push(outline, glow);
      }
    }
  };

  // Add puzzle type configurations
  const PUZZLE_CONFIGS = {
    classic: {
      createGeometry: () => new THREE.PlaneGeometry(1, 1),
      setupCamera: (camera) => {
        camera.position.set(0, 0, 5);
        return { enableRotation: false };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const { grid } = settings;
        const pieceWidth = 1 / grid.x;
        const pieceHeight = 1 / grid.y;

        for (let y = 0; y < grid.y; y++) {
          for (let x = 0; x < grid.x; x++) {
            const geometry = new THREE.PlaneGeometry(pieceWidth * 0.95, pieceHeight * 0.95);
            const material = createPieceMaterial(texture, x, y, grid);
            const piece = new THREE.Mesh(geometry, material);

            piece.position.set(
              (x - grid.x / 2 + 0.5) * pieceWidth,
              (y - grid.y / 2 + 0.5) * pieceHeight,
              0
            );

            piece.userData = {
              id: `piece_${x}_${y}`,
              originalPosition: piece.position.clone(),
              gridPosition: { x, y },
              isPlaced: false
            };

            scene.add(piece);
            pieces.push(piece);
          }
        }
        return pieces;
      }
    },

    cube: {
      createGeometry: () => new THREE.BoxGeometry(1, 1, 1),
      setupCamera: (camera) => {
        camera.position.set(3, 3, 3);
        return { enableRotation: true };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const size = 1;
        const faces = [
          { dir: 'front', rot: [0, 0, 0], pos: [0, 0, size/2] },
          { dir: 'back', rot: [0, Math.PI, 0], pos: [0, 0, -size/2] },
          { dir: 'top', rot: [-Math.PI/2, 0, 0], pos: [0, size/2, 0] },
          { dir: 'bottom', rot: [Math.PI/2, 0, 0], pos: [0, -size/2, 0] },
          { dir: 'left', rot: [0, -Math.PI/2, 0], pos: [-size/2, 0, 0] },
          { dir: 'right', rot: [0, Math.PI/2, 0], pos: [size/2, 0, 0] }
        ];

        faces.forEach((face, faceIndex) => {
          const facePieces = createFacePieces(
            texture,
            settings,
            face,
            faceIndex,
            size
          );
          pieces.push(...facePieces);
        });

        pieces.forEach(piece => scene.add(piece));
        return pieces;
      }
    },

    sphere: {
      createGeometry: () => new THREE.SphereGeometry(1, 32, 32),
      setupCamera: (camera) => {
        camera.position.set(0, 0, 4);
        return { enableRotation: true };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const radius = 1;
        const { grid } = settings;

        for (let lat = 0; lat < grid.y; lat++) {
          for (let lon = 0; lat < grid.x; lon++) {
            const phi = (lat / grid.y) * Math.PI;
            const theta = (lon / grid.x) * 2 * Math.PI;

            const geometry = new THREE.SphereGeometry(
              radius,
              Math.ceil(32 / grid.x),
              Math.ceil(32 / grid.y),
              theta,
              2 * Math.PI / grid.x,
              phi,
              Math.PI / grid.y
            );

            const material = createPieceMaterial(texture, lon, lat, grid);
            const piece = new THREE.Mesh(geometry, material);

            // Position on sphere surface
            piece.position.setFromSphericalCoords(radius, phi, theta);

            piece.userData = {
              id: `sphere_${lat}_${lon}`,
              originalPosition: piece.position.clone(),
              originalRotation: piece.rotation.clone(),
              gridPosition: { lat, lon },
              isPlaced: false
            };

            scene.add(piece);
            pieces.push(piece);
          }
        }
        return pieces;
      }
    },

    pyramid: {
      createGeometry: () => new THREE.ConeGeometry(1, 1, 4),
      setupCamera: (camera) => {
        camera.position.set(2, 2, 2);
        return { enableRotation: true };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const height = 1;
        const baseSize = 1;
        
        // Create faces (4 triangular sides + base)
        for (let face = 0; face < 5; face++) {
          const facePieces = createPyramidFacePieces(
            texture,
            settings,
            face,
            height,
            baseSize
          );
          pieces.push(...facePieces);
        }

        pieces.forEach(piece => scene.add(piece));
        return pieces;
      }
    },

    cylinder: {
      createGeometry: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
      setupCamera: (camera) => {
        camera.position.set(3, 0, 3);
        return { enableRotation: true };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const radius = 0.5;
        const height = 1;
        const { grid } = settings;

        // Create curved surface pieces
        for (let h = 0; h < grid.y; h++) {
          for (let angle = 0; angle < grid.x; angle++) {
            const theta = (angle / grid.x) * Math.PI * 2;
            const heightSegment = (h / grid.y) * height - height/2;

            const geometry = new THREE.CylinderGeometry(
              radius,
              radius,
              height / grid.y,
              1,
              1,
              true,
              theta,
              Math.PI * 2 / grid.x
            );

            const material = createPieceMaterial(texture, angle, h, grid);
            const piece = new THREE.Mesh(geometry, material);

            piece.position.set(
              radius * Math.cos(theta),
              heightSegment,
              radius * Math.sin(theta)
            );

            piece.userData = {
              id: `cylinder_${h}_${angle}`,
              originalPosition: piece.position.clone(),
              originalRotation: piece.rotation.clone(),
              gridPosition: { h, angle },
              isPlaced: false
            };

            scene.add(piece);
            pieces.push(piece);
          }
        }

        // Add top and bottom caps if needed
        // ...

        return pieces;
      }
    },

    tower: {
      createGeometry: () => new THREE.BoxGeometry(1, 0.2, 1),
      setupCamera: (camera) => {
        camera.position.set(0, 2, 4);
        return { enableRotation: true };
      },
      createPieces: (texture, settings, scene) => {
        const pieces = [];
        const baseSize = 1;
        const heightPerLevel = 0.2;
        const levels = settings.grid.y;

        for (let level = 0; level < levels; level++) {
          const scale = 1 - (level / levels) * 0.3; // Gradually decrease size
          const geometry = new THREE.BoxGeometry(
            baseSize * scale,
            heightPerLevel,
            baseSize * scale
          );

          const material = createPieceMaterial(texture, 0, level, { x: 1, y: levels });
          const piece = new THREE.Mesh(geometry, material);

          piece.position.y = level * heightPerLevel;

          piece.userData = {
            id: `tower_${level}`,
            originalPosition: piece.position.clone(),
            originalRotation: piece.rotation.clone(),
            level,
            isPlaced: false
          };

          scene.add(piece);
          pieces.push(piece);
        }

        return pieces;
      }
    }
  };

  // Helper function to create piece material with proper texture mapping
const createPieceMaterial = (texture, x, y, grid) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      uvOffset: { value: new THREE.Vector2(x / grid.x, y / grid.y) },
      uvScale: { value: new THREE.Vector2(1 / grid.x, 1 / grid.y) },
      selected: { value: 0.0 },
      correctPosition: { value: 0.0 },
      time: { value: 0.0 }
    },
    vertexShader: puzzlePieceShader.vertexShader,
    fragmentShader: puzzlePieceShader.fragmentShader,
    side: THREE.DoubleSide
  });
};

// Add face piece creation helper
const createFacePieces = (texture, settings, face, faceIndex, size) => {
  const pieces = [];
  const { grid } = settings;
  const pieceWidth = size / grid.x;
  const pieceHeight = size / grid.y;

  for (let y = 0; y < grid.y; y++) {
    for (let x = 0; x < grid.x; x++) {
      const geometry = new THREE.PlaneGeometry(
        pieceWidth * 0.95,
        pieceHeight * 0.95
      );

      const material = createPieceMaterial(texture, x, y, grid);
      const piece = new THREE.Mesh(geometry, material);

      // Apply face rotation and position
      piece.rotation.setFromVector3(new THREE.Vector3(...face.rot));
      
      // Calculate local position on face
      const localX = (x - grid.x / 2 + 0.5) * pieceWidth;
      const localY = (y - grid.y / 2 + 0.5) * pieceHeight;
      
      // Transform local position to face position
      const position = new THREE.Vector3(localX, localY, 0);
      position.applyEuler(new THREE.Euler(...face.rot));
      position.add(new THREE.Vector3(...face.pos));
      
      piece.position.copy(position);

      piece.userData = {
        id: `face_${faceIndex}_${x}_${y}`,
        originalPosition: piece.position.clone(),
        originalRotation: piece.rotation.clone(),
        faceIndex,
        gridPosition: { x, y },
        isPlaced: false
      };

      pieces.push(piece);
    }
  }

  return pieces;
};

// Add pyramid face piece creation helper
const createPyramidFacePieces = (texture, settings, faceIndex, height, baseSize) => {
  const pieces = [];
  const { grid } = settings;

  // Different geometry for side faces vs base
  if (faceIndex < 4) {
    // Side face (triangular)
    const angle = (faceIndex / 4) * Math.PI * 2;
    for (let i = 0; i < grid.y; i++) {
      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, height * (1 - i/grid.y), 0,
        -baseSize/2 * Math.cos(angle), 0, -baseSize/2 * Math.sin(angle),
        baseSize/2 * Math.cos(angle), 0, baseSize/2 * Math.sin(angle)
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

      const material = createPieceMaterial(texture, 0, i, { x: 1, y: grid.y });
      const piece = new THREE.Mesh(geometry, material);

      piece.userData = {
        id: `pyramid_side_${faceIndex}_${i}`,
        originalPosition: piece.position.clone(),
        originalRotation: piece.rotation.clone(),
        faceIndex,
        level: i,
        isPlaced: false
      };

      pieces.push(piece);
    }
  } else {
    // Base (square)
    for (let y = 0; y < grid.y; y++) {
      for (let x = 0; y < grid.x; x++) {
        const geometry = new THREE.PlaneGeometry(
          baseSize/grid.x * 0.95,
          baseSize/grid.y * 0.95
        );

        const material = createPieceMaterial(texture, x, y, grid);
        const piece = new THREE.Mesh(geometry, material);

        piece.rotation.x = Math.PI/2;
        piece.position.set(
          (x - grid.x/2 + 0.5) * baseSize/grid.x,
          0,
          (y - grid.y/2 + 0.5) * baseSize/grid.y
        );

        piece.userData = {
          id: `pyramid_base_${x}_${y}`,
          originalPosition: piece.position.clone(),
          originalRotation: piece.rotation.clone(),
          faceIndex,
          gridPosition: { x, y },
          isPlaced: false
        };

        pieces.push(piece);
      }
    }
  }

  return pieces;
};

// Modify createPuzzlePieces function to use the new configuration
const createPuzzlePieces = async (imageUrl) => {
  if (!sceneRef.current) return;

  // Clear existing pieces
  cleanupPuzzlePieces();

  try {
    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const config = PUZZLE_CONFIGS[puzzleType];

    // Setup camera for puzzle type
    const cameraSettings = config.setupCamera(cameraRef.current);
    if (controlsRef.current) {
      controlsRef.current.enableRotate = cameraSettings.enableRotation;
    }

    // Create pieces using type-specific creation function
    const pieces = config.createPieces(texture, settings, sceneRef.current);
    puzzlePiecesRef.current = pieces;

    // Set total pieces
    setTotalPieces(pieces.length);

    // Scramble pieces
    scramblePieces(puzzleType);

    setLoading(false);
  } catch (error) {
    console.error('Error creating puzzle pieces:', error);
    toast.error('Failed to create puzzle pieces');
    setLoading(false);
  }
};

  // Initialize puzzle when image or difficulty is received
  useEffect(() => {
    if (image) {
      createPuzzlePieces(image);
    }
  }, [image, difficulty]);

  // Initialize game in easy mode
  useEffect(() => {
    updateDifficulty('easy');
  }, []);

  // Handle game completion
  const handleGameCompletion = async () => {
    const endTime = Date.now();
    const completionTime = endTime - gameStats.startTime;
    const accuracy = (gameStats.accurateDrops / gameStats.moveCount) * 100;
    
    // Calculate final score with bonuses
    const timeBonus = Math.max(0, 1000 - Math.floor(completionTime / 1000)) * 2;
    const accuracyBonus = Math.floor(accuracy) * 10;
    const finalPoints = gameStats.points + POINTS.COMPLETION_BONUS + timeBonus + accuracyBonus;

    const finalScore = {
      userId: user.uid,
      userName: user.displayName || user.email,
      completionTime,
      moveCount: gameStats.moveCount,
      accurateDrops: gameStats.accurateDrops,
      accuracy,
      points: finalPoints,
      timestamp: endTime
    };

    setWinner(finalScore);

    const completionData = {
      puzzleId: `custom_${Date.now()}`,
      userId: user.uid,
      playerName: user.displayName || user.email,
      startTime: gameStats.startTime,
      difficulty,
      imageUrl: image,
      timer: completionTime,
    };

    console.log(completionData);

    // Update game state for all players
    await updateGameState({
      status: 'completed',
      winner: finalScore,
      endedAt: endTime
    });

    // Update leaderboard
    setLeaderboard(prev => [...prev, finalScore].sort((a, b) => b.accurateDrops - a.accurateDrops));

    // Show completion message
    toast.success('Puzzle completed! 🎉');

    // Sync progress
    updateProgress(100);
  };

  // Handle piece movement
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let moveStartTime = null;

    const onMouseDown = (event) => {
      if (!isPlaying) return; // Prevent moving pieces when game is not started

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        const piece = intersects[0].object;
        if (!piece.userData.isPlaced) {
          selectedPieceRef.current = piece;
          isDragging = true;
          moveStartTime = Date.now();
          controlsRef.current.enabled = false;
          piece.material.uniforms.selected.value = 1.0;

          // Highlight corresponding guide
          const guide = guideOutlinesRef.current.find(g => 
            g.position.x === piece.userData.originalPosition.x &&
            g.position.y === piece.userData.originalPosition.y
          );
          if (guide.material) {
            guide.material.opacity = 0.6;
          }

          setGameStats(prev => ({
            ...prev,
            moveCount: prev.moveCount + 1
          }));
        }
      }
    };

    const onMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1)),
        intersectPoint
      );

      selectedPieceRef.current.position.copy(intersectPoint);
      
      // Sync piece position
      updatePiecePosition(selectedPieceRef.current.userData.id, {
        x: intersectPoint.x,
        y: intersectPoint.y,
        z: intersectPoint.z,
        rotation: selectedPieceRef.current.rotation.z
      });

      // Add hover effects
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);
      
      if (intersects.length > 0) {
        const hoveredPiece = intersects[0].object;
        if (hoveredPiece !== lastHoveredPiece) {
          unhighlightPiece(lastHoveredPiece);
          highlightPiece(hoveredPiece);
          setLastHoveredPiece(hoveredPiece);
        }
      } else {
        unhighlightPiece(lastHoveredPiece);
        setLastHoveredPiece(null);
      }
    };

    const onMouseUp = () => {
      if (!selectedPieceRef.current) return;

      const piece = selectedPieceRef.current;
      const originalPos = piece.userData.originalPosition;
      const distance = originalPos.distanceTo(piece.position);
      const moveTime = Date.now() - moveStartTime;

      if (distance < DIFFICULTY_SETTINGS[difficulty].snapDistance && !piece.userData.isPlaced) {
        // Correct placement
        piece.position.copy(originalPos);
        piece.rotation.z = 0;
        piece.userData.isPlaced = true;
        piece.material.uniforms.correctPosition.value = 1.0;

        // Calculate points
        let pointsEarned = POINTS.ACCURATE_PLACEMENT;
        if (moveTime < 5000) pointsEarned += POINTS.QUICK_PLACEMENT;
        
        // Handle combos
        const timeSinceLastPlacement = Date.now() - lastPlacementTimeRef.current;
        if (timeSinceLastPlacement < 3000) {
          comboCountRef.current++;
          pointsEarned += POINTS.COMBO * comboCountRef.current;
        } else {
          comboCountRef.current = 0;
        }
        lastPlacementTimeRef.current = Date.now();

        // Update stats
        setGameStats(prev => ({
          ...prev,
          accurateDrops: prev.accurateDrops + 1,
          points: prev.points + pointsEarned,
          combos: Math.max(prev.combos, comboCountRef.current)
        }));
        
        // Update completion progress
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          const newProgress = (newCount / totalPieces) * 100;
          setProgress(newProgress); // Update local progress
          updateProgress(newProgress); // Sync progress

          // Check for game completion
          if (newProgress === 100) {
            handleGameCompletion();
          }
          return newCount;
        });

        // Visual feedback
        const color = new THREE.Color(0x00ff00);
        particleSystemRef.current.emit(piece.position, 30, color);

        // Play sound if available
        if (window.gameSounds?.correct) {
          window.gameSounds.correct.play();
        }

        // Sync final piece position
        updatePiecePosition(piece.userData.id, {
          x: originalPos.x,
          y: originalPos.y,
          z: originalPos.z,
          rotation: 0,
          isPlaced: true
        });
      } else {
        // Incorrect placement
        comboCountRef.current = 0;
        
        // Visual feedback
        const color = new THREE.Color(0xff0000);
        particleSystemRef.current.emit(piece.position, 10, color);
      }

      // Reset piece and controls state
      piece.material.uniforms.selected.value = 0.0;
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;

      // Reset guide highlights
      guideOutlinesRef.current.forEach(guide => {
        if (guide.material) {
          guide.material.opacity = 0.3;
        }
      });
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mouseleave', onMouseUp);

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('mouseleave', onMouseUp);
    };
  }, [updatePiecePosition, totalPieces, isPlaying, progress]);

  // Sync piece positions from other players
  useEffect(() => {
    if (!gameState?.pieces || !puzzlePiecesRef.current.length) return;

    Object.entries(gameState.pieces).forEach(([pieceId, pieceData]) => {
      const piece = puzzlePiecesRef.current.find(p => p.userData.id === pieceId);
      if (piece && pieceData.lastUpdatedBy !== user.uid) {
        piece.position.set(pieceData.x, pieceData.y, pieceData.z);
        if (pieceData.rotation !== undefined) {
          piece.rotation.z = pieceData.rotation;
        }
        piece.userData.isPlaced = pieceData.isPlaced;
        if (piece.material.uniforms) {
          piece.material.uniforms.correctPosition.value = pieceData.isPlaced ? 1.0 : 0.0;
        }
      }
    });

    // Update local progress based on synced progress
    setProgress(syncedProgress);
  }, [gameState?.pieces, syncedProgress, user.uid]);

  // Camera controls
  const handleZoomIn = () => {
    if (cameraRef.current) {
      const newZ = Math.max(cameraRef.current.position.z - 1, 2);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      const newZ = Math.min(cameraRef.current.position.z + 1, 10);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // Handle difficulty change
  const handleDifficultyChange = (newDifficulty) => {
    updateDifficulty(newDifficulty);
  };
    setProgress(syncedProgress);
  }, [gameState?.pieces, syncedProgress, user.uid]);

  // Camera controls
  const handleZoomIn = () => {
    if (cameraRef.current) {
      const newZ = Math.max(cameraRef.current.position.z - 1, 2);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      const newZ = Math.min(cameraRef.current.position.z + 1, 10);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // Handle difficulty change
  const handleDifficultyChange = (newDifficulty) => {
    updateDifficulty(newDifficulty);
  };

  // Handle puzzle type change
  const handlePuzzleTypeChange = (type) => {
    setPuzzleType(type);
    // Reset and recreate puzzle with new type
    resetGame();
    createPuzzlePieces(image, type);
  };

  // Panel toggle handlers
  const togglePanel = (panelName) => {
    setActivePanel(activePanel === panelName ? null : panelName);
  };

  // Handle errors
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <h2 className="text-xl font-bold mb-4">Error</h2>
          <p className="mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Add celebratory effects to progress updates
  useEffect(() => {
    celebrateProgress(progress);
  }, [progress]);

  // Modify the existing floating panels to be hidden on mobile
  const floatingPanelClasses = "hidden md:block absolute";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Header with glass effect */}
      <div className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700 p-3 md:p-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stats Panel */}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full text-white">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">{Object.keys(players).length} Players</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full text-white">
              <Clock className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">{formatTime(timer)}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full text-white">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium">{gameStats.points} pts</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-gray-800/50 rounded-full h-2.5 mb-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-300">Progress: {Math.round(progress)}%</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center md:justify-end gap-2">
            {isHost && (
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden bg-gray-800/50">
                  <button
                    onClick={startTimer}
                    disabled={isPlaying}
                    className="p-2 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Play className="w-5 h-5 text-blue-400" />
                  </button>
                  <button
                    onClick={pauseTimer}
                    disabled={!isPlaying}
                    className="p-2 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Pause className="w-5 h-5 text-yellow-400" />
                  </button>
                  <button
                    onClick={resetGame}
                    className="p-2 hover:bg-red-500/20 transition-colors"
                  >
                    <RotateCcw className="w-5 h-5 text-red-400" />
                  </button>
                </div>
              </div>
            )}

            {/* View Controls */}
            <div className="flex rounded-lg overflow-hidden bg-gray-800/50">
              <button
                onClick={() => setShowThumbnail(!showThumbnail)}
                className="p-2 hover:bg-purple-500/20 transition-colors"
                title="Toggle Reference Image"
              >
                <Image className="w-5 h-5 text-purple-400" />
              </button>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-green-500/20 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-5 h-5 text-green-400" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-green-500/20 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-5 h-5 text-green-400" />
              </button>

              <button
                onClick={handleResetView}
                className="p-2 hover:bg-green-500/20 transition-colors"
                title="Reset View"
              >
                <Maximize2 className="w-5 h-5 text-green-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 relative">
      {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-xl">Loading puzzle...</div>
          </div>
        )}
        <div 
          ref={containerRef} 
          className="w-full h-[calc(100vh-64px)]" // Explicit height calculation
          style={{ touchAction: 'none' }} // Prevent touch scrolling on mobile
        />
        

        {/* Modify floating panels to be hidden on mobile */}
        <div className={`${floatingPanelClasses} left-4 top-20`}>
          <StatsPanel stats={{
            moveCount: gameStats.moveCount,
            accurateDrops: gameStats.accurateDrops,
            points: gameStats.points,
            combos: gameStats.combos,
            totalPieces
          }} />
        </div>

        <div className={`${floatingPanelClasses} right-4 top-20`}>
          <DifficultyMenu
            current={difficulty}
            onChange={handleDifficultyChange}
            isHost={isHost}
          />
        </div>

        {isHost && (
          <div className={`${floatingPanelClasses} bottom-20 right-4`}>
            {/* Puzzle Type Selection */}
            <div className="absolute bottom-20 right-4 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700">
              <div className="p-3 border-b border-gray-700">
                <h3 className="text-sm font-semibold text-white">Puzzle Type</h3>
              </div>
              <div className="p-2 space-y-1">
                {['classic', 'cube', 'sphere', 'pyramid', 'cylinder', 'tower'].map(type => (
                  <button
                    key={type}
                    onClick={() => handlePuzzleTypeChange(type)}
                    className={`w-full p-2 rounded-md text-left capitalize ${
                      puzzleType === type 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'text-gray-300 hover:bg-gray-700/50'
                    } transition-colors`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Menu Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 z-40">
          <div className="grid grid-cols-5 gap-1 p-2">
            {/* <button
              onClick={() => setActiveMobilePanel('stats')}
              className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
            >
              <Trophy className="w-5 h-5" />
              <span className="text-xs mt-1">Stats</span>
            </button> */}
            <button
              onClick={() => setActiveMobilePanel('players')}
              className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
            >
              <Users className="w-5 h-5" />
              <span className="text-xs mt-1">Players</span>
            </button>
            <button
              onClick={() => setActiveMobilePanel('leaderboard')}
              className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
            >
              <Trophy className="w-5 h-5" />
              <span className="text-xs mt-1">Leaders</span>
            </button>
            <button
              onClick={() => setActiveMobilePanel('difficulty')}
              className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
            >
              <Settings className="w-5 h-5" />
              <span className="text-xs mt-1">Difficulty</span>
            </button>
            {isHost && (
              <button
                onClick={() => setActiveMobilePanel('puzzleType')}
                className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
              >
                <Image className="w-5 h-5" />
                <span className="text-xs mt-1">Type</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Panels */}
        <MobilePanel
          isOpen={activeMobilePanel === 'stats'}
          onClose={() => setActiveMobilePanel(null)}
          title="Game Stats"
          icon={Trophy}
        >
          <StatsPanel stats={{
            moveCount: gameStats.moveCount,
            accurateDrops: gameStats.accurateDrops,
            points: gameStats.points,
            combos: gameStats.combos,
            totalPieces
          }} />
        </MobilePanel>

        <MobilePanel
          isOpen={activeMobilePanel === 'players'}
          onClose={() => setActiveMobilePanel(null)}
          title="Active Players"
          icon={Users}
        >
          {Object.values(players).map(player => (
            <div key={player.id} className="flex items-center gap-2 p-3 border-b border-gray-700">
              <div className={`w-2 h-2 rounded-full ${
                player.isOnline ? 'bg-green-400' : 'bg-gray-400'
              }`} />
              <span className="text-white">{player.name}</span>
              {player.isHost && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 ml-auto">
                  Host
                </span>
              )}
            </div>
          ))}
        </MobilePanel>

        <MobilePanel
          isOpen={activeMobilePanel === 'leaderboard'}
          onClose={() => setActiveMobilePanel(null)}
          title="Leaderboard"
          icon={Trophy}
        >
          {leaderboard.map((score, index) => (
            <div key={index} className="flex items-center justify-between p-3 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-yellow-400">#{index + 1}</span>
                <div>
                  <div className="text-white">{score.userName}</div>
                  <div className="text-sm text-gray-400">{score.points} points</div>
                </div>
              </div>
            </div>
          ))}
        </MobilePanel>

        <MobilePanel
          isOpen={activeMobilePanel === 'difficulty'}
          onClose={() => setActiveMobilePanel(null)}
          title="Difficulty Settings"
          icon={Settings}
        >
          <div className="space-y-2">
            {['easy', 'medium', 'hard', 'expert'].map((diff) => (
              <button
                key={diff}
                onClick={() => {
                  handleDifficultyChange(diff);
                  setActiveMobilePanel(null);
                }}
                disabled={!isHost}
                className={`w-full p-4 rounded-lg flex items-center justify-between ${
                  difficulty === diff 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'text-white hover:bg-gray-700/50'
                } transition-colors disabled:opacity-50`}
              >
                <span className="text-lg capitalize">{diff}</span>
                {difficulty === diff && <Check className="w-6 h-6" />}
              </button>
            ))}
          </div>
        </MobilePanel>

        {isHost && (
          <MobilePanel
            isOpen={activeMobilePanel === 'puzzleType'}
            onClose={() => setActiveMobilePanel(null)}
            title="Puzzle Type"
            icon={Image}
          >
            <div className="space-y-2">
              {['classic', 'cube', 'sphere', 'pyramid', 'cylinder', 'tower'].map(type => (
                <button
                  key={type}
                  onClick={() => {
                    handlePuzzleTypeChange(type);
                    setActiveMobilePanel(null);
                  }}
                  className={`w-full p-4 rounded-lg flex items-center justify-between ${
                    puzzleType === type 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'text-white hover:bg-gray-700/50'
                  } transition-colors`}
                >
                  <span className="text-lg capitalize">{type}</span>
                  {puzzleType === type && <Check className="w-6 h-6" />}
                </button>
              ))}
            </div>
          </MobilePanel>
        )}

        {/* Floating Help Button */}
        <button
          onClick={() => setShowTutorial(true)}
          className="absolute bottom-12 right-4 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          title="Show Help"
        >
          <Info className="w-6 h-6" />
        </button>

        {/* Points Animation */}
        {gameStats.combos > 1 && (
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="animate-bounce-fade-out text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              +{POINTS.COMBO * gameStats.combos}
            </div>
          </div>
        )}

        {/* Mobile Menu Button */}
        {/* <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden fixed bottom-4 left-4 p-3 bg-gray-800/90 text-white rounded-full shadow-lg z-40"
        >
          <Menu className="w-6 h-6" />
        </button> */}

        {/* Mobile Menu */}
        {/* <div className={`
          md:hidden fixed inset-x-0 bottom-0 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 
          transition-transform duration-300 ease-in-out z-30
          ${isMobileMenuOpen ? 'translate-y-0' : 'translate-y-full'}
        `}>
          <div className="p-4 grid grid-cols-3 gap-2">
            <MobileMenuButton
              icon={Users}
              label="Players"
              onClick={() => togglePanel('players')}
              isActive={activePanel === 'players'}
            />
            <MobileMenuButton
              icon={Trophy}
              label="Leaderboard"
              onClick={() => togglePanel('leaderboard')}
              isActive={activePanel === 'leaderboard'}
            />
            <MobileMenuButton
              icon={Info}
              label="Help"
              onClick={() => setShowTutorial(true)}
              isActive={false}
            />
          </div>
        </div> */}

        {/* Floating Panels */}
        <FloatingPanel
          title="Active Players"
          icon={Users}
          isOpen={activePanel === 'players' || (!isMobileMenuOpen && window.innerWidth >= 768)}
          onClose={() => togglePanel('players')}
          position="left"
        >
          {Object.values(players).map(player => (
            <div
              key={player.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-700/50"
            >
              <div className={`w-2 h-2 rounded-full ${
                player.isOnline ? 'bg-green-400' : 'bg-gray-400'
              }`} />
              <span className="text-sm text-gray-200 truncate">{player.name}</span>
              {player.isHost && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  Host
                </span>
              )}
            </div>
          ))}
        </FloatingPanel>

        <FloatingPanel
          title="Leaderboard"
          icon={Trophy}
          isOpen={activePanel === 'leaderboard' || (!isMobileMenuOpen && window.innerWidth >= 768)}
          onClose={() => togglePanel('leaderboard')}
          position="right"
        >
          {leaderboard.slice(0, 5).map((score, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-yellow-400">#{index + 1}</span>
                <span className="text-sm text-gray-200 truncate">{score.userName}</span>
              </div>
              <span className="text-sm font-medium text-blue-400">{score.points}</span>
            </div>
          ))}
        </FloatingPanel>

      </div>

      {/* Keep existing modals with improved styling */}
      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
      {/* ...existing winner announcement modal... */}
    </div>
  );
};

// Add new animation utility class
const style = document.createElement('style');
style.textContent = `
  @keyframes bounce-fade-out {
    0% { transform: scale(0.5); opacity: 0; }
    50% { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(1); opacity: 0; }
  }
  .animate-bounce-fade-out {
    animation: bounce-fade-out 1s ease-out forwards;
  }
`;
document.head.appendChild(style);

// 8. Export
export default MultiplayerManager;

// Add remaining snap checking functions
// const checkSphereSnap = (piece, snapDistance) => {
//   const originalPos = piece.userData.originalPosition;
//   const radius = 1;
  
//   // Check if piece is at correct radius
//   const currentRadius = piece.position.length();
//   const radiusDiff = Math.abs(currentRadius - radius);
  
//   // Check angular position
//   const currentTheta = Math.atan2(piece.position.y, piece.position.x);
//   const originalTheta = Math.atan2(originalPos.y, originalPos.x);
//   const thetaDiff = Math.abs(currentTheta - originalTheta) % (Math.PI * 2);
  
//   return radiusDiff < snapDistance && thetaDiff < snapDistance;
// };

// const checkPyramidSnap = (piece, snapDistance) => {
//   const originalPos = piece.userData.originalPosition;
//   const originalRot = piece.userData.originalRotation;
//   const faceIndex = piece.userData.faceIndex;
  
//   // Check position on face
//   const positionDistance = piece.position.distanceTo(originalPos);
  
//   // Check rotation alignment with face
//   const normal = new THREE.Vector3(0, 1, 0).applyEuler(originalRot);
//   const currentNormal = new THREE.Vector3(0, 1, 0).applyEuler(piece.rotation);
//   const normalDiff = normal.angleTo(currentNormal);
  
//   return positionDistance < snapDistance && normalDiff < 0.1;
// };

// const checkCylinderSnap = (piece, snapDistance) => {
//   const originalPos = piece.userData.originalPosition;
//   const height = piece.position.y - originalPos.y;
  
//   // Check radial position
//   const radius = 0.5;
//   const currentRadius = new THREE.Vector2(piece.position.x, piece.position.z).length();
//   const radiusDiff = Math.abs(currentRadius - radius);
  
//   // Check angular position
//   const angle = Math.atan2(piece.position.z, piece.position.x);
//   const originalAngle = Math.atan2(originalPos.z, originalPos.x);
//   const angleDiff = Math.abs(angle - originalAngle) % (Math.PI * 2);
  
//   return Math.abs(height) < snapDistance && 
//          radiusDiff < snapDistance && 
//          angleDiff < snapDistance;
// };

// const checkTowerSnap = (piece, snapDistance) => {
//   const originalPos = piece.userData.originalPosition;
//   const heightDiff = Math.abs(piece.position.y - originalPos.y);
//   const horizontalDist = new THREE.Vector2(
//     piece.position.x - originalPos.x,
//     piece.position.z - originalPos.z
//   ).length();
  
//   // Check rotation in 90-degree increments
//   const rotationDiff = Math.abs(piece.rotation.y % (Math.PI / 2));
  
//   return heightDiff < snapDistance && 
//          horizontalDist < snapDistance &&
//          rotationDiff < 0.1;
// };

// Add missing constraint functions for piece movement
// const constrainPieceMovement = (piece, point, puzzleType) => {
//   switch (puzzleType) {
//     case 'classic':
//       // Already implemented
//       break;
      
//     case 'cube':
//       constrainToCubeFace(piece, point);
//       break;
      
//     case 'sphere':
//       constrainToSphereSurface(piece, point);
//       break;
      
//     case 'pyramid':
//       constrainToPyramidFace(piece, point);
//       break;
      
//     case 'cylinder':
//       constrainToCylinderSurface(piece, point);
//       break;
      
//     case 'tower':
//       constrainToTowerLevel(piece, point);
//       break;
//   }
// };

// Add puzzle-specific completion checks
// const checkPuzzleCompletion = (puzzleType) => {
//   switch (puzzleType) {
//     case 'classic':
//       return puzzlePiecesRef.current.every(piece => piece.userData.isPlaced);
      
//     case 'cube':
//       return puzzlePiecesRef.current.every(piece => 
//         piece.userData.isPlaced && 
//         checkCubeSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
//       );
      
//     case 'sphere':
//       return puzzlePiecesRef.current.every(piece => 
//         piece.userData.isPlaced && 
//         checkSphereSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
//       );
      
//     case 'pyramid':
//       return puzzlePiecesRef.current.every(piece => 
//         piece.userData.isPlaced && 
//         checkPyramidSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
//       );
      
//     case 'cylinder':
//       return puzzlePiecesRef.current.every(piece => 
//         piece.userData.isPlaced && 
//         checkCylinderSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
//       );
      
//     case 'tower':
//       return puzzlePiecesRef.current.every(piece => 
//         piece.userData.isPlaced && 
//         checkTowerSnap(piece, DIFFICULTY_SETTINGS[difficulty].snapDistance)
//       );
//   }
// };

// Add error boundaries for Three.js operations
// const safeThreeOperation = (operation, fallback = null) => {
//   try {
//     return operation();
//   } catch (error) {
//     console.error('Three.js operation failed:', error);
//     toast.error('An error occurred in the 3D rendering');
//     return fallback;
//   }
// };

// Add cleanup function for puzzle pieces
const cleanupPuzzlePieces = () => {
  puzzlePiecesRef.current.forEach(piece => {
    if (piece.geometry) piece.geometry.dispose();
    if (piece.material) piece.material.dispose();
    if (piece.texture) piece.texture.dispose();
    if (piece.parent) piece.parent.remove(piece);
  });
  puzzlePiecesRef.current = [];
};

// Add puzzle type specific camera presets
// const CAMERA_PRESETS = {
//   // ...existing presets...
  
//   sphere: {
//     position: new THREE.Vector3(0, 0, 4),
//     target: new THREE.Vector3(0, 0, 0),
//     controls: {
//       maxDistance: 6,
//       minDistance: 2,
//       enablePan: false,
//       maxPolarAngle: Math.PI * 0.85,
//       minPolarAngle: Math.PI * 0.15
//     }
//   },
  
//   pyramid: {
//     position: new THREE.Vector3(2, 2, 2),
//     target: new THREE.Vector3(0, 0, 0),
//     controls: {
//       maxDistance: 6,
//       minDistance: 2,
//       maxPolarAngle: Math.PI * 0.75
//     }
//   }
// };

// Add puzzle-specific guide creation
const createGuides = (puzzleType) => {
  // Clear existing guides
  guideOutlinesRef.current.forEach(guide => {
    if (guide.parent) guide.parent.remove(guide);
    if (guide.geometry) guide.geometry.dispose();
    if (guide.material) guide.material.dispose();
  });
  guideOutlinesRef.current = [];

  // Create new guides based on puzzle type
  safeThreeOperation(() => {
    switch (puzzleType) {
      case 'classic':
        createClassicGuides();
        break;
      case 'cube':
        createCubeGuides();
        break;
      case 'sphere':
        createSphereGuides();
        break;
      case 'pyramid':
        createPyramidGuides();
        break;
      case 'cylinder':
        createCylinderGuides();
        break;
      case 'tower':
        createTowerGuides();
        break;
    }
  });
};

// Add cleanup on component unmount
useEffect(() => {
  return () => {
    // Cleanup Three.js resources
    cleanupPuzzlePieces();
    if (rendererRef.current) rendererRef.current.dispose();
    if (composerRef.current) composerRef.current.dispose();
    
    // Cleanup event listeners
    window.removeEventListener('resize', handleResize);
    
    // Clear any running animations
    if (timerRef.current) clearInterval(timerRef.current);
  };
}, []);