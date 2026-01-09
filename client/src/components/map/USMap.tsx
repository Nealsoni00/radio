import { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { RRState } from '../../types';

// US Atlas TopoJSON - states
const US_STATES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// Map RadioReference state IDs to FIPS codes for matching
const STATE_FIPS_MAP: Record<number, string> = {
  1: '01',   // Alabama
  2: '02',   // Alaska
  4: '04',   // Arizona
  5: '05',   // Arkansas
  6: '06',   // California
  8: '08',   // Colorado
  9: '09',   // Connecticut
  10: '10',  // Delaware
  11: '11',  // DC
  12: '12',  // Florida
  13: '13',  // Georgia
  15: '15',  // Hawaii
  16: '16',  // Idaho
  17: '17',  // Illinois
  18: '18',  // Indiana
  19: '19',  // Iowa
  20: '20',  // Kansas
  21: '21',  // Kentucky
  22: '22',  // Louisiana
  23: '23',  // Maine
  24: '24',  // Maryland
  25: '25',  // Massachusetts
  26: '26',  // Michigan
  27: '27',  // Minnesota
  28: '28',  // Mississippi
  29: '29',  // Missouri
  30: '30',  // Montana
  31: '31',  // Nebraska
  32: '32',  // Nevada
  33: '33',  // New Hampshire
  34: '34',  // New Jersey
  35: '35',  // New Mexico
  36: '36',  // New York
  37: '37',  // North Carolina
  38: '38',  // North Dakota
  39: '39',  // Ohio
  40: '40',  // Oklahoma
  41: '41',  // Oregon
  42: '42',  // Pennsylvania
  44: '44',  // Rhode Island
  45: '45',  // South Carolina
  46: '46',  // South Dakota
  47: '47',  // Tennessee
  48: '48',  // Texas
  49: '49',  // Utah
  50: '50',  // Vermont
  51: '51',  // Virginia
  53: '53',  // Washington
  54: '54',  // West Virginia
  55: '55',  // Wisconsin
  56: '56',  // Wyoming
  72: '72',  // Puerto Rico
  66: '66',  // Guam
  78: '78',  // Virgin Islands
};

// Reverse map: FIPS to RR state ID
const FIPS_TO_RR_STATE: Record<string, number> = Object.entries(STATE_FIPS_MAP).reduce(
  (acc, [rrId, fips]) => ({ ...acc, [fips]: parseInt(rrId, 10) }),
  {}
);

interface USMapProps {
  states: RRState[];
  selectedStateId: number | null;
  onStateSelect: (stateId: number | null) => void;
  systemCounts?: Record<number, number>;
}

export function USMap({ states, selectedStateId, onStateSelect, systemCounts = {} }: USMapProps) {
  const [tooltipContent, setTooltipContent] = useState<string>('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Create a map from FIPS to state data for quick lookup
  const stateDataByFips = useMemo(() => {
    const map: Record<string, { name: string; rrId: number; systems: number }> = {};
    for (const state of states) {
      const fips = STATE_FIPS_MAP[state.id];
      if (fips) {
        map[fips] = {
          name: state.name,
          rrId: state.id,
          systems: systemCounts[state.id] || 0,
        };
      }
    }
    return map;
  }, [states, systemCounts]);

  const handleMouseMove = (event: React.MouseEvent) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const getStateColor = (fips: string) => {
    const stateData = stateDataByFips[fips];
    const rrId = FIPS_TO_RR_STATE[fips];

    if (rrId === selectedStateId) {
      return '#3b82f6'; // Blue for selected
    }

    if (stateData && stateData.systems > 0) {
      // Color intensity based on system count
      const intensity = Math.min(stateData.systems / 50, 1);
      const green = Math.round(100 + intensity * 100);
      return `rgb(34, ${green}, 80)`;
    }

    return '#1e293b'; // Default slate
  };

  return (
    <div className="relative w-full h-full bg-slate-900" onMouseMove={handleMouseMove}>
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{
          scale: 1000,
        }}
        className="w-full h-full"
      >
        <ZoomableGroup center={[-96, 38]} zoom={1}>
          <Geographies geography={US_STATES_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const fips = geo.id;
                const stateData = stateDataByFips[fips];
                const rrId = FIPS_TO_RR_STATE[fips];

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={getStateColor(fips)}
                    stroke="#334155"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: {
                        fill: rrId === selectedStateId ? '#60a5fa' : '#475569',
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() => {
                      if (stateData) {
                        setTooltipContent(
                          `${stateData.name}: ${stateData.systems} P25 systems`
                        );
                      } else {
                        setTooltipContent(geo.properties.name || 'Unknown');
                      }
                    }}
                    onMouseLeave={() => setTooltipContent('')}
                    onClick={() => {
                      if (rrId) {
                        onStateSelect(rrId === selectedStateId ? null : rrId);
                      }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltipContent && (
        <div
          className="fixed z-50 px-3 py-2 text-sm bg-slate-800 border border-slate-600 rounded-lg shadow-lg pointer-events-none"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y - 30,
          }}
        >
          {tooltipContent}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-800/90 border border-slate-700 rounded-lg p-3 text-xs">
        <div className="text-slate-300 font-medium mb-2">P25 Systems</div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(34, 100, 80)' }} />
          <span className="text-slate-400">Few systems</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(34, 200, 80)' }} />
          <span className="text-slate-400">Many systems</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span className="text-slate-400">Selected</span>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
        Click a state to view its counties and P25 systems
      </div>
    </div>
  );
}
