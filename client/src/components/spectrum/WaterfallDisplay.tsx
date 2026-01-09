import { useEffect, useRef, useCallback } from 'react';
import { useFFTStore, type ColorScheme } from '../../store/fft';

// Color maps for waterfall
const colorMaps: Record<ColorScheme, (t: number) => [number, number, number]> = {
  viridis: (t) => {
    // Viridis-like colormap: purple -> blue -> green -> yellow
    const r = Math.round(255 * Math.max(0, Math.min(1, -0.35 + 2.5 * t)));
    const g = Math.round(255 * Math.max(0, Math.min(1, Math.sin(t * Math.PI * 0.95))));
    const b = Math.round(255 * Math.max(0, Math.min(1, 0.85 - 0.85 * t)));
    return [r, g, b];
  },
  plasma: (t) => {
    // Plasma-like: dark purple -> magenta -> orange -> yellow
    const r = Math.round(255 * Math.max(0, Math.min(1, 0.1 + 1.2 * t)));
    const g = Math.round(255 * Math.max(0, Math.min(1, -0.3 + 1.5 * t)));
    const b = Math.round(255 * Math.max(0, Math.min(1, 0.9 - 0.9 * t + 0.4 * Math.sin(t * Math.PI))));
    return [r, g, b];
  },
  grayscale: (t) => {
    const v = Math.round(255 * t);
    return [v, v, v];
  },
  classic: (t) => {
    // Classic SDR blue->cyan->green->yellow->red
    if (t < 0.25) {
      const s = t / 0.25;
      return [0, Math.round(255 * s), 255];
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return [0, 255, Math.round(255 * (1 - s))];
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return [Math.round(255 * s), 255, 0];
    } else {
      const s = (t - 0.75) / 0.25;
      return [255, Math.round(255 * (1 - s)), 0];
    }
  },
};

interface WaterfallDisplayProps {
  height?: number;
}

export function WaterfallDisplay({ height = 200 }: WaterfallDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const lastUpdateCount = useRef<number>(0);

  const { waterfallHistory, minDb, maxDb, colorScheme, currentFFT, updateCount } = useFFTStore();
  const colorMap = colorMaps[colorScheme];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waterfallHistory.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: canvasHeight } = canvas;
    const fftSize = waterfallHistory[0].length;

    // Check if we have new data
    if (updateCount === lastUpdateCount.current) {
      return; // No new data
    }
    lastUpdateCount.current = updateCount;

    // Create or reuse ImageData
    if (
      !imageDataRef.current ||
      imageDataRef.current.width !== width ||
      imageDataRef.current.height !== canvasHeight
    ) {
      imageDataRef.current = ctx.createImageData(width, canvasHeight);
      // Fill with black initially
      for (let i = 0; i < imageDataRef.current.data.length; i += 4) {
        imageDataRef.current.data[i] = 0;
        imageDataRef.current.data[i + 1] = 0;
        imageDataRef.current.data[i + 2] = 0;
        imageDataRef.current.data[i + 3] = 255;
      }
    }
    const imageData = imageDataRef.current;

    // Scroll existing content up by one row
    const rowBytes = width * 4;
    imageData.data.copyWithin(0, rowBytes, canvasHeight * rowBytes);

    // Draw newest row at bottom
    const latestFFT = waterfallHistory[waterfallHistory.length - 1];
    const y = canvasHeight - 1;

    for (let x = 0; x < width; x++) {
      const fftIndex = Math.floor((x / width) * fftSize);
      const db = latestFFT[fftIndex];
      const normalized = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));

      const [r, g, b] = colorMap(normalized);
      const pixelIndex = (y * width + x) * 4;

      imageData.data[pixelIndex] = r;
      imageData.data[pixelIndex + 1] = g;
      imageData.data[pixelIndex + 2] = b;
      imageData.data[pixelIndex + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [waterfallHistory, minDb, maxDb, colorMap, updateCount]);

  useEffect(() => {
    draw();
  }, [draw, updateCount]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = height;
      imageDataRef.current = null; // Force recreation
      lastUpdateCount.current = 0; // Force redraw
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full rounded-lg" style={{ height }} />
      {!currentFFT && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          Waiting for spectrum data...
        </div>
      )}
    </div>
  );
}
