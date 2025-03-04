// 1. Imports
import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, 
         Pause, Trophy, Users, Mouse, ZapIcon, Menu, X, Settings, LayoutTemplate, Square, Maximize } from 'lucide-react';
import { toast } from 'react-hot-toast';

// 2. Constants - 1
const POINTS = {
  ACCURATE_PLACEMENT: 100,
  QUICK_PLACEMENT: 50,
  COMBO: 25,
  COMPLETION_BONUS: 1000
};

const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

const PUZZLE_TYPES = {
  classic: {
    name: 'Classic',
    cameraPosition: new THREE.Vector3(0, 0, 5),
    description: 'Standard rectangle format (4:3)',
    settings: {
      aspectRatio: 4/3,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 3.5
    }
  },
  vertical: {
    name: 'Vertical',
    cameraPosition: new THREE.Vector3(0, 0, 6),
    description: 'Tall rectangular format (2:3)',
    settings: {
      aspectRatio: 2/3,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 4
    }
  },
  panoramic: {
    name: 'Panoramic',
    cameraPosition: new THREE.Vector3(0, 0, 7),
    description: 'Wide rectangular format (16:9)',
    settings: {
      aspectRatio: 16/9,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 5
    }
  },
  square: {
    name: 'Square',
    cameraPosition: new THREE.Vector3(0, 0, 5),
    description: 'Perfect square format (1:1)',
    settings: {
      aspectRatio: 1,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 3.5
    }
  },
  portrait: {
    name: 'Portrait',
    cameraPosition: new THREE.Vector3(0, 0, 7),
    description: 'Very tall format (3:5)',
    settings: {
      aspectRatio: 3/5,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 4.5
    }
  },
  landscape: {
    name: 'Landscape',
    cameraPosition: new THREE.Vector3(0, 0, 7),
    description: 'Very wide format (21:9)',
    settings: {
      aspectRatio: 21/9,
      snapThreshold: 0.25,
      rotationEnabled: false,
      baseSize: 5.5
    }
  }
};

const CONTAINER_LAYOUT = {
  left: {
    position: { x: -5, y: 0 },
    dimensions: { width: 3, height: 5 },
    color: 0x2a2a2a
  },
  right: {
    position: { x: 5, y: 0 },
    dimensions: { width: 3, height: 5 },
    color: 0x2a2a2a
  }
};

const GRID_STYLE = {
  primaryColor: 0x4a90e2,
  secondaryColor: 0x2c5282,
  lineWidth: 2,
  opacity: 0.6,
  glowStrength: 0.5
};

