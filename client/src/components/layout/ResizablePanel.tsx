import { useRef, useCallback, useEffect, useState } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  direction: 'horizontal' | 'vertical';
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  storageKey?: string;
  handlePosition?: 'start' | 'end';
  className?: string;
  onResize?: (size: number) => void;
  deferResize?: boolean; // Only apply size on drag end
}

/**
 * A resizable panel component with drag handles.
 *
 * @param direction - 'horizontal' for width resizing, 'vertical' for height resizing
 * @param defaultSize - Default size in pixels
 * @param minSize - Minimum size in pixels (default: 100)
 * @param maxSize - Maximum size in pixels (default: 800)
 * @param storageKey - Optional localStorage key to persist size
 * @param handlePosition - Position of the drag handle ('start' or 'end')
 * @param className - Additional CSS classes
 * @param onResize - Callback when size changes
 * @param deferResize - If true, only apply size on mouse up (shows preview during drag)
 */
export function ResizablePanel({
  children,
  direction,
  defaultSize,
  minSize = 100,
  maxSize = 800,
  storageKey,
  handlePosition = 'end',
  className = '',
  onResize,
  deferResize = false,
}: ResizablePanelProps) {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`panel-size-${storageKey}`);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
          return parsed;
        }
      }
    }
    return defaultSize;
  });

  // Preview size shown during deferred drag
  const [previewSize, setPreviewSize] = useState<number | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  // Save size to localStorage when it changes
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`panel-size-${storageKey}`, size.toString());
    }
    onResize?.(size);
  }, [size, storageKey, onResize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, size]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      let delta = currentPos - startPos.current;

      // Invert delta for 'start' position handles
      if (handlePosition === 'start') {
        delta = -delta;
      }

      const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta));

      if (deferResize) {
        setPreviewSize(newSize);
      } else {
        setSize(newSize);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Apply the preview size on mouse up if deferred
        if (deferResize && previewSize !== null) {
          setSize(previewSize);
          setPreviewSize(null);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, handlePosition, minSize, maxSize, deferResize, previewSize]);

  const isHorizontal = direction === 'horizontal';
  const displaySize = previewSize !== null ? previewSize : size;
  const sizeStyle = isHorizontal ? { width: displaySize } : { height: displaySize };

  const handleClasses = isHorizontal
    ? 'w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600'
    : 'h-1 cursor-row-resize hover:bg-blue-500 active:bg-blue-600';

  const handleElement = (
    <div
      className={`${handleClasses} bg-slate-700 transition-colors flex-shrink-0 z-10`}
      onMouseDown={handleMouseDown}
    />
  );

  return (
    <div
      ref={panelRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className} ${previewSize !== null ? 'opacity-80' : ''}`}
      style={sizeStyle}
    >
      {handlePosition === 'start' && handleElement}
      <div className={`flex-1 overflow-hidden ${isHorizontal ? '' : ''}`}>
        {children}
      </div>
      {handlePosition === 'end' && handleElement}
    </div>
  );
}

/**
 * A simple resize handle that can be placed between panels.
 * Use this when you need more control over layout.
 */
interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
  onDragEnd?: () => void;
  className?: string;
  deferResize?: boolean;
}

export function ResizeHandle({ direction, onDrag, onDragEnd, className = '', deferResize = false }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastPos = useRef(0);
  const totalDelta = useRef(0);
  const onDragRef = useRef(onDrag);
  const onDragEndRef = useRef(onDragEnd);

  // Keep the callback refs up to date
  useEffect(() => {
    onDragRef.current = onDrag;
    onDragEndRef.current = onDragEnd;
  }, [onDrag, onDragEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    totalDelta.current = 0;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - lastPos.current;
      lastPos.current = currentPos;
      totalDelta.current += delta;

      if (!deferResize) {
        onDragRef.current(delta);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (deferResize && totalDelta.current !== 0) {
          onDragRef.current(totalDelta.current);
        }
        onDragEndRef.current?.();
        totalDelta.current = 0;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, deferResize]);

  const isHorizontal = direction === 'horizontal';
  const handleClasses = isHorizontal
    ? 'w-1.5 cursor-col-resize'
    : 'h-1.5 cursor-row-resize';

  return (
    <div
      className={`${handleClasses} bg-slate-700 hover:bg-blue-500 active:bg-blue-600 transition-colors flex-shrink-0 z-10 ${className}`}
      onMouseDown={handleMouseDown}
    >
      {/* Visual grip indicator */}
      <div className={`w-full h-full flex items-center justify-center ${isHorizontal ? 'flex-col' : 'flex-row'}`}>
        <div className={`${isHorizontal ? 'w-0.5 h-8' : 'w-8 h-0.5'} bg-slate-500 rounded-full opacity-50`} />
      </div>
    </div>
  );
}

/**
 * Corner resize handle for 2D resizing (width and height simultaneously).
 * Place this in the bottom-right corner of a panel.
 */
interface CornerResizeHandleProps {
  onResize: (deltaWidth: number, deltaHeight: number) => void;
  onResizeEnd?: () => void;
  className?: string;
  deferResize?: boolean;
}

export function CornerResizeHandle({ onResize, onResizeEnd, className = '', deferResize = false }: CornerResizeHandleProps) {
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const totalDelta = useRef({ x: 0, y: 0 });
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);

  useEffect(() => {
    onResizeRef.current = onResize;
    onResizeEndRef.current = onResizeEnd;
  }, [onResize, onResizeEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    totalDelta.current = { x: 0, y: 0 };
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - lastPos.current.x;
      const deltaY = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      totalDelta.current.x += deltaX;
      totalDelta.current.y += deltaY;

      if (!deferResize) {
        onResizeRef.current(deltaX, deltaY);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (deferResize && (totalDelta.current.x !== 0 || totalDelta.current.y !== 0)) {
          onResizeRef.current(totalDelta.current.x, totalDelta.current.y);
        }
        onResizeEndRef.current?.();
        totalDelta.current = { x: 0, y: 0 };
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [deferResize]);

  return (
    <div
      className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 group ${className}`}
      onMouseDown={handleMouseDown}
    >
      {/* Corner resize icon */}
      <svg
        className="w-full h-full text-slate-500 group-hover:text-blue-400 transition-colors"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M14 14H12V12H14V14ZM14 10H12V8H14V10ZM10 14H8V12H10V14Z" />
      </svg>
    </div>
  );
}
