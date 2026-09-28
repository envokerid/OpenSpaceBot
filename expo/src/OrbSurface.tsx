import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { WebGLRenderer } from 'three';
import { threeContext } from './core/threeContext';
import { createOrbScene, type OrbSceneOptions } from '../../shared/orb-scene';

export type OrbSurfaceProps = OrbSceneOptions & { size: number; onReady: () => void; onFailure: () => void };

export default function OrbSurface(props: OrbSurfaceProps) {
  const live = useRef(props); live.current = props;
  const runtime = useRef<{ draw(): void; dispose(): void } | null>(null);
  const mounted = useRef(true);
  const contextRef = useRef<ExpoWebGLRenderingContext | null>(null);
  useEffect(() => { runtime.current?.draw(); }, [props.color, props.state, props.animated]);
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    if (!mounted.current) return;
    contextRef.current = gl;
    runtime.current?.dispose();
    let renderer: WebGLRenderer | undefined;
    let rig: ReturnType<typeof createOrbScene> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let presented = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true; clearTimeout(timer);
      rig?.dispose(); renderer?.dispose();
      // GLView owns its native context and destroys it on unmount.
    };
    try {
      // Three only needs dimensions and event hooks from a canvas when given
      // an existing Expo GL context. No global DOM or window polyfills.
      if (typeof gl.texImage3D !== 'function') throw new Error('The orb requires WebGL2');
      const context = threeContext(gl) as unknown as WebGL2RenderingContext;
      const canvas = {
        width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
        style: {}, addEventListener() {}, removeEventListener() {},
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      renderer.setClearColor(0, 0);
      rig = createOrbScene();
      const start = Date.now();
      const draw = () => {
        clearTimeout(timer);
        if (disposed || !mounted.current) return;
        try {
          rig!.update(live.current, (Date.now() - start) / 1000);
          renderer!.render(rig!.scene, rig!.camera);
          gl.endFrameEXP();
          if (!presented) { presented = true; live.current.onReady(); }
          if (live.current.animated !== false) timer = setTimeout(draw, 1000 / 30);
        } catch { dispose(); live.current.onFailure(); }
      };
      runtime.current = { draw, dispose };
      draw();
    } catch { dispose(); live.current.onFailure(); }
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    // Recreate resources after React Strict Mode's effect replay, when the
    // native surface itself is still mounted with the same GL context.
    if (contextRef.current && !runtime.current) onContextCreate(contextRef.current);
    return () => { mounted.current = false; runtime.current?.dispose(); runtime.current = null; };
  }, [onContextCreate]);
  return <GLView pointerEvents="none" accessible={false} style={{ width: props.size, height: props.size }} msaaSamples={2} onContextCreate={onContextCreate} />;
}
