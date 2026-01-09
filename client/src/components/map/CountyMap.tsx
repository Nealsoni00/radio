import { useState, useMemo, useEffect } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { RRState, RRCounty } from '../../types';

// US Atlas TopoJSON - counties
const US_COUNTIES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

// State FIPS codes for filtering counties
const STATE_FIPS_MAP: Record<number, string> = {
  1: '01', 2: '02', 4: '04', 5: '05', 6: '06', 8: '08', 9: '09', 10: '10',
  11: '11', 12: '12', 13: '13', 15: '15', 16: '16', 17: '17', 18: '18',
  19: '19', 20: '20', 21: '21', 22: '22', 23: '23', 24: '24', 25: '25',
  26: '26', 27: '27', 28: '28', 29: '29', 30: '30', 31: '31', 32: '32',
  33: '33', 34: '34', 35: '35', 36: '36', 37: '37', 38: '38', 39: '39',
  40: '40', 41: '41', 42: '42', 44: '44', 45: '45', 46: '46', 47: '47',
  48: '48', 49: '49', 50: '50', 51: '51', 53: '53', 54: '54', 55: '55',
  56: '56', 72: '72', 66: '66', 78: '78',
};

// State center coordinates and zoom levels for focus
const STATE_CENTERS: Record<string, { center: [number, number]; zoom: number }> = {
  '01': { center: [-86.9, 32.8], zoom: 6 },    // Alabama
  '02': { center: [-153, 64], zoom: 2.5 },     // Alaska
  '04': { center: [-111.5, 34.2], zoom: 5 },   // Arizona
  '05': { center: [-92.4, 34.8], zoom: 6 },    // Arkansas
  '06': { center: [-119.5, 37], zoom: 4.5 },   // California
  '08': { center: [-105.5, 39], zoom: 5 },     // Colorado
  '09': { center: [-72.7, 41.6], zoom: 9 },    // Connecticut
  '10': { center: [-75.5, 39], zoom: 10 },     // Delaware
  '11': { center: [-77, 38.9], zoom: 30 },     // DC
  '12': { center: [-82, 28.5], zoom: 5 },      // Florida
  '13': { center: [-83.4, 32.6], zoom: 5.5 },  // Georgia
  '15': { center: [-157, 20.5], zoom: 5 },     // Hawaii
  '16': { center: [-114.5, 44.5], zoom: 5 },   // Idaho
  '17': { center: [-89.2, 40], zoom: 5.5 },    // Illinois
  '18': { center: [-86.2, 39.8], zoom: 6 },    // Indiana
  '19': { center: [-93.5, 42], zoom: 6 },      // Iowa
  '20': { center: [-98.5, 38.5], zoom: 5.5 },  // Kansas
  '21': { center: [-85.7, 37.8], zoom: 6 },    // Kentucky
  '22': { center: [-91.8, 31], zoom: 5.5 },    // Louisiana
  '23': { center: [-69, 45.3], zoom: 5.5 },    // Maine
  '24': { center: [-76.7, 39], zoom: 7 },      // Maryland
  '25': { center: [-71.8, 42.2], zoom: 8 },    // Massachusetts
  '26': { center: [-85, 44.3], zoom: 5 },      // Michigan
  '27': { center: [-94.5, 46], zoom: 5 },      // Minnesota
  '28': { center: [-89.7, 32.7], zoom: 6 },    // Mississippi
  '29': { center: [-92.5, 38.5], zoom: 5.5 },  // Missouri
  '30': { center: [-110, 47], zoom: 4.5 },     // Montana
  '31': { center: [-99.8, 41.5], zoom: 5.5 },  // Nebraska
  '32': { center: [-117, 39], zoom: 5 },       // Nevada
  '33': { center: [-71.5, 43.7], zoom: 7 },    // New Hampshire
  '34': { center: [-74.7, 40.2], zoom: 7 },    // New Jersey
  '35': { center: [-106, 34.5], zoom: 5 },     // New Mexico
  '36': { center: [-75.5, 43], zoom: 5 },      // New York
  '37': { center: [-79.5, 35.5], zoom: 5.5 },  // North Carolina
  '38': { center: [-100, 47.5], zoom: 5.5 },   // North Dakota
  '39': { center: [-82.7, 40.3], zoom: 6 },    // Ohio
  '40': { center: [-97.5, 35.5], zoom: 5.5 },  // Oklahoma
  '41': { center: [-120.5, 44], zoom: 5 },     // Oregon
  '42': { center: [-77.5, 41], zoom: 6 },      // Pennsylvania
  '44': { center: [-71.5, 41.7], zoom: 10 },   // Rhode Island
  '45': { center: [-80.5, 33.8], zoom: 6 },    // South Carolina
  '46': { center: [-100, 44.5], zoom: 5.5 },   // South Dakota
  '47': { center: [-86.3, 35.8], zoom: 6 },    // Tennessee
  '48': { center: [-99.5, 31.5], zoom: 4 },    // Texas
  '49': { center: [-111.5, 39.3], zoom: 5 },   // Utah
  '50': { center: [-72.7, 44], zoom: 7 },      // Vermont
  '51': { center: [-79, 37.5], zoom: 5.5 },    // Virginia
  '53': { center: [-120.5, 47.3], zoom: 5.5 }, // Washington
  '54': { center: [-80.5, 38.9], zoom: 6 },    // West Virginia
  '55': { center: [-90, 44.5], zoom: 5.5 },    // Wisconsin
  '56': { center: [-107.5, 43], zoom: 5 },     // Wyoming
};

