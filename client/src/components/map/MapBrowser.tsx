import { useEffect } from 'react';
import { USMap } from './USMap';
import { CountyMap } from './CountyMap';
import { useRadioReferenceStore } from '../../store/radioreference';

export function MapBrowser() {
  const {
    states,
    selectedStateId,
    selectState,
    counties,
    selectedCountyId,
    selectCounty,
    geographyCounts,
    fetchGeographyCounts,
  } = useRadioReferenceStore();

  // Fetch geography counts on mount
  useEffect(() => {
    if (!geographyCounts) {
      fetchGeographyCounts();
    }
  }, [geographyCounts, fetchGeographyCounts]);

  const selectedState = states.find((s) => s.id === selectedStateId);

  const handleStateSelect = (stateId: number | null) => {
    selectState(stateId);
  };

  const handleCountySelect = (countyId: number | null) => {
    selectCounty(countyId);
  };

  const handleBackToStates = () => {
    selectState(null);
  };

  // Show county map if a state is selected
  if (selectedState && counties.length > 0) {
    return (
      <CountyMap
        state={selectedState}
        counties={counties}
        selectedCountyId={selectedCountyId}
        onCountySelect={handleCountySelect}
        onBackToStates={handleBackToStates}
        systemCountsByCounty={geographyCounts?.byCounty || {}}
      />
    );
  }

  // Show US map for state selection
  return (
    <USMap
      states={states}
      selectedStateId={selectedStateId}
      onStateSelect={handleStateSelect}
      systemCounts={geographyCounts?.byState || {}}
    />
  );
}
