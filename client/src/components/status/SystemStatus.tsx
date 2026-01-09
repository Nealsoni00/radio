import { useEffect, useState } from 'react';
import { useConnectionStore } from '../../store';
import { getHealth } from '../../services/api';

export function SystemStatus() {
  const { isConnected, decodeRate } = useConnectionStore();
  const [health, setHealth] = useState<{
    trunkRecorder: boolean;
    fileWatcher: boolean;
    audioReceiver: boolean;
    clients: number;
  } | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await getHealth();
        setHealth({
          trunkRecorder: data.trunkRecorder,
          fileWatcher: data.fileWatcher ?? true,
          audioReceiver: data.audioReceiver,
          clients: data.clients,
        });
      } catch {
        setHealth(null);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-4 py-3 bg-slate-800 border-t border-slate-700">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <StatusIndicator
            label="WebSocket"
            status={isConnected}
          />
          <StatusIndicator
            label="Recording"
            status={health?.trunkRecorder ?? false}
          />
          <StatusIndicator
            label="Audio RX"
            status={health?.audioReceiver ?? false}
          />
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Decode: <span className="text-white">{decodeRate.toFixed(1)}%</span></span>
          {health && (
            <span>Clients: <span className="text-white">{health.clients}</span></span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIndicator({ label, status }: { label: string; status: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          status ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}
