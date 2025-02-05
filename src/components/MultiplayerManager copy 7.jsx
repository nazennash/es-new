import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, 
         Pause, Trophy, Users, Mouse, ZapIcon, Menu, X, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';

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