import { useState, useEffect } from 'react';
import {
  getControlChannelsForCounty,
  getControlChannelsForState,
  type ControlChannelScanResult,
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

export function ControlChannelScanner({
  countyId,
  stateId,
  onClose,
  onSelectSystem,
}: ControlChannelScannerProps) {
  const [controlChannels, setControlChannels] = useState<ControlChannelScanResult[]>([]);
  const [location, setLocation] = useState<RRCounty | RRState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uniqueSystems, setUniqueSystems] = useState(0);
  const [groupBy, setGroupBy] = useState<'frequency' | 'system'>('frequency');

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        if (countyId) {
          const result = await getControlChannelsForCounty(countyId);
          setControlChannels(result.controlChannels);
          setLocation(result.county);
          setUniqueSystems(result.uniqueSystems);
        } else if (stateId) {
          const result = await getControlChannelsForState(stateId);
          setControlChannels(result.controlChannels);
          setLocation(result.state);
          setUniqueSystems(result.uniqueSystems);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [countyId, stateId]);

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
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
              <p>Scanning for control channels...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-400">
              <p>Error: {error}</p>
            </div>
          ) : controlChannels.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p>No control channels found in this area.</p>
              <p className="text-sm mt-2">
                Try selecting a different county or check if system data has been synced.
              </p>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex gap-4 mb-4 text-sm">
                <div className="bg-slate-700/50 px-3 py-2 rounded">
                  <span className="text-slate-400">Frequencies: </span>
                  <span className="text-green-400 font-medium">{controlChannels.length}</span>
                </div>
                <div className="bg-slate-700/50 px-3 py-2 rounded">
                  <span className="text-slate-400">Systems: </span>
                  <span className="text-blue-400 font-medium">{uniqueSystems}</span>
                </div>
                <div className="flex-1" />
                <div className="flex gap-1">
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
              </div>

              {groupBy === 'frequency' ? (
                /* Frequency list view */
                <div className="space-y-1">
                  {controlChannels.map((ch, idx) => (
                    <div
                      key={`${ch.frequency}-${ch.systemId}-${idx}`}
                      className="flex items-center gap-3 p-2 bg-slate-700/30 rounded hover:bg-slate-700/50 cursor-pointer"
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
                      <span className="text-xs text-slate-500">{ch.siteName}</span>
                      {ch.nac && (
                        <span className="text-xs text-slate-500 font-mono">
                          NAC:{ch.nac}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* System grouped view */
                <div className="space-y-4">
                  {Object.entries(channelsBySystem).map(([systemId, system]) => (
                    <div
                      key={systemId}
                      className="bg-slate-700/30 rounded-lg overflow-hidden"
                    >
                      <div
                        className="p-3 bg-slate-700/50 cursor-pointer hover:bg-slate-700"
                        onClick={() => onSelectSystem?.(parseInt(systemId))}
                      >
                        <div className="flex items-center gap-2">
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
                        {system.channels.map((ch, idx) => (
                          <div
                            key={`${ch.frequency}-${idx}`}
                            className="flex items-center gap-2 px-2 py-1 text-sm"
                          >
                            <span className="font-mono text-green-400">
                              {formatFrequency(ch.frequency)}
                            </span>
                            {ch.isPrimary && (
                              <span className="text-xs bg-yellow-600/50 text-yellow-200 px-1 rounded">
                                P
                              </span>
                            )}
                            <span className="text-xs text-slate-500">{ch.siteName}</span>
                          </div>
                        ))}
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
          <p className="text-xs text-slate-500">
            Click a frequency or system to view details
          </p>
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
