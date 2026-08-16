import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { VisemeEvent, ShapeKeyMapping } from '../types';

/**
 * Creates a Three.js AnimationClip from Viseme Events and the User's Mapping.
 */
export const createAnimationClip = (
  visemes: VisemeEvent[], 
  mapping: ShapeKeyMapping, 
  totalDuration: number
): THREE.AnimationClip => {
  const tracks: THREE.KeyframeTrack[] = [];
  
  // 1. Filter active keys
  const activeShapeKeys = new Set<string>();
  Object.values(mapping).forEach(val => {
    if (val) activeShapeKeys.add(val);
  });

  const fps = 60;
  // Safety: Ensure duration is valid
  const validDuration = Number.isFinite(totalDuration) && totalDuration > 0 ? totalDuration : 1;
  const numFrames = Math.ceil(validDuration * fps);
  
  const trackValues: Record<string, Float32Array> = {};
  const times: number[] = [];
  
  activeShapeKeys.forEach(key => {
    trackValues[key] = new Float32Array(numFrames + 1);
  });

  // 2. Build Tracks
  const sortedVisemes = [...visemes].sort((a, b) => a.start - b.start);
  let visemeIndex = 0;

  for (let i = 0; i <= numFrames; i++) {
    const t = i / fps;
    times.push(t);

    while (visemeIndex < sortedVisemes.length && sortedVisemes[visemeIndex].end < t) {
      visemeIndex++;
    }

    let activeEvent: VisemeEvent | undefined;
    for (let j = visemeIndex; j < sortedVisemes.length; j++) {
      if (sortedVisemes[j].start > t) break;
      if (t >= sortedVisemes[j].start && t <= sortedVisemes[j].end) {
        activeEvent = sortedVisemes[j];
        break;
      }
    }

    if (activeEvent) {
      const targetShapeKey = mapping[activeEvent.viseme];
      if (targetShapeKey && trackValues[targetShapeKey]) {
        const duration = activeEvent.end - activeEvent.start;
        const fade = Math.min(0.05, duration * 0.2);
        let alpha = 1.0;
        
        if (t < activeEvent.start + fade) {
          alpha = (t - activeEvent.start) / fade;
        } else if (t > activeEvent.end - fade) {
          alpha = (activeEvent.end - t) / fade;
        }
        
        trackValues[targetShapeKey][i] = activeEvent.strength * alpha;
      }
    }
  }

  activeShapeKeys.forEach(key => {
    const values = trackValues[key];
    const track = new THREE.NumberKeyframeTrack(
      `.morphTargetInfluences[${key}]`,
      times,
      values
    );
    tracks.push(track);
  });

  return new THREE.AnimationClip('LipSyncAction', validDuration, tracks);
};

export const exportGLB = (
  modelRoot: THREE.Group | THREE.Scene, 
  clip: THREE.AnimationClip | null,
  targetMeshName: string
) => {
  return new Promise<void>((resolve, reject) => {
    
    // --- HIERARCHY FIX ---
    // Instead of extracting the mesh or searching for a "Character Root",
    // we simply clone the EXACT root that was loaded. This preserves the 
    // exact node structure (nodes, parents, children) as the original file.
    const exportScene = modelRoot.clone();

    // Now we must find the mesh *inside* this clone to name the animation tracks correctly.
    let targetMesh: THREE.Mesh | null = null;
    
    exportScene.traverse((child) => {
      // FIX: Use .isMesh property check
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.name === targetMeshName) {
        targetMesh = mesh;
      }
    });

    // Fallback: If name match fails, look for morphology
    if (!targetMesh) {
       exportScene.traverse((child) => {
         // FIX: Use .isMesh property check
         const mesh = child as THREE.Mesh;
         if (!targetMesh && mesh.isMesh && mesh.morphTargetDictionary) {
            targetMesh = mesh;
         }
       });
    }

    // Apply Animation
    if (clip && targetMesh) {
        // Ensure the mesh has a name (GLTF needs named nodes for animation)
        if (!targetMesh.name) targetMesh.name = "TargetMesh";

        const newTracks = clip.tracks.map(t => {
            // Strip any existing node name prefix if present
            const propertyName = t.name.includes('.') ? t.name.substring(t.name.indexOf('.')) : t.name;
            const newTrack = t.clone();
            // Prefix with the specific node name in the hierarchy
            newTrack.name = `${targetMesh!.name}${propertyName}`;
            return newTrack;
        });

        const newClip = new THREE.AnimationClip(clip.name, clip.duration, newTracks);
        
        // Attach animation to the root
        exportScene.animations = [newClip];
    }

    const exporter = new GLTFExporter();
    const options = {
      binary: true,
      animations: exportScene.animations,
      truncateDrawRange: false
    };

    exporter.parse(
      exportScene,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lipsync_export_${targetMeshName}.glb`;
        link.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      (err) => reject(err),
      options
    );
  });
};