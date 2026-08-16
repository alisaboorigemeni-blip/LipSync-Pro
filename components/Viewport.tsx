
import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage, Html } from '@react-three/drei';
import * as THREE from 'three';
import { MeshInfo } from '../types';
import { Loader2, AlertCircle } from 'lucide-react';

interface SceneProcessorProps {
  scene: THREE.Group | THREE.Scene;
  onLoaded: (info: MeshInfo, mesh: THREE.Mesh) => void;
  onModelRootLoaded?: (root: THREE.Group | THREE.Scene) => void;
  visemeValues: { [key: string]: number };
}

// Logic to traverse scene, find best mesh, and apply animations
const SceneProcessor: React.FC<SceneProcessorProps> = ({ scene, onLoaded, onModelRootLoaded, visemeValues }) => {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

  useEffect(() => {
    if (scene && !analyzed) {
      // Pass the root scene up for export purposes
      if (onModelRootLoaded) {
        onModelRootLoaded(scene);
      }

      let bestMesh: THREE.Mesh | null = null;
      let maxScore = -1;

      console.log("Analyzing model structure...", scene);

      // Smart Mesh Detection Logic
      scene.traverse((child) => {
        // FIX: Use .isMesh property instead of instanceof to avoid "Multiple instances of Three.js" issues
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.morphTargetDictionary) {
          const keys = Object.keys(mesh.morphTargetDictionary || {});
          
          // Check if it has any keys at all
          if (keys.length === 0) return;

          console.log(`Found candidate mesh: "${mesh.name}" with ${keys.length} shape keys.`);

          let score = 0;
          const name = mesh.name.toLowerCase();

          // 1. Name heuristics
          if (name.includes('head')) score += 50;
          if (name.includes('face')) score += 50;
          if (name.includes('mouth')) score += 40;
          if (name.includes('body')) score += 10; 

          // 2. Shape Key heuristics
          const commonVisemeNames = ['viseme', 'jaw', 'mouth', 'blink', 'aa', 'ee', 'oo', 'smile'];
          let matchedKeys = 0;
          keys.forEach(k => {
             if (commonVisemeNames.some(v => k.toLowerCase().includes(v))) {
               matchedKeys++;
             }
          });
          score += matchedKeys * 5;

          // Prioritize meshes with more shape keys
          score += Math.min(keys.length, 20);

          if (score > maxScore) {
            maxScore = score;
            bestMesh = mesh;
          }
        }
      });

      if (bestMesh) {
        const mesh = bestMesh as THREE.Mesh;
        const keys = Object.keys(mesh.morphTargetDictionary || {});
        console.log(`Selected best mesh: "${mesh.name}" (Score: ${maxScore})`);
        onLoaded({ name: mesh.name, shapeKeys: keys }, mesh);
        meshRef.current = mesh;
        setAnalyzed(true);
      } else {
        console.warn("No mesh with shape keys found in model. attempting fallback...");
        // Fallback: just take the first one if we missed scoring
        scene.traverse((child) => {
           const mesh = child as THREE.Mesh;
           // FIX: Use .isMesh here as well
           if (!bestMesh && mesh.isMesh && mesh.morphTargetDictionary) {
             const keys = Object.keys(mesh.morphTargetDictionary);
             if (keys.length > 0) {
                bestMesh = mesh;
             }
           }
        });

        if (bestMesh) {
           const mesh = bestMesh as THREE.Mesh;
           const keys = Object.keys(mesh.morphTargetDictionary || {});
           console.log(`Fallback selected: "${mesh.name}"`);
           onLoaded({ name: mesh.name, shapeKeys: keys }, mesh);
           meshRef.current = mesh;
           setAnalyzed(true);
        } else {
           console.error("CRITICAL: Absolutely no mesh with morphTargetDictionary found.");
        }
      }
    }
  }, [scene, analyzed, onLoaded, onModelRootLoaded]);

  // Animation Loop
  useFrame(() => {
    if (meshRef.current && meshRef.current.morphTargetDictionary && meshRef.current.morphTargetInfluences) {
       const dict = meshRef.current.morphTargetDictionary;
       const influences = meshRef.current.morphTargetInfluences;

       // Reset all first
       for (let i = 0; i < influences.length; i++) influences[i] = 0;

       // Apply active
       Object.entries(visemeValues).forEach(([keyName, value]) => {
         if (keyName in dict) {
           const index = dict[keyName];
           influences[index] = value;
         }
       });
    }
  });

  // @ts-ignore
  return <primitive object={scene} />;
};

