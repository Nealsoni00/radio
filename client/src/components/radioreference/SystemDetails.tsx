import { useState } from 'react';
import { useRadioReferenceStore } from '../../store/radioreference';

function formatFrequency(hz: number): string {
  return (hz / 1000000).toFixed(5) + ' MHz';
}

export function SystemDetails() {
  const {
    systemDetails,
    isLoadingDetails,
    selectedSystems,
    addSelectedSystem,
    removeSelectedSystem,
  } = useRadioReferenceStore();

  const [activeTab, setActiveTab] = useState<'info' | 'sites' | 'talkgroups'>('info');
  const [tgFilter, setTgFilter] = useState('');

  if (isLoadingDetails) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p>Loading system details...</p>
        </div>
      </div>
    );
  }

  if (!systemDetails) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>Select a system to view details</p>
        </div>
      </div>
    );
  }

  const { system, sites, frequencies, talkgroups } = systemDetails;
  const isSelected = selectedSystems.some((s) => s.id === system.id);

  const filteredTalkgroups = tgFilter
    ? talkgroups.filter(
        (tg) =>
          tg.alphaTag?.toLowerCase().includes(tgFilter.toLowerCase()) ||
          tg.description?.toLowerCase().includes(tgFilter.toLowerCase()) ||
          tg.talkgroupId.toString().includes(tgFilter)
      )
    : talkgroups;

  // Group frequencies by site
  const freqsBySite = frequencies.reduce(
    (acc, freq) => {
      const siteName = freq.siteName || 'Unknown Site';
      if (!acc[siteName]) acc[siteName] = [];
      acc[siteName].push(freq);
      return acc;
    },
    {} as Record<string, typeof frequencies>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{system.name}</h2>
            <p className="text-sm text-slate-400">
              {system.stateName} {system.countyName && `- ${system.countyName}`}
            </p>
          </div>
          <button
            onClick={() =>
              isSelected ? removeSelectedSystem(system.id) : addSelectedSystem(system.id)
            }
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            {isSelected ? 'Selected' : 'Add to My Systems'}
          </button>
        </div>

        {/* System badges */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="px-2 py-0.5 bg-green-900/50 text-green-300 text-xs rounded border border-green-700/50">
            {system.type}
          </span>
          {system.flavor && (
            <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
              {system.flavor}
            </span>
          )}
          {system.voice && (
            <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
              {system.voice}
            </span>
          )}
        </div>

        {/* System IDs */}
        {(system.wacn || system.systemId || system.nac) && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {system.wacn && (
              <div className="bg-slate-700/50 p-2 rounded">
                <div className="text-slate-400">WACN</div>
                <div className="text-slate-200 font-mono">{system.wacn}</div>
              </div>
            )}
            {system.systemId && (
              <div className="bg-slate-700/50 p-2 rounded">
                <div className="text-slate-400">System ID</div>
                <div className="text-slate-200 font-mono">{system.systemId}</div>
              </div>
            )}
            {system.nac && (
              <div className="bg-slate-700/50 p-2 rounded">
                <div className="text-slate-400">NAC</div>
                <div className="text-slate-200 font-mono">{system.nac}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'info'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Info
        </button>
        <button
          onClick={() => setActiveTab('sites')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'sites'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Sites ({sites.length})
        </button>
        <button
          onClick={() => setActiveTab('talkgroups')}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'talkgroups'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Talkgroups ({talkgroups.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Statistics</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-2xl font-bold text-slate-100">{sites.length}</div>
                  <div className="text-xs text-slate-400">Sites</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-2xl font-bold text-slate-100">{frequencies.length}</div>
                  <div className="text-xs text-slate-400">Frequencies</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-2xl font-bold text-slate-100">{talkgroups.length}</div>
                  <div className="text-xs text-slate-400">Talkgroups</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-2xl font-bold text-slate-100">
                    {frequencies.filter((f) => f.channelType === 'control').length}
                  </div>
                  <div className="text-xs text-slate-400">Control Channels</div>
                </div>
              </div>
            </div>

            {system.description && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Description</h3>
                <p className="text-sm text-slate-400">{system.description}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Control Channels</h3>
              <div className="space-y-1">
                {frequencies
                  .filter((f) => f.channelType === 'control')
                  .map((freq, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-700/50 px-3 py-2 rounded text-sm"
                    >
                      <span className="font-mono text-slate-200">{formatFrequency(freq.frequency)}</span>
                      <span className="text-xs text-slate-400">{freq.siteName}</span>
                    </div>
                  ))}
                {frequencies.filter((f) => f.channelType === 'control').length === 0 && (
                  <p className="text-sm text-slate-500">No control channels found</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sites' && (
          <div className="space-y-4">
            {Object.entries(freqsBySite).map(([siteName, siteFreqs]) => (
              <div key={siteName} className="bg-slate-700/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-slate-200 mb-2">{siteName}</h4>
                <div className="space-y-1">
                  {siteFreqs.map((freq, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-slate-300">{formatFrequency(freq.frequency)}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          freq.channelType === 'control'
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-slate-600 text-slate-300'
                        }`}
                      >
                        {freq.channelType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {sites.length === 0 && (
              <p className="text-sm text-slate-500 text-center">No site information available</p>
            )}
          </div>
        )}

        {activeTab === 'talkgroups' && (
          <div className="space-y-3">
            {/* Search filter */}
            <input
              type="text"
              value={tgFilter}
              onChange={(e) => setTgFilter(e.target.value)}
              placeholder="Filter talkgroups..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Talkgroup list */}
            <div className="space-y-1">
              {filteredTalkgroups.map((tg, idx) => (
                <div
                  key={`${tg.talkgroupId}-${idx}`}
                  className="bg-slate-700/30 rounded px-3 py-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        {tg.alphaTag || `TG ${tg.talkgroupId}`}
                      </div>
                      {tg.description && (
                        <div className="text-xs text-slate-400 mt-0.5">{tg.description}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-slate-400">{tg.talkgroupId}</div>
                      {tg.tag && (
                        <div className="text-xs text-slate-500 mt-0.5">{tg.tag}</div>
                      )}
                    </div>
                  </div>
                  {(tg.category || tg.mode) && (
                    <div className="mt-1 flex gap-2">
                      {tg.category && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-600 text-slate-300 rounded">
                          {tg.category}
                        </span>
                      )}
                      {tg.mode && tg.mode !== 'D' && (
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded">
                          {tg.mode === 'E' ? 'Encrypted' : tg.mode}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredTalkgroups.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  {tgFilter ? 'No matching talkgroups' : 'No talkgroups available'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
