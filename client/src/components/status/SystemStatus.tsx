import { useEffect, useState } from 'react';
import { useConnectionStore, useAudioStore, useCallsStore } from '../../store';
import { useFFTStore } from '../../store/fft';
import { getHealth } from '../../services/api';

function formatFrequency(freq: number): string {
  return (freq / 1000000).toFixed(3);
}

export function SystemStatus() {
  const { isConnected, decodeRate } = useConnectionStore();
  const { sdrConfig, isLiveEnabled, liveStream, audioQueue, fetchSDRConfig } = useAudioStore();
  const { isEnabled: fftEnabled, currentFFT } = useFFTStore();
  const { calls } = useCallsStore();
  const [health, setHealth] = useState<{
    trunkRecorder: boolean;
    fileWatcher: boolean;
    fileWatcherActive: boolean;
    audioReceiver: boolean;
    clients: number;
  } | null>(null);
  const [serverReachable, setServerReachable] = useState(false);

  // Fetch SDR config on mount
  useEffect(() => {
    fetchSDRConfig();
  }, [fetchSDRConfig]);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await getHealth();
        setServerReachable(true);
        setHealth({
          trunkRecorder: data.trunkRecorder,
          fileWatcher: data.fileWatcher ?? true,
          fileWatcherActive: data.fileWatcherActive ?? false,
          audioReceiver: data.audioReceiver,
          clients: data.clients,
        });
      } catch {
        setServerReachable(false);
        setHealth(null);
      }
    };

    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 5000);
    return () => {
      clearInterval(healthInterval);
    };
  }, []);

  // SDR status is determined by whether we're receiving FFT data from trunk-recorder
  // This avoids running rtl_test which can kick trunk-recorder off the SDR device
  const sdrActive = currentFFT !== null;

  // Determine Live Audio status color
  const getLiveAudioColor = (): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!isLiveEnabled) return 'gray';
    if (!isConnected || !serverReachable) return 'red';
    if (liveStream) return 'green';
    return 'yellow';
  };

  // Determine FFT status color
  const getFFTColor = (): 'green' | 'red' | 'gray' => {
    if (!fftEnabled) return 'gray';
    if (!isConnected || !serverReachable) return 'red';
    return 'green';
  };

  return (
    <div className="px-4 py-2 bg-slate-800 border-t border-slate-700">
      {/* Top row: Status indicators */}
      <div className="flex items-center justify-between text-xs mb-2">
        <div className="flex items-center gap-3">
          <StatusIndicator
            label="Server"
            status={serverReachable}
          />
          <StatusIndicator
            label="WebSocket"
            status={isConnected}
          />
          <StatusIndicator
            label="RTL-SDR"
            status={sdrActive}
            color={sdrActive ? 'green' : health?.trunkRecorder ? 'yellow' : 'red'}
          />
          <StatusIndicator
            label="Trunk Recorder"
            status={serverReachable && (health?.trunkRecorder ?? false)}
          />
          <StatusIndicator
            label="File Watcher"
            status={serverReachable && (health?.fileWatcherActive ?? false)}
          />
          <StatusIndicator
            label="Audio RX"
            status={serverReachable && (health?.audioReceiver ?? false)}
          />
          <StatusIndicator
            label="Live Audio"
            status={isLiveEnabled && isConnected}
            color={getLiveAudioColor()}
          />
          <StatusIndicator
            label="FFT"
            status={fftEnabled && isConnected}
            color={getFFTColor()}
          />
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          {serverReachable ? (
            <>
              <span>Decode: <span className={decodeRate > 80 ? 'text-green-400' : decodeRate > 50 ? 'text-yellow-400' : 'text-red-400'}>{decodeRate.toFixed(1)}%</span></span>
              <span>Calls: <span className="text-white">{calls.length}</span></span>
              {audioQueue.length > 0 && (
                <span>Queue: <span className="text-blue-400">{audioQueue.length}</span></span>
              )}
              {health && (
                <span>Clients: <span className="text-white">{health.clients}</span></span>
              )}
            </>
          ) : (
            <span className="text-red-400">Server unreachable</span>
          )}
        </div>
      </div>

      {/* Bottom row: SDR devices and band info */}
      <div className="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
        <div className="flex items-center gap-4">
          {/* RTL-SDR Status - based on FFT data reception */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500">SDR:</span>
            {sdrActive ? (
              <span className="text-green-400">Receiving FFT data</span>
            ) : health?.trunkRecorder ? (
              <span className="text-yellow-400">Trunk-recorder running (no FFT yet)</span>
            ) : (
              <span className="text-red-400">Not connected</span>
            )}
          </div>
          {/* Band info separator */}
          {sdrConfig && (
            <>
              <div className="border-l border-slate-600 pl-4 flex items-center gap-2">
                <span className="text-slate-500">Band:</span>
                <span className="font-mono text-cyan-400">
                  {formatFrequency(sdrConfig.minFrequency)} - {formatFrequency(sdrConfig.maxFrequency)} MHz
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Center:</span>
                <span className="font-mono text-white">
                  {formatFrequency(sdrConfig.centerFrequency)} MHz
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">BW:</span>
                <span className="font-mono text-white">
                  {(sdrConfig.sampleRate / 1000000).toFixed(1)} MHz
                </span>
              </div>
            </>
          )}
          {!sdrConfig && serverReachable && (
            <span className="text-slate-500">Loading band config...</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {liveStream && isConnected && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-slate-400">Active:</span>
              <span className="text-green-400 font-medium">{liveStream.alphaTag || `TG ${liveStream.talkgroupId}`}</span>
              {liveStream.frequency && (
                <span className="font-mono text-slate-400">
                  @ {formatFrequency(liveStream.frequency)} MHz
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({
  label,
  status,
  color,
}: {
  label: string;
  status: boolean;
  color?: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const getColor = () => {
    if (color) {
      switch (color) {
        case 'green': return 'bg-green-500';
        case 'yellow': return 'bg-yellow-500';
        case 'red': return 'bg-red-500';
        case 'gray': return 'bg-slate-500';
      }
    }
    return status ? 'bg-green-500' : 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${getColor()}`} />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}