// 3. Shaders
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    uniform float depth;
    uniform sampler2D heightMap;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      
      // Sample height map for displacement
      vec4 heightValue = texture2D(heightMap, vUv);
      float displacement = (heightValue.r + heightValue.g + heightValue.b) / 3.0;
      
      // Create bas relief effect by moving vertices along their normals
      vec3 newPosition = position + normal * displacement * depth;
      
      vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      vViewPosition = -mvPosition.xyz;
      vNormal = normalMatrix * normal;
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      
      // Enhanced lighting calculation for bas relief
      vec3 viewDir = normalize(vViewPosition);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      
      // Ambient light
      float ambient = 0.3;
      
      // Diffuse lighting
      float diff = max(dot(normal, lightDir), 0.0);
      float diffuse = diff * 0.7;
      
      // Specular lighting for metallic effect
      vec3 reflectDir = reflect(-lightDir, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
      float specular = spec * 0.3;
      
      // Combine lighting components
      vec3 lighting = vec3(ambient + diffuse + specular);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * lighting;
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// 4. Utility Classes
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
    particles.forEach(particle => {
      this.particles.push({
        position: particle.position.clone(),
        velocity: particle.velocity.clone(),
        color: particle.color.clone(),
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
      particle.velocity.y += deltaTime * 0.2;
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
    
    this.particleSystem.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleSystem.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particleSystem.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  }
}

// Add setupCamera function after constants
const setupCamera = (puzzleType) => {
  if (!cameraRef.current || !controlsRef.current) return;
  
  const settings = PUZZLE_TYPES[puzzleType];
  if (!settings) return;

  cameraRef.current.position.copy(settings.cameraPosition);
  controlsRef.current.target.set(0, 0, 0);
  controlsRef.current.update();
};

// 5. Component Functions
const DifficultyMenu = ({ current, onChange, isHost }) => (
  <div className="absolute top-20 right-4 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 w-48">
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

const TutorialOverlay = ({ onClose }) => (
  <div className="absolute inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
    <div className="bg-gray-800 p-6 rounded-lg max-w-lg text-white">
      <h3 className="text-xl font-bold mb-4">How to Play</h3>
      <ul className="space-y-3 mb-6">
        <li className="flex items-center gap-2">
          <Mouse className="text-blue-400" /> Drag and drop pieces to solve the puzzle
        </li>
        <li className="flex items-center gap-2">
          <ZoomIn className="text-blue-400" /> Use mouse wheel or buttons to zoom
        </li>
        <li className="flex items-center gap-2">
          <Image className="text-blue-400" /> Toggle reference image for help
        </li>
        <li className="flex items-center gap-2">
          <Trophy className="text-blue-400" /> Earn bonus points for quick & accurate placements
        </li>
      </ul>
      <button 
        onClick={onClose}
        className="w-full py-2 bg-blue-500 rounded hover:bg-blue-600"
      >
        Got it!
      </button>
    </div>
  </div>
);

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

const PuzzleTypeSelector = ({ onSelect, currentType, onClose }) => (
  <div className="space-y-2 p-4">
    {Object.entries(PUZZLE_TYPES).map(([type, config]) => (
      <button
        key={type}
        onClick={() => onSelect(type)}
        className={`w-full p-4 rounded-lg ${
          currentType === type 
            ? 'bg-blue-500/20 text-blue-400' 
            : 'text-gray-300 hover:bg-gray-700/50'
        } transition-colors`}
      >
        <div className="flex flex-col items-start gap-1">
          <span className="text-lg font-medium">{config.name}</span>
          <span className="text-sm text-gray-400">{config.description}</span>
        </div>
      </button>
    ))}
  </div>
);

// 6. Main Component
const MultiplayerManager = ({ gameId, isHost, user, image }) => {
  // State declarations
  const navigate = useNavigate();
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
  // const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);
  const [lastHoveredPiece, setLastHoveredPiece] = useState(null);
  const [currentSnapGuide, setCurrentSnapGuide] = useState(null);
  const [puzzleType, setPuzzleType] = useState('classic');
  const [activePanel, setActivePanel] = useState(null);
  const [activeMobilePanel, setActiveMobilePanel] = useState(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

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

  // Custom hook
  const {
    players,
    gameState,
    error,
    updatePiecePosition,
    syncPieceState,
    updateGameState,
    timer,
    updateTimer,
    progress: syncedProgress,
    updateProgress,
    difficulty,
    isPlaying,
    startGame,
    pauseGame,
    updateDifficulty,
  } = useMultiplayerGame(gameId);

  // Helper functions
  const startTimer = () => {
    if (!isPlaying) {
      startGame();
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => {
          const newTime = prev + 100;
          updateTimer(newTime);
          return newTime;
        });
      }, 100);
    }
  };

  const pauseTimer = () => {
    if (isPlaying) {
      pauseGame();
      clearInterval(timerRef.current);
    }
  };

  useEffect(() => {
    if (gameState?.status === 'playing' && image) {
      createPuzzlePieces(image);
    }
  }, [gameState?.status, image]);

  const resetGame = () => {
    startGame();
    clearInterval(timerRef.current);
    setElapsedTime(0);
    updateTimer(0);
    setCompletedPieces(0);
    setProgress(0);
    setGameStats({
      moveCount: 0,
      accurateDrops: 0,
      startTime: Date.now(),
      points: 0,
      combos: 0
    });
    createPuzzlePieces(image);
  };

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = String(milliseconds % 1000).padStart(3, '0').slice(0, 2);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const celebrateProgress = (progress) => {
    if (progress % 25 === 0) {
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

  const arrangePiecesInContainer = (pieces, containerLayout, pieceSize) => {
    const { position, dimensions } = containerLayout;
  
    // Calculate the bounds of the container
    const minX = position.x - dimensions.width / 2;
    const maxX = position.x + dimensions.width / 2;
    const minY = position.y - dimensions.height / 2;
    const maxY = position.y + dimensions.height / 2;
  
    // Randomly position each piece within the container bounds
    pieces.forEach((piece) => {
      const randomX = minX + Math.random() * (maxX - minX);
      const randomY = minY + Math.random() * (maxY - minY);
  
      // Set the piece's position
      piece.position.set(randomX, randomY, 0);
  
      // Add a small random rotation for visual effect
      piece.rotation.z = Math.random() * Math.PI * 2;
    });
  };

  const createPuzzlePieces = async (imageUrl, puzzleType = 'classic') => {
    if (!sceneRef.current) return;
  
    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      if (piece.geometry) piece.geometry.dispose();
      if (piece.material) piece.material.dispose();
      if (piece.parent) piece.parent.remove(piece);
    });
    puzzlePiecesRef.current = [];
  
    // Create containers first (only for 2D puzzles)
    if (puzzleType === 'classic') {
      Object.entries(CONTAINER_LAYOUT).forEach(([side, layout]) => {
        const containerGeometry = new THREE.PlaneGeometry(
          layout.dimensions.width,
          layout.dimensions.height
        );
        const containerMaterial = new THREE.MeshBasicMaterial({
          color: layout.color,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        const container = new THREE.Mesh(containerGeometry, containerMaterial);
        container.position.set(layout.position.x, layout.position.y, -0.1);
        container.userData.isContainer = true;
        container.userData.side = side;
        sceneRef.current.add(container);
      });
    }
  
    try {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      const puzzleSettings = PUZZLE_TYPES[puzzleType].settings;
      const imageAspectRatio = texture.image.width / texture.image.height;
      const targetAspectRatio = puzzleSettings.aspectRatio;
      
      // Calculate piece sizes based on aspect ratio
      const baseSize = puzzleSettings.baseSize;
      let pieceWidth, pieceHeight;
      
      if (imageAspectRatio > targetAspectRatio) {
        // Image is wider than target
        pieceWidth = baseSize;
        pieceHeight = baseSize / targetAspectRatio;
      } else {
        // Image is taller than target
        pieceWidth = baseSize * targetAspectRatio;
        pieceHeight = baseSize;
      }
  
      const settings = DIFFICULTY_SETTINGS[difficulty];
      const pieceSize = {
        x: pieceWidth / settings.grid.x,
        y: pieceHeight / settings.grid.y
      };
  
      const pieces = [];
      for (let y = 0; y < settings.grid.y; y++) {
        for (let x = 0; x < settings.grid.x; x++) {
          let geometry;
          switch (puzzleType) {
            case 'cube':
              // Create a cube geometry for 3D cube puzzles
              geometry = new THREE.BoxGeometry(pieceSize.x, pieceSize.y, pieceSize.x);
              break;
            case 'cylinder':
              // Create a cylinder geometry for 3D cylinder puzzles
              geometry = new THREE.CylinderGeometry(
                pieceSize.x / 2, // Radius at the top
                pieceSize.x / 2, // Radius at the bottom
                pieceSize.y,      // Height
                32                // Number of radial segments
              );
              break;
            default:
              // Default to 2D plane geometry for classic puzzles
              geometry = new THREE.PlaneGeometry(
                pieceSize.x * 0.98,
                pieceSize.y * 0.98,
                32,
                32
              );
              break;
          }
  
          const material = new THREE.ShaderMaterial({
            uniforms: {
              map: { value: texture },
              heightMap: { value: texture },
              uvOffset: { value: new THREE.Vector2(x / settings.grid.x, y / settings.grid.y) },
              uvScale: { value: new THREE.Vector2(1 / settings.grid.x, 1 / settings.grid.y) },
              depth: { value: 0.2 },
              selected: { value: 0.0 },
              correctPosition: { value: 0.0 },
              time: { value: 0.0 }
            },
            vertexShader: puzzlePieceShader.vertexShader,
            fragmentShader: puzzlePieceShader.fragmentShader,
            side: THREE.DoubleSide
          });
  
          const piece = new THREE.Mesh(geometry, material);
  
          // Store original position for snapping
          piece.userData.originalPosition = new THREE.Vector3(
            (x - (settings.grid.x - 1) / 2) * pieceSize.x,
            (y - (settings.grid.y - 1) / 2) * pieceSize.y,
            0
          );
          piece.userData.gridPosition = { x, y };
          piece.userData.id = `piece_${x}_${y}`;
          piece.userData.isPlaced = false;
  
          pieces.push(piece);
        }
      }
  
      // Distribute pieces between containers (only for 2D puzzles)
      if (puzzleType === 'classic') {
        const shuffledPieces = pieces.sort(() => Math.random() - 0.5);
        const halfLength = Math.ceil(shuffledPieces.length / 2);
        const leftPieces = shuffledPieces.slice(0, halfLength);
        const rightPieces = shuffledPieces.slice(halfLength);
  
        // Arrange pieces in containers
        arrangePiecesInContainer(leftPieces, CONTAINER_LAYOUT.left, pieceSize);
        arrangePiecesInContainer(rightPieces, CONTAINER_LAYOUT.right, pieceSize);
      } else {
        // For 3D puzzles, scatter pieces randomly in 3D space
        pieces.forEach(piece => {
          piece.position.set(
            (Math.random() - 0.5) * 10, // Random X position
            (Math.random() - 0.5) * 10, // Random Y position
            (Math.random() - 0.5) * 10  // Random Z position
          );
        });
      }
  
      // Add all pieces to scene and synchronize with other players
      pieces.forEach(piece => {
        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
        syncPieceState(piece.userData.id, {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z,
          rotation: piece.rotation.z,
          isPlaced: false
        });
      });
  
      setTotalPieces(settings.grid.x * settings.grid.y);
      if (puzzleType === 'classic') {
        createPlacementGuides(settings.grid, pieceSize);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error creating puzzle pieces:', error);
      toast.error('Failed to create puzzle pieces');
      setLoading(false);
    }
  };
  
  // const createPlacementGuides = (gridSize, pieceSize) => {
  //   guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
  //   guideOutlinesRef.current = [];
  
  //   // Create main grid container
  //   const gridWidth = gridSize.x * pieceSize.x;
  //   const gridHeight = gridSize.y * pieceSize.y;
    
  //   // Create background plane for entire grid
  //   const gridBackground = new THREE.Mesh(
  //     new THREE.PlaneGeometry(gridWidth + 0.1, gridHeight + 0.1),
  //     new THREE.MeshBasicMaterial({
  //       color: GRID_STYLE.secondaryColor,
  //       transparent: true,
  //       opacity: 0.2
  //     })
  //   );
  //   gridBackground.position.z = -0.02;
  //   sceneRef.current.add(gridBackground);
  //   guideOutlinesRef.current.push(gridBackground);
  
  //   // Create individual cell outlines
  //   for (let y = 0; y < gridSize.y; y++) {
  //     for (let x = 0; x < gridSize.x; x++) {
  //       // Create cell background with alternating colors
  //       const isAlternate = (x + y) % 2 === 0;
  //       const cellGeometry = new THREE.PlaneGeometry(pieceSize.x * 0.98, pieceSize.y * 0.98);
  //       const cellMaterial = new THREE.MeshBasicMaterial({
  //         color: isAlternate ? GRID_STYLE.primaryColor : GRID_STYLE.secondaryColor,
  //         transparent: true,
  //         opacity: 0.15
  //       });
  //       const cell = new THREE.Mesh(cellGeometry, cellMaterial);
  
  //       // Position the cell
  //       cell.position.x = (x - (gridSize.x - 1) / 2) * pieceSize.x;
  //       cell.position.y = (y - (gridSize.y - 1) / 2) * pieceSize.y;
  //       cell.position.z = -0.015;
  
  //       sceneRef.current.add(cell);
  //       guideOutlinesRef.current.push(cell);
  
  //       // Create cell outline
  //       const outlineGeometry = new THREE.EdgesGeometry(cellGeometry);
  //       const outlineMaterial = new THREE.LineBasicMaterial({
  //         color: GRID_STYLE.primaryColor,
  //         transparent: true,
  //         opacity: GRID_STYLE.opacity,
  //         linewidth: GRID_STYLE.lineWidth
  //       });
  //       const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  //       outline.position.copy(cell.position);
  //       outline.position.z = -0.01;
  
  //       sceneRef.current.add(outline);
  //       guideOutlinesRef.current.push(outline);
  //     }
  //   }
  // };
  
  const handlePieceSnap = (piece, particleSystem) => {
    const originalPos = piece.userData.originalPosition;
    const originalRot = new THREE.Euler(0, 0, 0);
    const duration = 0.3;
    const startPos = piece.position.clone();
    const startRot = piece.rotation.clone();
    const startTime = Date.now();
  
    // Play snap sound and show particles before animation
    if (particleSystem) {
      particleSystem.emit(piece.position, 30, new THREE.Color(0x4a90e2));
    }
  
    const animate = () => {
      const progress = Math.min((Date.now() - startTime) / (duration * 1000), 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
  
      // Position interpolation
      piece.position.lerpVectors(startPos, originalPos, easeProgress);
  
      // Rotation interpolation
      piece.rotation.x = THREE.MathUtils.lerp(startRot.x, originalRot.x, easeProgress);
      piece.rotation.y = THREE.MathUtils.lerp(startRot.y, originalRot.y, easeProgress);
      piece.rotation.z = THREE.MathUtils.lerp(startRot.z, originalRot.z, easeProgress);
  
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure final position and rotation are exact
        piece.position.copy(originalPos);
        piece.rotation.copy(originalRot);
        
        // Update piece state
        piece.userData.isPlaced = true;
        piece.material.uniforms.correctPosition.value = 1.0;
        
        // Sync final state with other players
        syncPieceState(piece.userData.id, {
          x: originalPos.x,
          y: originalPos.y,
          z: originalPos.z,
          rotation: 0,
          isPlaced: true
        });
  
        // Update completion progress
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          const newProgress = (newCount / totalPieces) * 100;
          setProgress(newProgress);
          updateProgress(newProgress);
          
          // Check for puzzle completion
          if (newProgress === 100) {
            handleGameCompletion();
          }
          return newCount;
        });
  
        // Show completion particles
        if (particleSystem) {
          particleSystem.emit(piece.position, 20, new THREE.Color(0x00ff00));
        }
      }
    };
  
    animate();
  };
  
  // Event handlers
  const handleGameCompletion = async () => {
    const endTime = Date.now();
    const completionTime = endTime - gameStats.startTime;
    const accuracy = (gameStats.accurateDrops / gameStats.moveCount) * 100;
    
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
    await updateGameState({
      status: 'completed',
      winner: finalScore,
      endedAt: endTime
    });
    
    setLeaderboard(prev => [...prev, finalScore].sort((a, b) => b.accurateDrops - a.accurateDrops));
    toast.success('Puzzle completed! 🎉');
    updateProgress(100);
  };

  const handlePuzzleTypeChange = (newType) => {
    setPuzzleType(newType);
    setShowTypeSelector(false);
    setActiveMobilePanel(null);
    setLoading(true);
    createPuzzlePieces(image, newType);
    setupCamera(newType);
  };

  // Effects
  useEffect(() => {
    if (!containerRef.current || !image) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 2;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, 0.4, 0.85
    ));
    composerRef.current = composer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    particleSystemRef.current = new ParticleSystem(scene);

    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = clockRef.current.getDelta();
      const time = clockRef.current.getElapsedTime();
      
      controls.update();
      particleSystemRef.current.update(deltaTime);

      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = time;
        }
      });

      composer.render();
    };
    animate();

    const handleResize = () => {
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      composer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      composer.dispose();
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (object.material.length) {
            for (const material of object.material) material.dispose();
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, [image]);

  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let moveStartTime = null;

    const onMouseDown = (event) => {
      if (!isPlaying) return;

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

          setGameStats(prev => ({
            ...prev,
            moveCount: prev.moveCount + 1
          }));
        }
      }
    };

    const onMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current || !isPlaying) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1)),
        intersectPoint
      );
    
      // Update piece position
      selectedPieceRef.current.position.copy(intersectPoint);
      
      // Sync position with other players
      updatePiecePosition(selectedPieceRef.current.userData.id, {
        x: intersectPoint.x,
        y: intersectPoint.y,
        z: intersectPoint.z,
        rotation: selectedPieceRef.current.rotation.z,
        lastUpdatedBy: user.uid
      });
    
      // Check for snapping preview
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);
      const rotationDiff = Math.abs(selectedPieceRef.current.rotation.z % (Math.PI * 2));
    
      // Update shader feedback
      if (selectedPieceRef.current.material.uniforms) {
        const isNearCorrect = distance < DIFFICULTY_SETTINGS[difficulty].snapDistance &&
                             (!DIFFICULTY_SETTINGS[difficulty].rotationEnabled || 
                              rotationDiff < 0.2 || Math.abs(rotationDiff - Math.PI * 2) < 0.2);
        
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          isNearCorrect ? 0.5 : 0.0;
      }
    };
    
    const onMouseUp = () => {
      if (!selectedPieceRef.current) return;
    
      const piece = selectedPieceRef.current;
      const originalPos = piece.userData.originalPosition;
      const distance = originalPos.distanceTo(piece.position);
      const rotationDiff = Math.abs(piece.rotation.z % (Math.PI * 2));
    
      const isNearCorrectPosition = distance < DIFFICULTY_SETTINGS[difficulty].snapDistance;
      const isNearCorrectRotation = rotationDiff < 0.2 || Math.abs(rotationDiff - Math.PI * 2) < 0.2;
    
      if (isNearCorrectPosition && isNearCorrectRotation && !piece.userData.isPlaced) {
        handlePieceSnap(piece, particleSystemRef.current);
        piece.userData.isPlaced = true;
        
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          const newProgress = (newCount / totalPieces) * 100;
          setProgress(newProgress);
          updateProgress(newProgress);
          return newCount;
        });
      }
    
      // Reset piece state
      if (piece.material.uniforms) {
        piece.material.uniforms.selected.value = 0.0;
        piece.material.uniforms.correctPosition.value = piece.userData.isPlaced ? 1.0 : 0.0;
      }
    
      selectedPieceRef.current = null;
      controlsRef.current.enabled = true;
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

  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    // Create main grid container
    const gridWidth = gridSize.x * pieceSize.x;
    const gridHeight = gridSize.y * pieceSize.y;
    
    // Create background plane for entire grid
    const gridBackground = new THREE.Mesh(
      new THREE.PlaneGeometry(gridWidth + 0.1, gridHeight + 0.1),
      new THREE.MeshBasicMaterial({
        color: GRID_STYLE.secondaryColor,
        transparent: true,
        opacity: 0.2
      })
    );
    gridBackground.position.z = -0.02;
    sceneRef.current.add(gridBackground);
    guideOutlinesRef.current.push(gridBackground);

    // Create individual cell outlines
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create cell background with alternating colors
        const isAlternate = (x + y) % 2 === 0;
        const cellGeometry = new THREE.PlaneGeometry(pieceSize.x * 0.98, pieceSize.y * 0.98);
        const cellMaterial = new THREE.MeshBasicMaterial({
          color: isAlternate ? GRID_STYLE.primaryColor : GRID_STYLE.secondaryColor,
          transparent: true,
          opacity: 0.15
        });
        const cell = new THREE.Mesh(cellGeometry, cellMaterial);

        // Position the cell
        cell.position.x = (x - (gridSize.x - 1) / 2) * pieceSize.x;
        cell.position.y = (y - (gridSize.y - 1) / 2) * pieceSize.y;
        cell.position.z = -0.015;

        sceneRef.current.add(cell);
        guideOutlinesRef.current.push(cell);

        // Create cell outline
        const outlineGeometry = new THREE.EdgesGeometry(cellGeometry);
        const outlineMaterial = new THREE.LineBasicMaterial({
          color: GRID_STYLE.primaryColor,
          transparent: true,
          opacity: GRID_STYLE.opacity,
          linewidth: GRID_STYLE.lineWidth
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.position.copy(cell.position);
        outline.position.z = -0.01;

        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
  };

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

  const handleDifficultyChange = (newDifficulty) => {
    updateDifficulty(newDifficulty);
    resetGame();
  };

  const scramblePieces = () => {
    puzzlePiecesRef.current.forEach(piece => {
      if (!piece.userData.isPlaced) {
        piece.position.x += (Math.random() - 0.5) * 2;
        piece.position.y += (Math.random() - 0.5) * 2;
        piece.position.z = Math.random() * 0.1;
      }
    });
  };

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

    setProgress(syncedProgress);
  }, [gameState?.pieces, syncedProgress, user.uid]);

  // Render
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700 p-3 md:p-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 md:gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full text-white">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">{Object.keys(players).length} Players</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full text-white">
              <Clock className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">{formatTime(timer)}</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="w-full max-w-md bg-gray-800/50 rounded-full h-2.5 mb-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-300">Progress: {Math.round(progress)}%</span>
          </div>

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

            <div className="flex rounded-lg overflow-hidden bg-gray-800/50">
              {isHost && (
                <button
                  onClick={() => setShowTypeSelector(!showTypeSelector)}
                  className="p-2 hover:bg-purple-500/20 transition-colors"
                  title="Change Puzzle Type"
                >
                  <Settings className="w-5 h-5 text-purple-400" />
                </button>
              )}
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

      {/* Add bottom mobile navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 z-40">
        <div className="grid grid-cols-5 gap-1 p-2">
          <button
            onClick={() => setActiveMobilePanel('stats')}
            className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-xs mt-1">Stats</span>
          </button>
          <button
            onClick={() => setActiveMobilePanel('players')}
            className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
          >
            <Users className="w-5 h-5" />
            <span className="text-xs mt-1">Players</span>
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
          <button
            onClick={() => setShowTutorial(true)}
            className="flex flex-col items-center p-2 text-gray-400 hover:text-blue-400"
          >
            <Info className="w-5 h-5" />
            <span className="text-xs mt-1">Help</span>
          </button>
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

      <MobilePanel
        isOpen={activeMobilePanel === 'puzzleType'}
        onClose={() => setActiveMobilePanel(null)}
        title="Puzzle Type"
        icon={Image}
      >
        <PuzzleTypeSelector
          onSelect={handlePuzzleTypeChange}
          currentType={puzzleType}
          onClose={() => setActiveMobilePanel(null)}
        />
      </MobilePanel>

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-xl">Loading puzzle...</div>
          </div>
        )}
        
        <div 
          ref={containerRef} 
          className="w-full h-[calc(100vh-64px)]"
          style={{ touchAction: 'none' }}
        />

        {showThumbnail && (
          <div className="absolute top-20 right-4 p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-700">
            <img src={image} alt="Reference" className="w-48 h-auto rounded" />
          </div>
        )}

        {showTypeSelector && (
          <FloatingPanel
            title="Puzzle Type"
            icon={Image}
            isOpen={showTypeSelector}
            onClose={() => setShowTypeSelector(false)}
            position="right"
          >
            <PuzzleTypeSelector
              onSelect={handlePuzzleTypeChange}
              currentType={puzzleType}
              onClose={() => setShowTypeSelector(false)}
            />
          </FloatingPanel>
        )}

        <button
          onClick={() => setShowTutorial(true)}
          className="absolute bottom-24 right-4 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          title="Show Help"
        >
          <Info className="w-6 h-6" />
        </button>

        {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
      </div>
    </div>
  );
};

export default MultiplayerManager;