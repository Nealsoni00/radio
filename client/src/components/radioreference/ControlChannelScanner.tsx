import { useState, useEffect, useCallback } from 'react';
import {
  getControlChannelsForCounty,
  getControlChannelsForState,
  getScannerStatus,
  scanFrequencies,
  type ControlChannelScanResult,
  type SystemScanResult,
  type ScannerStatus,
  type ScanResults,
  type FrequencyScanResult,
} from '../../services/api';
import type { RRCounty, RRState } from '../../types';

interface ControlChannelScannerProps {
  countyId?: number | null;
  stateId?: number | null;
  onClose: () => void;
  onSelectSystem?: (systemId: number) => void;
}

function formatFrequency(hz: number): string {
  return `${(hz / 1_000_000).toFixed(5)} MHz`;
}

function SignalIndicator({ result }: { result: FrequencyScanResult | undefined }) {
  if (!result) {
    return <span className="text-xs text-slate-500">--</span>;
  }

  if (!result.inRange) {
    return (
      <span className="text-xs text-slate-500" title="Outside SDR range">
        Out of range
      </span>
    );
  }

  if (result.signalStrength === null) {
    return <span className="text-xs text-slate-500">No data</span>;
  }

  const strength = result.signalStrength;
  const snr = result.snr || 0;

  // Color based on signal quality
  let color = 'text-slate-500';
  let bgColor = 'bg-slate-600/50';
  let label = 'Weak';

  if (result.hasSignal) {
    color = 'text-green-400';
    bgColor = 'bg-green-600/50';
    label = 'Active';
  } else if (snr > 5) {
    color = 'text-yellow-400';
    bgColor = 'bg-yellow-600/50';
    label = 'Signal';
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs px-1.5 py-0.5 rounded ${bgColor} ${color}`}>
        {label}
      </span>
      <span className={`text-xs font-mono ${color}`} title={`SNR: ${snr.toFixed(1)} dB`}>
        {strength.toFixed(0)} dB
      </span>
    </div>
  );
}

export function ControlChannelScanner({
  countyId,
  stateId,
  onClose,
  onSelectSystem,
}: ControlChannelScannerProps) {
  const [controlChannels, setControlChannels] = useState<ControlChannelScanResult[]>([]);
  const [systems, setSystems] = useState<SystemScanResult[]>([]);
  const [location, setLocation] = useState<RRCounty | RRState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uniqueSystems, setUniqueSystems] = useState(0);
  const [totalSystems, setTotalSystems] = useState(0);
  const [groupBy, setGroupBy] = useState<'frequency' | 'system'>('system');

  // Live scanning state
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  const [scanResults, setScanResults] = useState<ScanResults | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);

  // Fetch database data
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        if (countyId) {
          const result = await getControlChannelsForCounty(countyId);
          setControlChannels(result.controlChannels);
          setSystems(result.systems);
          setLocation(result.county);
          setUniqueSystems(result.uniqueSystems);
          setTotalSystems(result.totalSystems);
        } else if (stateId) {
          const result = await getControlChannelsForState(stateId);
          setControlChannels(result.controlChannels);
          setSystems(result.systems);
          setLocation(result.state);
          setUniqueSystems(result.uniqueSystems);
          setTotalSystems(result.totalSystems);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [countyId, stateId]);

  // Check scanner status on mount
  useEffect(() => {
    async function checkScanner() {
      try {
        const status = await getScannerStatus();
        setScannerStatus(status);
      } catch {
        // Scanner not available, that's OK
      }
    }
    checkScanner();
  }, []);

  // Perform live scan
  const performScan = useCallback(async () => {
    if (controlChannels.length === 0) return;

    setIsScanning(true);
    try {
      const frequencies = controlChannels.map((ch) => ch.frequency);
      const results = await scanFrequencies(frequencies);
      setScanResults(results);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [controlChannels]);

  // Auto-scan interval
  useEffect(() => {
    if (!autoScan || controlChannels.length === 0) return;

    // Initial scan
    performScan();

    // Scan every 2 seconds
    const interval = setInterval(performScan, 2000);
    return () => clearInterval(interval);
  }, [autoScan, performScan, controlChannels.length]);

  // Get scan result for a specific frequency
  const getScanResult = useCallback(
    (frequency: number): FrequencyScanResult | undefined => {
      return scanResults?.results.find((r) => r.frequency === frequency);
    },
    [scanResults]
  );

  // Group channels by system
  const channelsBySystem = controlChannels.reduce((acc, ch) => {
    if (!acc[ch.systemId]) {
      acc[ch.systemId] = {
        systemName: ch.systemName,
        systemType: ch.systemType,
        nac: ch.nac,
        wacn: ch.wacn,
        channels: [],
      };
    }
    acc[ch.systemId].channels.push(ch);
    return acc;
  }, {} as Record<number, { systemName: string; systemType: string; nac?: string; wacn?: string; channels: ControlChannelScanResult[] }>);

  const locationName = location
    ? 'name' in location
      ? location.name
      : ''
    : '';

  const hasFrequencyData = controlChannels.length > 0;
  const scannerReady = scannerStatus?.ready;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">
              Control Channel Scanner
            </h2>
            <p className="text-sm text-slate-400">
              {locationName && `Scanning ${locationName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full mb-2" />
              <p>Loading system data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">
              <p>Error: {error}</p>
            </div>
          ) : systems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>No systems found in this area.</p>
              <p className="text-sm mt-2">
                Try selecting a different location.
              </p>
            </div>
          ) : (
            <>
              {/* Stats and Scanner Controls */}
              <div className="flex flex-wrap gap-2 mb-4 text-sm">
                <div className="bg-slate-700/50 px-3 py-2 rounded">
                  <span className="text-slate-400">Systems: </span>
                  <span className="text-blue-400 font-medium">{totalSystems}</span>
                </div>
                {hasFrequencyData && (
                  <div className="bg-slate-700/50 px-3 py-2 rounded">
                    <span className="text-slate-400">Control Channels: </span>
                    <span className="text-green-400 font-medium">{controlChannels.length}</span>
                  </div>
                )}
                {scanResults && (
                  <>
                    <div className="bg-slate-700/50 px-3 py-2 rounded">
                      <span className="text-slate-400">In Range: </span>
                      <span className="text-cyan-400 font-medium">{scanResults.inRangeCount}</span>
                    </div>
                    <div className="bg-slate-700/50 px-3 py-2 rounded">
                      <span className="text-slate-400">Active: </span>
                      <span className="text-green-400 font-medium">{scanResults.activeCount}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Scanner Status / Controls */}
              {hasFrequencyData && (
                <div className="bg-slate-700/30 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">Live Signal Scanner</h3>
                      {scannerStatus ? (
                        scannerReady ? (
                          <p className="text-xs text-green-400 mt-0.5">
                            SDR ready: {formatFrequency(scannerStatus.coverage!.minFreq)} - {formatFrequency(scannerStatus.coverage!.maxFreq)}
                          </p>
                        ) : (
                          <p className="text-xs text-yellow-400 mt-0.5">
                            Waiting for FFT data from trunk-recorder...
                          </p>
                        )
                      ) : (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Scanner not available
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={autoScan}
                          onChange={(e) => setAutoScan(e.target.checked)}
                          disabled={!scannerReady}
                          className="rounded"
                        />
                        Auto-scan
                      </label>
                      <button
                        onClick={performScan}
                        disabled={!scannerReady || isScanning}
                        className={`px-3 py-1.5 rounded text-sm font-medium ${
                          scannerReady
                            ? 'bg-green-600 hover:bg-green-500 text-white'
                            : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {isScanning ? 'Scanning...' : 'Scan Now'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* View toggles */}
              {hasFrequencyData && (
                <div className="flex justify-end gap-1 mb-3">
                  <button
                    onClick={() => setGroupBy('frequency')}
                    className={`px-3 py-1 rounded text-sm ${
                      groupBy === 'frequency'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    By Frequency
                  </button>
                  <button
                    onClick={() => setGroupBy('system')}
                    className={`px-3 py-1 rounded text-sm ${
                      groupBy === 'system'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    By System
                  </button>
                </div>
              )}

              {/* Warning if no frequency data */}
              {!hasFrequencyData && (
                <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 mb-4">
                  <p className="text-yellow-300 text-sm font-medium">
                    No frequency data available
                  </p>
                  <p className="text-yellow-200/70 text-xs mt-1">
                    Site and frequency data needs to be synced from RadioReference.
                    Click a system below to view its details and sync data.
                  </p>
                </div>
              )}

              {hasFrequencyData && groupBy === 'frequency' ? (
                /* Frequency list view */
                <div className="space-y-1">
                  {controlChannels
                    .slice()
                    .sort((a, b) => {
                      // Sort by signal strength if we have scan results
                      if (scanResults) {
                        const aResult = getScanResult(a.frequency);
                        const bResult = getScanResult(b.frequency);
                        const aActive = aResult?.hasSignal ? 1 : 0;
                        const bActive = bResult?.hasSignal ? 1 : 0;
                        if (aActive !== bActive) return bActive - aActive;
                        const aStrength = aResult?.signalStrength ?? -200;
                        const bStrength = bResult?.signalStrength ?? -200;
                        return bStrength - aStrength;
                      }
                      return a.frequency - b.frequency;
                    })
                    .map((ch, idx) => {
                      const scanResult = getScanResult(ch.frequency);
                      return (
                        <div
                          key={`${ch.frequency}-${ch.systemId}-${idx}`}
                          className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                            scanResult?.hasSignal
                              ? 'bg-green-900/30 hover:bg-green-900/40 border border-green-700/50'
                              : 'bg-slate-700/30 hover:bg-slate-700/50'
                          }`}
                          onClick={() => onSelectSystem?.(ch.systemId)}
                        >
                          <span className="font-mono text-green-400 w-36">
                            {formatFrequency(ch.frequency)}
                          </span>
                          {ch.isPrimary && (
                            <span className="text-xs bg-yellow-600/50 text-yellow-200 px-1.5 py-0.5 rounded">
                              PRIMARY
                            </span>
                          )}
                          <span className="text-slate-300 flex-1 truncate">
                            {ch.systemName}
                          </span>
                          <SignalIndicator result={scanResult} />
                        </div>
                      );
                    })}
                </div>
              ) : hasFrequencyData && groupBy === 'system' ? (
                /* System grouped view with frequencies */
                <div className="space-y-3">
                  {Object.entries(channelsBySystem)
                    .sort(([, a], [, b]) => {
                      // Sort systems by whether they have active channels
                      if (scanResults) {
                        const aActive = a.channels.some((ch) => getScanResult(ch.frequency)?.hasSignal);
                        const bActive = b.channels.some((ch) => getScanResult(ch.frequency)?.hasSignal);
                        if (aActive !== bActive) return bActive ? 1 : -1;
                      }
                      return a.systemName.localeCompare(b.systemName);
                    })
                    .map(([systemId, system]) => {
                      const hasActiveChannel = system.channels.some(
                        (ch) => getScanResult(ch.frequency)?.hasSignal
                      );
                      return (
                        <div
                          key={systemId}
                          className={`rounded-lg overflow-hidden ${
                            hasActiveChannel
                              ? 'bg-green-900/20 border border-green-700/50'
                              : 'bg-slate-700/30'
                          }`}
                        >
                          <div
                            className={`p-3 cursor-pointer ${
                              hasActiveChannel
                                ? 'bg-green-900/30 hover:bg-green-900/40'
                                : 'bg-slate-700/50 hover:bg-slate-700'
                            }`}
                            onClick={() => onSelectSystem?.(parseInt(systemId))}
                          >
                            <div className="flex items-center gap-2">
                              {hasActiveChannel && (
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              )}
                              <span className="font-medium text-slate-200">
                                {system.systemName}
                              </span>
                              <span className="text-xs bg-blue-600/50 text-blue-200 px-1.5 py-0.5 rounded">
                                {system.systemType}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-1 flex gap-3">
                              <span>{system.channels.length} control channels</span>
                              {system.nac && <span>NAC: {system.nac}</span>}
                              {system.wacn && <span>WACN: {system.wacn}</span>}
                            </div>
                          </div>
                          <div className="p-2 space-y-1">
                            {system.channels.map((ch, idx) => {
                              const scanResult = getScanResult(ch.frequency);
                              return (
                                <div
                                  key={`${ch.frequency}-${idx}`}
                                  className={`flex items-center gap-2 px-2 py-1 text-sm rounded ${
                                    scanResult?.hasSignal ? 'bg-green-900/20' : ''
                                  }`}
                                >
                                  <span className="font-mono text-green-400 w-36">
                                    {formatFrequency(ch.frequency)}
                                  </span>
                                  {ch.isPrimary && (
                                    <span className="text-xs bg-yellow-600/50 text-yellow-200 px-1 rounded">
                                      P
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-500 flex-1">{ch.siteName}</span>
                                  <SignalIndicator result={scanResult} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Systems list without frequency data */
                <div className="space-y-2">
                  {systems.map((system) => (
                    <div
                      key={system.id}
                      className="p-3 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50"
                      onClick={() => onSelectSystem?.(system.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">
                          {system.name}
                        </span>
                        <span className="text-xs bg-blue-600/50 text-blue-200 px-1.5 py-0.5 rounded">
                          {system.type}
                        </span>
                        {system.controlChannelCount > 0 && (
                          <span className="text-xs bg-green-600/50 text-green-200 px-1.5 py-0.5 rounded">
                            {system.controlChannelCount} CC
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex gap-3">
                        {system.nac && <span>NAC: {system.nac}</span>}
                        {system.wacn && <span>WACN: {system.wacn}</span>}
                        {system.systemId && <span>SysID: {system.systemId}</span>}
                        {!system.hasFrequencies && (
                          <span className="text-yellow-400">No frequencies synced</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            {scanResults && (
              <span>
                Last scan: {new Date(scanResults.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
