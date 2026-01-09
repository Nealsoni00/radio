export function formatFrequency(hz: number): string {
  const mhz = hz / 1000000;
  return mhz.toFixed(5) + ' MHz';
}

export function formatTimestamp(unixTime: number): string {
  const date = new Date(unixTime * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(unixTime: number): string {
  const date = new Date(unixTime * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--';
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function formatElapsed(startTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - startTime;
  return formatDuration(elapsed);
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getTagColor(tag: string | null | undefined): string {
  if (!tag) return 'bg-gray-600';

  const tagLower = tag.toLowerCase();
  if (tagLower.includes('dispatch')) return 'bg-blue-600';
  if (tagLower.includes('tac')) return 'bg-purple-600';
  if (tagLower.includes('talk')) return 'bg-green-600';
  if (tagLower.includes('fire')) return 'bg-red-600';
  if (tagLower.includes('ems')) return 'bg-orange-600';
  if (tagLower.includes('law')) return 'bg-blue-700';
  if (tagLower.includes('interop')) return 'bg-yellow-600';
  return 'bg-gray-600';
}
