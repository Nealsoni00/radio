import { useEffect, useRef, useCallback } from 'react';
import { useFFTStore } from '../../store/fft';

interface SpectrumDisplayProps {
  height?: number;
  backgroundColor?: string;
  lineColor?: string;
  gridColor?: string;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function SpectrumDisplay({
  height = 200,
  backgroundColor = '#0f172a',
  lineColor = '#22c55e',
  gridColor = '#334155',
  showGrid = true,
  showLabels = true,
}: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  const { currentFFT, minDb, maxDb } = useFFTStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // Clear
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, displayHeight);

    if (!currentFFT) {
      // Draw placeholder text
      ctx.fillStyle = '#64748b';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for spectrum data...', width / 2, displayHeight / 2);
      return;
    }

    const { magnitudes, fftSize, minFreq, maxFreq } = currentFFT;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;

      // Horizontal grid (dB levels)
      const dbStep = 20;
      for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
        const y = displayHeight - ((db - minDb) / (maxDb - minDb)) * displayHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        if (showLabels) {
          ctx.fillStyle = '#64748b';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${db} dB`, 5, y - 2);
        }
      }

      // Vertical grid (frequency)
      const freqRange = maxFreq - minFreq;
      const freqStep = Math.pow(10, Math.floor(Math.log10(freqRange / 5)));
      for (let f = Math.ceil(minFreq / freqStep) * freqStep; f < maxFreq; f += freqStep) {
        const x = ((f - minFreq) / freqRange) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, displayHeight);
        ctx.stroke();

        if (showLabels) {
          const freqMHz = (f / 1e6).toFixed(2);
          ctx.textAlign = 'center';
          ctx.fillText(`${freqMHz}`, x, displayHeight - 5);
        }
      }
    }

    // Draw spectrum line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < fftSize; i++) {
      const x = (i / fftSize) * width;
      const db = magnitudes[i];
      const normalizedDb = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
      const y = displayHeight - normalizedDb * displayHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw fill under curve
    ctx.globalAlpha = 0.2;
    ctx.lineTo(width, displayHeight);
    ctx.lineTo(0, displayHeight);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
    gradient.addColorStop(0, lineColor);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [currentFFT, minDb, maxDb, backgroundColor, lineColor, gridColor, showGrid, showLabels]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      ctx?.scale(dpr, dpr);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full rounded-lg" style={{ height }} />
    </div>
  );
}