// Component to handle GLTF Loading
const GLTFModel: React.FC<{ url: string } & Omit<SceneProcessorProps, 'scene'>> = ({ url, ...props }) => {
  const { scene } = useGLTF(url);
  return <SceneProcessor scene={scene} {...props} />;
};

// --- NEW COMPONENT: Internal Canvas Recorder Helper ---
// This sits inside the Canvas to get access to the GL context/DOM element
const CanvasRecorder: React.FC<{ onReady: (canvas: HTMLCanvasElement) => void }> = ({ onReady }) => {
  const { gl } = useThree();
  useEffect(() => {
    if (gl.domElement) {
      onReady(gl.domElement);
    }
  }, [gl, onReady]);
  return null;
};

interface ErrorBoundaryProps {
  children?: React.ReactNode;
  fallback: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  // FIX: Explicitly declare props to satisfy TS in case of inference issues
  declare props: Readonly<ErrorBoundaryProps>;

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface ViewportProps {
  modelUrl: string | null;
  modelFormat: 'glb'; 
  onMeshLoaded: (info: MeshInfo, mesh: THREE.Mesh) => void;
  onModelRootLoaded: (root: THREE.Group | THREE.Scene) => void;
  currentShapeWeights: { [key: string]: number };
  onCanvasReady: (canvas: HTMLCanvasElement) => void; // Added Prop
  isExportingVideo: boolean; // Added Prop for UI overlay
}

export const Viewport: React.FC<ViewportProps> = ({ 
  modelUrl, 
  onMeshLoaded, 
  onModelRootLoaded, 
  currentShapeWeights,
  onCanvasReady,
  isExportingVideo
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  useEffect(() => {
    if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  // Calculate pixel ratio for export
  // If exporting, we want the internal canvas width to be at least 1920px (1080p standard width)
  // DPR = TargetWidth / VisibleWidth
  const exportDpr = isExportingVideo ? (1920 / Math.max(containerWidth, 1)) : window.devicePixelRatio;

  return (
    <div ref={containerRef} className="w-full h-full relative bg-gradient-to-br from-zinc-900 to-black">
      {!modelUrl && (
         <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 pointer-events-none z-10">
           <div className="w-16 h-16 border-2 border-dashed border-zinc-700 rounded-xl mb-4" />
           <p className="font-medium">No Model Loaded</p>
           <p className="text-sm opacity-50">Upload a .glb or .gltf file</p>
         </div>
      )}
      
      <ErrorBoundary fallback={
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400">
           <AlertCircle size={32} className="mb-2" />
           <p>Failed to load model</p>
        </div>
      }>
        <Canvas 
          shadows 
          camera={{ position: [1, 0, 0], fov: 25 }} 
          gl={{ preserveDrawingBuffer: true }}
          dpr={exportDpr} // Dynamically boost resolution during export
        >
           <CanvasRecorder onReady={onCanvasReady} />
           {modelUrl && (
             <Suspense fallback={null}>
                <Stage environment="city" intensity={0.6}>
                  <GLTFModel 
                    key={modelUrl} // Forces remount on new URL
                    url={modelUrl} 
                    onLoaded={onMeshLoaded}
                    onModelRootLoaded={onModelRootLoaded}
                    visemeValues={currentShapeWeights}
                  />
                </Stage>
             </Suspense>
           )}
           <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enabled={!isExportingVideo} />
        </Canvas>
      </ErrorBoundary>

      {/* Loading Indicator */}
      {modelUrl && (
         <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
            <Loader2 className="animate-spin text-white opacity-0 transition-opacity duration-300 data-[loading=true]:opacity-100" />
         </div>
      )}

      {/* Exporting Overlay */}
      {isExportingVideo && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex flex-col items-center shadow-2xl">
             <div className="relative mb-4">
                <div className="absolute inset-0 bg-red-500 blur-xl opacity-30 animate-pulse rounded-full" />
                <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute top-0 right-0" />
                <Loader2 size={48} className="text-white animate-spin relative z-10" />
             </div>
             <h3 className="text-lg font-bold text-white mb-1">Recording High-Res Video...</h3>
             <p className="text-xs text-zinc-400">Rendering at 1080p width. Please wait.</p>
           </div>
        </div>
      )}
    </div>
  );
};
