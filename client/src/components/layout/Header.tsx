import { useConnectionStore, useAudioStore } from '../../store';
import { useSystemStore } from '../../store/system';

export function Header() {
  const { isConnected, decodeRate } = useConnectionStore();
  const { isLiveEnabled, setLiveEnabled, isPlaying } = useAudioStore();
  const { activeSystem } = useSystemStore();

  // Get a shorter display name for the active system
  const systemDisplayName = activeSystem
    ? activeSystem.name.split(',')[0].replace(' Trunking System', '').replace(' P25', '')
    : 'No System Active';

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Radio Scanner</h1>
          <span className={`text-sm ${activeSystem ? 'text-green-400' : 'text-slate-500'}`}>
            {systemDisplayName}
          </span>
        </div>

        <div className="flex items-center gap-6">
          {/* Live Audio Toggle */}
          <button
            onClick={() => setLiveEnabled(!isLiveEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              isLiveEnabled
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-green-300 animate-pulse' : isLiveEnabled ? 'bg-green-400' : 'bg-slate-500'
              }`}
            />
            <span className="text-sm font-medium">
              {isLiveEnabled ? (isPlaying ? 'Live' : 'Waiting...') : 'Audio Off'}
            </span>
          </button>

          {/* Decode Rate */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Decode:</span>
            <span className="text-white font-mono">{decodeRate.toFixed(1)}%</span>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-slate-300">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
