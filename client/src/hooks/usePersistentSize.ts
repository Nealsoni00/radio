import { useState, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants';

/**
 * Hook for managing panel sizes with localStorage persistence.
 *
 * @param key - Storage key suffix (will be prefixed with 'panel-size-')
 * @param defaultSize - Default size in pixels
 * @param minSize - Minimum allowed size
 * @param maxSize - Maximum allowed size
 * @returns Tuple of [currentSize, updateSizeByDelta]
 *
 * @example
 * const [width, updateWidth] = usePersistentSize('sidebar', 288, 200, 500);
 * // In resize handler:
 * updateWidth(deltaX); // Positive increases, negative decreases
 */
export function usePersistentSize(
  key: string,
  defaultSize: number,
  minSize: number,
  maxSize: number
): [number, (delta: number) => void] {
  const storageKey = `${STORAGE_KEYS.PANEL_SIZE_PREFIX}${key}`;

  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
        return parsed;
      }
    }
    return defaultSize;
  });

  const updateSize = useCallback(
    (delta: number) => {
      setSize((prev) => {
        const newSize = Math.min(maxSize, Math.max(minSize, prev + delta));
        localStorage.setItem(storageKey, newSize.toString());
        return newSize;
      });
    },
    [storageKey, minSize, maxSize]
  );

  return [size, updateSize];
}
