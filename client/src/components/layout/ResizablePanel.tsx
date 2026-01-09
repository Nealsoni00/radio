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
      setSize(newSize);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, handlePosition, minSize, maxSize]);

  const isHorizontal = direction === 'horizontal';
  const sizeStyle = isHorizontal ? { width: size } : { height: size };

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
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
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
  className?: string;
}

export function ResizeHandle({ direction, onDrag, className = '' }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - lastPos.current;
      lastPos.current = currentPos;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, onDrag]);

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
