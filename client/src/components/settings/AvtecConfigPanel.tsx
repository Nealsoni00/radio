import { useEffect, useState, useCallback } from 'react';
import {
  getAvtecStatus,
  getAvtecConfig,
  updateAvtecConfig,
  resetAvtecStats,
  type AvtecStatus,
  type AvtecConfig,
} from '../../services/api';

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

export function AvtecConfigPanel() {
  const [status, setStatus] = useState<AvtecStatus | null>(null);
  const [config, setConfig] = useState<AvtecConfig | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editHost, setEditHost] = useState('');
  const [editPort, setEditPort] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusData, configData] = await Promise.all([
        getAvtecStatus(),
        getAvtecConfig(),
      ]);
      setStatus(statusData);
      setConfig(configData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch Avtec status');
      console.error('Failed to fetch Avtec data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleEnabled = async () => {
    if (!config) return;
    try {
      setIsSaving(true);
      const result = await updateAvtecConfig({ enabled: !config.enabled });
      setConfig(result.config);
      setError(null);
    } catch (err) {
      setError('Failed to toggle Avtec');
      console.error('Failed to toggle Avtec:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = () => {
    if (config) {
      setEditHost(config.targetHost);
      setEditPort(String(config.targetPort));
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditHost('');
    setEditPort('');
  };

  const handleSaveConfig = async () => {
    const port = parseInt(editPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      setError('Invalid port number (1-65535)');
      return;
    }

    try {
      setIsSaving(true);
      const result = await updateAvtecConfig({
        targetHost: editHost,
        targetPort: port,
      });
      setConfig(result.config);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setError('Failed to save config');
      console.error('Failed to save Avtec config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetStats = async () => {
    try {
      await resetAvtecStats();
      await fetchData();
    } catch (err) {
      console.error('Failed to reset stats:', err);
    }
  };

  // Status indicator color
  const getStatusColor = (): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!status) return 'gray';
    if (!status.enabled) return 'gray';
    if (status.connected && status.stats.lastPacketTime &&
        Date.now() - status.stats.lastPacketTime < 10000) {
      return 'green';
    }
    if (status.connected) return 'yellow';
    return 'red';
  };

  const statusColor = getStatusColor();
  const colorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-slate-500',
  };

  const getStatusText = (): string => {
    if (!status) return 'Loading...';
    if (!status.enabled) return 'Disabled';
    if (status.connected && status.stats.lastPacketTime &&
        Date.now() - status.stats.lastPacketTime < 10000) {
      return 'Streaming';
    }
    if (status.connected) return 'Connected (idle)';
    return 'Disconnected';
  };

  // Format packets per second
  const getPacketsPerSec = (): string => {
    if (!status || status.uptime === 0) return '0';
    const pps = (status.stats.packetsUdpSent / (status.uptime / 1000));
    if (pps >= 1) return pps.toFixed(0);
    return pps.toFixed(1);
  };

  return (
    <div className="relative">
      {/* Compact status indicator with inline stats (always visible) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 hover:bg-slate-700/50 px-2 py-1 rounded transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${colorClasses[statusColor]} ${statusColor === 'green' ? 'animate-pulse' : ''}`} />
          <span className="text-slate-400 text-xs">Avtec</span>
        </div>
        {/* Inline status info */}
        {status && (
          <div className="flex items-center gap-2 text-xs">
            <span className={
              statusColor === 'green' ? 'text-green-400' :
              statusColor === 'yellow' ? 'text-yellow-400' :
              statusColor === 'red' ? 'text-red-400' :
              'text-slate-500'
            }>
              {getStatusText()}
            </span>
            {status.enabled && status.connected && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">
                  <span className="text-white">{status.stats.packetsUdpSent.toLocaleString()}</span> pkts
                </span>
                <span className="text-slate-400">
                  <span className="text-white">{formatBytes(status.stats.bytesUdpSent)}</span>
                </span>
                {status.stats.callsStarted > 0 && (
                  <span className="text-slate-400">
                    <span className="text-cyan-400">{status.stats.callsStarted}</span> calls
                  </span>
                )}
              </>
            )}
          </div>
        )}
        <span className="text-xs text-slate-500">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50">
          <div className="p-4">
            {/* Header with toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-white">Avtec Integration</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  statusColor === 'green' ? 'bg-green-900/50 text-green-400' :
                  statusColor === 'yellow' ? 'bg-yellow-900/50 text-yellow-400' :
                  statusColor === 'red' ? 'bg-red-900/50 text-red-400' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {getStatusText()}
                </span>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={isSaving}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config?.enabled ? 'bg-green-600' : 'bg-slate-600'
                } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  config?.enabled ? 'translate-x-7' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {error && (
              <div className="mb-3 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Configuration */}
            <div className="mb-4 p-3 bg-slate-900/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-medium">Target</span>
                {!isEditing && (
                  <button
                    onClick={handleStartEdit}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editHost}
                      onChange={(e) => setEditHost(e.target.value)}
                      placeholder="Host"
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                    />
                    <input
                      type="text"
                      value={editPort}
                      onChange={(e) => setEditPort(e.target.value)}
                      placeholder="Port"
                      className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveConfig}
                      disabled={isSaving}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-white font-mono text-sm">
                  {config?.targetHost}:{config?.targetPort}
                </div>
              )}
            </div>

            {/* Status and Stats */}
            {status && (
              <div className="space-y-3">
                {/* Connection info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">TCP:</span>
                    <span className={status.connected ? 'text-green-400' : 'text-red-400'}>
                      {status.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Uptime:</span>
                    <span className="text-white">{formatUptime(status.uptime)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Active:</span>
                    <span className="text-white">{status.activeCalls} calls</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Last packet:</span>
                    <span className="text-white">{formatTime(status.stats.lastPacketTime)}</span>
                  </div>
                </div>

                {/* Stats table */}
                <div className="border-t border-slate-700 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 font-medium">Statistics</span>
                    <button
                      onClick={handleResetStats}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">UDP sent:</span>
                      <span className="text-white">{status.stats.packetsUdpSent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">TCP sent:</span>
                      <span className="text-white">{status.stats.packetsTcpSent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Data sent:</span>
                      <span className="text-white">{formatBytes(status.stats.bytesUdpSent + status.stats.bytesTcpSent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Calls:</span>
                      <span className="text-white">{status.stats.callsStarted}</span>
                    </div>
                    {(status.stats.udpErrors > 0 || status.stats.tcpErrors > 0) && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">UDP errors:</span>
                          <span className="text-red-400">{status.stats.udpErrors}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">TCP errors:</span>
                          <span className="text-red-400">{status.stats.tcpErrors}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Last error */}
                {status.stats.lastError && (
                  <div className="border-t border-slate-700 pt-3">
                    <div className="text-xs text-slate-400 mb-1">Last Error:</div>
                    <div className="text-xs text-red-400 font-mono bg-red-900/20 px-2 py-1 rounded">
                      {status.stats.lastError}
                      <span className="text-slate-500 ml-2">
                        ({formatTime(status.stats.lastErrorTime)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