interface CountyMapProps {
  state: RRState;
  counties: RRCounty[];
  selectedCountyId: number | null;
  onCountySelect: (countyId: number | null) => void;
  onBackToStates: () => void;
  systemCountsByCounty?: Record<number, number>;
}

export function CountyMap({
  state,
  counties,
  selectedCountyId,
  onCountySelect,
  onBackToStates,
  systemCountsByCounty = {},
}: CountyMapProps) {
  const [tooltipContent, setTooltipContent] = useState<string>('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const stateFips = STATE_FIPS_MAP[state.id] || '00';
  const stateConfig = STATE_CENTERS[stateFips] || { center: [-96, 38], zoom: 4 };

  // Match counties by name (case-insensitive, handling common variations)
  const countyNameMap = useMemo(() => {
    const map: Record<string, RRCounty> = {};
    for (const county of counties) {
      // Normalize county name for matching
      const normalized = county.name
        .toLowerCase()
        .replace(/\s+county$/i, '')
        .replace(/\s+parish$/i, '')
        .replace(/\./g, '')
        .replace(/saint\s+/i, 'st ')
        .trim();
      map[normalized] = county;
    }
    return map;
  }, [counties]);

  const handleMouseMove = (event: React.MouseEvent) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const findMatchingCounty = (geoName: string): RRCounty | undefined => {
    const normalized = geoName
      .toLowerCase()
      .replace(/\s+county$/i, '')
      .replace(/\s+parish$/i, '')
      .replace(/\./g, '')
      .replace(/saint\s+/i, 'st ')
      .trim();
    return countyNameMap[normalized];
  };

  const getCountyColor = (geoId: string, geoName: string) => {
    const county = findMatchingCounty(geoName);

    if (county && county.id === selectedCountyId) {
      return '#3b82f6'; // Blue for selected
    }

    if (county) {
      const systemCount = systemCountsByCounty[county.id] || 0;
      if (systemCount > 0) {
        const intensity = Math.min(systemCount / 10, 1);
        const green = Math.round(100 + intensity * 100);
        return `rgb(34, ${green}, 80)`;
      }
    }

    return '#1e293b'; // Default slate
  };

  return (
    <div className="relative w-full h-full bg-slate-900" onMouseMove={handleMouseMove}>
      {/* Back button */}
      <button
        onClick={onBackToStates}
        className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to US Map
      </button>

      {/* State name */}
      <div className="absolute top-4 right-4 z-10 px-4 py-2 bg-slate-800/90 border border-slate-700 rounded-lg">
        <h2 className="text-lg font-semibold text-slate-100">{state.name}</h2>
        <p className="text-xs text-slate-400">{counties.length} counties</p>
      </div>

      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        className="w-full h-full"
      >
        <ZoomableGroup center={stateConfig.center} zoom={stateConfig.zoom}>
          <Geographies geography={US_COUNTIES_URL}>
            {({ geographies }) =>
              geographies
                .filter((geo) => {
                  // Filter to only show counties in this state
                  const geoId = String(geo.id);
                  return geoId.startsWith(stateFips);
                })
                .map((geo) => {
                  const geoName = geo.properties.name || '';
                  const county = findMatchingCounty(geoName);
                  const systemCount = county ? systemCountsByCounty[county.id] || 0 : 0;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getCountyColor(String(geo.id), geoName)}
                      stroke="#475569"
                      strokeWidth={0.3}
                      style={{
                        default: { outline: 'none' },
                        hover: {
                          fill: county?.id === selectedCountyId ? '#60a5fa' : '#475569',
                          outline: 'none',
                          cursor: county ? 'pointer' : 'default',
                        },
                        pressed: { outline: 'none' },
                      }}
                      onMouseEnter={() => {
                        if (county) {
                          setTooltipContent(
                            `${county.name}: ${systemCount} P25 system${systemCount !== 1 ? 's' : ''}`
                          );
                        } else {
                          setTooltipContent(geoName);
                        }
                      }}
                      onMouseLeave={() => setTooltipContent('')}
                      onClick={() => {
                        if (county) {
                          onCountySelect(county.id === selectedCountyId ? null : county.id);
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
      <div className="absolute bottom-4 right-4 bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400">
        Click a county to view its P25 systems
      </div>
    </div>
  );
}
