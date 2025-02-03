import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Trophy, Users, Mouse } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Define point values for actions
const POINTS = {
  ACCURATE_PLACEMENT: 100,
  QUICK_PLACEMENT: 50, // Under 5 seconds
  COMBO: 25, // Multiple correct placements in succession
  COMPLETION_BONUS: 1000
};

// Shader for piece highlighting and effects
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

// Enhanced particle system
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

const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

// Add visual tutorial overlay for new players
const TutorialOverlay = ({ onClose }) => (
  <div className="absolute inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center">
    <div className="bg-gray-800 p-6 rounded-lg max-w-lg text-white">
      <h3 className="text-xl font-bold mb-4">How to Play</h3>
      <ul className="space-y-3 mb-6">
        <li className="flex items-center gap-2">
          <Mouse className="text-blue-400" /> Drag and drop pieces to solve the puzzle</li>
        <li className="flex items-center gap-2">
          <ZoomIn className="text-blue-400" /> Use mouse wheel or buttons to zoom</li>
        <li className="flex items-center gap-2">
          <Image className="text-blue-400" /> Toggle reference image for help</li>
        <li className="flex items-center gap-2">
          <Trophy className="text-blue-400" /> Earn bonus points for quick & accurate placements</li>
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

// Add piece highlighting on hover
const highlightPiece = (piece) => {
  if (piece && !piece.userData.isPlaced) {
    piece.material.uniforms.selected.value = 0.5;
    // Show "grab" cursor
    document.body.style.cursor = 'grab';
  }
};

const unhighlightPiece = (piece) => {
  if (piece) {
    piece.material.uniforms.selected.value = 0;
    document.body.style.cursor = 'default';
  }
};

// Add visual snap guides
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

// Add piece placement feedback
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
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
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
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
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
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

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

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];
 
    try {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      const aspectRatio = texture.image.width / texture.image.height;
      
      // Get settings based on difficulty
      const settings = DIFFICULTY_SETTINGS[difficulty];
      const gridSize = settings.grid;
      const pieceSize = {
        x: 1 * aspectRatio / gridSize.x,
        y: 1 / gridSize.y
      };

      setTotalPieces(gridSize.x * gridSize.y);
      createPlacementGuides(gridSize, pieceSize);

      // Create pieces
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          const geometry = new THREE.PlaneGeometry(
            pieceSize.x * 0.95,
            pieceSize.y * 0.95,
            32,
            32
          );

          const material = new THREE.ShaderMaterial({
            uniforms: {
              map: { value: texture },
              uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
              uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
              selected: { value: 0.0 },
              correctPosition: { value: 0.0 },
              time: { value: 0.0 }
            },
            vertexShader: puzzlePieceShader.vertexShader,
            fragmentShader: puzzlePieceShader.fragmentShader,
            side: THREE.DoubleSide
          });

          const piece = new THREE.Mesh(geometry, material);
          
          piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
          piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
          
          piece.userData = {
            id: `piece_${x}_${y}`,
            originalPosition: piece.position.clone(),
            gridPosition: { x, y },
            isPlaced: false
          };

          sceneRef.current.add(piece);
          puzzlePiecesRef.current.push(piece);
        }
      }

      // Scramble pieces
      puzzlePiecesRef.current.forEach(piece => {
        if (!piece.userData.isPlaced) {
          piece.position.x += (Math.random() - 0.5) * 2;
          piece.position.y += (Math.random() - 0.5) * 2;
          piece.position.z = Math.random() * 0.1;
          piece.rotation.z = settings.rotationEnabled ? (Math.random() - 0.5) * 0.5 : 0;
        }
      });

      // Sync initial piece positions if host
      if (isHost) {
        const piecesData = {};
        puzzlePiecesRef.current.forEach(piece => {
          piecesData[piece.userData.id] = {
            position: {
              x: piece.position.x,
              y: piece.position.y,
              z: piece.position.z
            },
            rotation: piece.rotation.z,
            isPlaced: piece.userData.isPlaced
          };
        });
        await syncPieceState(piecesData);
      }

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

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Player count */}
          <div className="text-white flex items-center gap-2">
            <Users size={20} />
            <span>{Object.keys(players).length} Players</span>
          </div>

          {/* Game stats */}
          <div className="text-white flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Clock size={18} />
              <span>{formatTime(timer)}</span> {/* Use synced timer */}
            </div>
            <div>Moves: {gameStats.moveCount}</div>
            <div>Accuracy: {gameStats.moveCount > 0 
              ? Math.round((gameStats.accurateDrops / gameStats.moveCount) * 100)
              : 0}%</div>
            <div>Points: {gameStats.points}</div>
            {gameStats.combos > 1 && (
              <div className="text-yellow-400">
                {gameStats.combos}x Combo!
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-4">
          <div className="text-white">Progress: {Math.round(progress)}%</div> {/* Use local progress */}
          <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isHost && (
            <div className="flex items-center gap-2">
              <button
                onClick={startTimer}
                className="p-2 bg-green-500 text-white rounded hover:bg-green-600"
                disabled={isPlaying}
              >
                <Play size={20} />
              </button>
              <button
                onClick={pauseTimer}
                className="p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                disabled={!isPlaying}
              >
                <Pause size={20} />
              </button>
              <button
                onClick={resetGame} // Change to resetGame
                className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                <RotateCcw size={20} />
              </button>
              {/* Difficulty buttons */}
              <button
                onClick={() => handleDifficultyChange('easy')}
                className={`p-2 ${difficulty === 'easy' ? 'bg-blue-500' : 'bg-gray-700'} text-white rounded hover:bg-blue-600`}
              >
                Easy
              </button>
              <button
                onClick={() => handleDifficultyChange('medium')}
                className={`p-2 ${difficulty === 'medium' ? 'bg-blue-500' : 'bg-gray-700'} text-white rounded hover:bg-blue-600`}
              >
                Medium
              </button>
              <button
                onClick={() => handleDifficultyChange('hard')}
                className={`p-2 ${difficulty === 'hard' ? 'bg-blue-500' : 'bg-gray-700'} text-white rounded hover:bg-blue-600`}
              >
                Hard
              </button>
              <button
                onClick={() => handleDifficultyChange('expert')}
                className={`p-2 ${difficulty === 'expert' ? 'bg-blue-500' : 'bg-gray-700'} text-white rounded hover:bg-blue-600`}
              >
                Expert
              </button>
            </div>
          )}
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Toggle Reference Image"
          >
            <Image size={20} />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 bg-gray-700 text-white rounded hover:bg-gray-600"
            title="Reset View"
          >
            <Maximize2 size={20} />
          </button>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-xl">Loading puzzle...</div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />

        {/* Thumbnail overlay */}
        {showThumbnail && image && (
          <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg">
            <img
              src={image}
              alt="Reference"
              className="w-48 h-auto rounded border border-gray-600"
            />
          </div>
        )}

        {/* Players list */}
        <div className="absolute left-4 top-16 p-4 bg-gray-800 rounded-lg shadow-lg">
          <h3 className="text-white font-semibold mb-2">Players</h3>
          <div className="space-y-2">
            {Object.values(players).map(player => (
              <div key={player.id} className="flex items-center gap-2 text-white">
                <div className={`w-2 h-2 rounded-full ${
                  player.isOnline ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <span>{player.name}</span>
                {player.isHost && (
                  <span className="text-xs text-blue-400">(Host)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="absolute right-4 top-16 p-4 bg-gray-800 rounded-lg shadow-lg">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
            <Trophy size={18} className="text-yellow-400" />
            <span>Leaderboard</span>
          </h3>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((score, index) => (
              <div key={index} className="flex items-center justify-between gap-4 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400">#{index + 1}</span>
                  <span>{score.userName}</span>
                </div>
                <span>{score.points} pts</span>
              </div>
            ))}
          </div>
        </div>

        {/* Winner announcement */}
        {winner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 text-white">
              <div className="text-center">
                <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-4">
                  🎉 Puzzle Completed! 🎉
                </h2>
                <div className="space-y-2 mb-6">
                  <p className="text-xl font-semibold">{winner.userName}</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-gray-400">Time</p>
                      <p className="text-lg">{formatTime(winner.completionTime)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Moves</p>
                      <p className="text-lg">{winner.moveCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Accuracy</p>
                      <p className="text-lg">{Math.round(winner.accuracy)}%</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Points</p>
                      <p className="text-lg text-yellow-400">{winner.points}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Completed Pieces</p>
                      <p className="text-lg">{completedPieces}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Remaining Pieces</p>
                      <p className="text-lg">{totalPieces - completedPieces}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Back to Home
                  </button>
                  <button
                    onClick={() => setWinner(null)}
                    className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    View Puzzle
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Points popup */}
        {gameStats.combos > 1 && (
          <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="text-yellow-400 text-4xl font-bold animate-bounce">
              +{POINTS.COMBO * gameStats.combos} pts
            </div>
          </div>
        )}
      </div>
      
      {showTutorial && (
        <TutorialOverlay onClose={() => setShowTutorial(false)} />
      )}
      
      {/* Add help button */}
      <button
        onClick={() => setShowTutorial(true)}
        className="absolute bottom-4 right-4 p-2 bg-gray-700 text-white rounded-full hover:bg-gray-600"
        title="Show Help"
      >
        <Info size={24} />
      </button>
    </div>
  );
};

export default MultiplayerManager;