import * as THREE from 'three';

export const PuzzleGeometries = {
  cube: {
    createPieces: (settings, texture) => {
      const pieces = [];
      const size = 1;
      const faces = ['front', 'back', 'top', 'bottom', 'left', 'right'];
      const rotations = [
        [0, 0, 0], // front
        [0, Math.PI, 0], // back
        [-Math.PI/2, 0, 0], // top
        [Math.PI/2, 0, 0], // bottom
        [0, -Math.PI/2, 0], // left
        [0, Math.PI/2, 0], // right
      ];

      faces.forEach((face, faceIndex) => {
        const segments = settings.grid;
        for (let y = 0; y < segments.y; y++) {
          for (let x = 0; x < segments.x; x++) {
            const geometry = new THREE.PlaneGeometry(
              size/segments.x * 0.95,
              size/segments.y * 0.95
            );
            
            const piece = {
              geometry,
              position: new THREE.Vector3(
                (x - segments.x/2 + 0.5) * (size/segments.x),
                (y - segments.y/2 + 0.5) * (size/segments.y),
                size/2
              ),
              rotation: new THREE.Euler(...rotations[faceIndex]),
              uvOffset: new THREE.Vector2(x/segments.x, y/segments.y),
              uvScale: new THREE.Vector2(1/segments.x, 1/segments.y),
              faceIndex,
              gridPosition: { x, y, face }
            };
            pieces.push(piece);
          }
        }
      });
      return pieces;
    }
  },

  sphere: {
    createPieces: (settings, texture) => {
      const pieces = [];
      const radius = 1;
      const segments = settings.grid;

      for (let lat = 0; lat < segments.y; lat++) {
        for (let lon = 0; lon < segments.x; lon++) {
          const phi = (lat / segments.y) * Math.PI;
          const theta = (lon / segments.x) * Math.PI * 2;

          const geometry = new THREE.SphereGeometry(
            radius,
            Math.ceil(32/segments.x),
            Math.ceil(32/segments.y),
            theta,
            Math.PI * 2/segments.x * 0.95,
            phi,
            Math.PI/segments.y * 0.95
          );

          const piece = {
            geometry,
            position: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            uvOffset: new THREE.Vector2(lon/segments.x, lat/segments.y),
            uvScale: new THREE.Vector2(1/segments.x, 1/segments.y),
            gridPosition: { lat, lon }
          };
          pieces.push(piece);
        }
      }
      return pieces;
    }
  },

  pyramid: {
    createPieces: (settings, texture) => {
      const pieces = [];
      const size = 1;
      const height = Math.sqrt(2);
      const faces = ['front', 'back', 'left', 'right', 'bottom'];
      
      faces.forEach((face, faceIndex) => {
        const segments = settings.grid;
        for (let y = 0; y < segments.y; y++) {
          for (let x = 0; x < segments.x; x++) {
            const geometry = new THREE.PlaneGeometry(
              size/segments.x * 0.95,
              size/segments.y * 0.95
            );

            const angle = (Math.PI * 2) / 4;
            const piece = {
              geometry,
              position: new THREE.Vector3(
                Math.sin(angle * faceIndex) * (size/2),
                y * (height/segments.y),
                Math.cos(angle * faceIndex) * (size/2)
              ),
              rotation: new THREE.Euler(
                -Math.PI/6,
                angle * faceIndex,
                0
              ),
              uvOffset: new THREE.Vector2(x/segments.x, y/segments.y),
              uvScale: new THREE.Vector2(1/segments.x, 1/segments.y),
              faceIndex,
              gridPosition: { x, y, face }
            };
            pieces.push(piece);
          }
        }
      });
      return pieces;
    }
  },

  cylinder: {
    createPieces: (settings, texture) => {
      const pieces = [];
      const radius = 0.5;
      const height = 2;
      const segments = settings.grid;

      for (let y = 0; y < segments.y; y++) {
        for (let x = 0; x < segments.x; x++) {
          const angle = (x / segments.x) * Math.PI * 2;
          const geometry = new THREE.PlaneGeometry(
            (Math.PI * 2 * radius)/segments.x * 0.95,
            height/segments.y * 0.95
          );

          const piece = {
            geometry,
            position: new THREE.Vector3(
              Math.sin(angle) * radius,
              (y - segments.y/2 + 0.5) * (height/segments.y),
              Math.cos(angle) * radius
            ),
            rotation: new THREE.Euler(0, angle, 0),
            uvOffset: new THREE.Vector2(x/segments.x, y/segments.y),
            uvScale: new THREE.Vector2(1/segments.x, 1/segments.y),
            gridPosition: { x, y }
          };
          pieces.push(piece);
        }
      }
      return pieces;
    }
  },

  tower: {
    createPieces: (settings, texture) => {
      const pieces = [];
      const size = 1;
      const height = 3;
      const segments = settings.grid;

      for (let y = 0; y < segments.y; y++) {
        for (let x = 0; x < segments.x; x++) {
          const geometry = new THREE.BoxGeometry(
            size/segments.x * 0.95,
            height/segments.y * 0.95,
            size/segments.x * 0.95
          );

          const piece = {
            geometry,
            position: new THREE.Vector3(
              (x - segments.x/2 + 0.5) * (size/segments.x),
              (y - segments.y/2 + 0.5) * (height/segments.y),
              0
            ),
            rotation: new THREE.Euler(0, 0, 0),
            uvOffset: new THREE.Vector2(x/segments.x, y/segments.y),
            uvScale: new THREE.Vector2(1/segments.x, 1/segments.y),
            gridPosition: { x, y }
          };
          pieces.push(piece);
        }
      }
      return pieces;
    }
  }
};

export default PuzzleGeometries;
