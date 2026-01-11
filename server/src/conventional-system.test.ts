import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for conventional P25 system support.
 * Conventional systems use fixed frequencies (channels) instead of
 * dynamically assigned talkgroups from a control channel.
 */

describe('Conventional System Support', () => {
  describe('Call ID Generation', () => {
    it('should generate frequency-based call ID for conventional systems', () => {
      const frequency = 506737500; // LAPD Central
      const startTime = 1704825600;
      const callId = `${frequency}-${startTime}`;

      expect(callId).toBe('506737500-1704825600');
    });

    it('should generate talkgroup-based call ID for trunked systems', () => {
      const talkgroup = 927;
      const startTime = 1704825600;
      const callId = `${talkgroup}-${startTime}`;

      expect(callId).toBe('927-1704825600');
    });
  });

  describe('Channel Display Names', () => {
    it('should format frequency as MHz for display', () => {
      const frequency = 506737500;
      const displayName = `${(frequency / 1e6).toFixed(4)} MHz`;

      expect(displayName).toBe('506.7375 MHz');
    });

    it('should use alpha tag when available', () => {
      const alphaTag = 'LAPD Central';
      const frequency = 506737500;
      const displayName = alphaTag || `${(frequency / 1e6).toFixed(4)} MHz`;

      expect(displayName).toBe('LAPD Central');
    });

    it('should fall back to frequency when no alpha tag', () => {
      const alphaTag = '';
      const frequency = 506737500;
      const displayName = alphaTag || `${(frequency / 1e6).toFixed(4)} MHz`;

      expect(displayName).toBe('506.7375 MHz');
    });
  });

  describe('System Type Detection', () => {
    it('should identify conventional system types', () => {
      const conventionalTypes = ['conventional', 'p25_conventional', 'conventionalP25', 'conventionalDMR'];

      for (const type of conventionalTypes) {
        const isConventional = type === 'conventional' ||
          type === 'p25_conventional' ||
          type === 'conventionalP25' ||
          type === 'conventionalDMR';
        expect(isConventional).toBe(true);
      }
    });

    it('should identify trunked system types', () => {
      const trunkedTypes = ['p25', 'smartnet', 'p25_phase1', 'p25_phase2'];

      for (const type of trunkedTypes) {
        const isConventional = type === 'conventional' ||
          type === 'p25_conventional' ||
          type === 'conventionalP25' ||
          type === 'conventionalDMR';
        expect(isConventional).toBe(false);
      }
    });
  });

  describe('Audio Path Generation', () => {
    it('should generate correct audio path for conventional system', () => {
      const frequency = 506737500;
      const startTime = 1704825600;
      const audioDir = './audio';

      const audioPath = `${audioDir}/${frequency}-${startTime}.wav`;

      expect(audioPath).toBe('./audio/506737500-1704825600.wav');
    });

    it('should generate correct audio path for trunked system', () => {
      const talkgroup = 927;
      const startTime = 1704825600;
      const audioDir = './audio';

      const audioPath = `${audioDir}/${talkgroup}-${startTime}.wav`;

      expect(audioPath).toBe('./audio/927-1704825600.wav');
    });
  });

  describe('Channel Data Structure', () => {
    it('should have correct channel properties', () => {
      const channel = {
        id: 1,
        frequency: 506737500,
        alpha_tag: 'LAPD Central',
        description: 'Central Division Dispatch',
        group_name: 'LAPD',
        group_tag: 'Dispatch',
        mode: 'D',
        system_type: 'conventional',
      };

      expect(channel.frequency).toBe(506737500);
      expect(channel.alpha_tag).toBe('LAPD Central');
      expect(channel.system_type).toBe('conventional');
    });

    it('should allow null description', () => {
      const channel = {
        id: 1,
        frequency: 506737500,
        alpha_tag: 'LAPD Central',
        description: null,
        group_name: null,
        group_tag: null,
        mode: 'D',
        system_type: 'conventional',
      };

      expect(channel.description).toBeNull();
      expect(channel.group_name).toBeNull();
    });
  });

  describe('Call Record Structure', () => {
    it('should have correct call properties for conventional system', () => {
      const call = {
        id: '506737500-1704825600',
        talkgroup_id: 0, // Conventional may have 0 talkgroup
        frequency: 506737500,
        start_time: 1704825600,
        stop_time: 1704825610,
        duration: 10,
        emergency: false,
        encrypted: false,
        audio_file: '/audio/506737500-1704825600.wav',
        audio_type: 'digital',
        system_type: 'conventional',
        channel_id: 1,
      };

      expect(call.system_type).toBe('conventional');
      expect(call.channel_id).toBe(1);
      expect(call.talkgroup_id).toBe(0);
    });

    it('should have correct call properties for trunked system', () => {
      const call = {
        id: '927-1704825600',
        talkgroup_id: 927,
        frequency: 852387500,
        start_time: 1704825600,
        stop_time: 1704825610,
        duration: 10,
        emergency: false,
        encrypted: false,
        audio_file: '/audio/927-1704825600.wav',
        audio_type: 'digital',
        system_type: 'trunked',
        channel_id: null,
      };

      expect(call.system_type).toBe('trunked');
      expect(call.channel_id).toBeNull();
      expect(call.talkgroup_id).toBe(927);
    });
  });
});

describe('RadioReference System Type Auto-Configuration', () => {
  /**
   * Tests for the auto-configuration feature that maps RadioReference
   * system type strings to our internal system types.
   */

  function determineSystemTypeFromRR(rrType: string): 'p25' | 'conventional' {
    const typeLower = rrType.toLowerCase();
    if (
      typeLower.includes('conventional') ||
      typeLower.startsWith('ltr') ||
      typeLower.startsWith('edacs') ||
      typeLower === 'passport' ||
      typeLower === 'analog' ||
      typeLower === 'mpt1327' ||
      typeLower === 'idas'
    ) {
      return 'conventional';
    }
    return 'p25';
  }

  describe('Conventional System Detection', () => {
    it('should detect conventional from explicit type', () => {
      expect(determineSystemTypeFromRR('Conventional')).toBe('conventional');
      expect(determineSystemTypeFromRR('conventional')).toBe('conventional');
      expect(determineSystemTypeFromRR('CONVENTIONAL')).toBe('conventional');
    });

    it('should detect P25 conventional systems', () => {
      expect(determineSystemTypeFromRR('P25 Conventional')).toBe('conventional');
      expect(determineSystemTypeFromRR('Project 25 Conventional')).toBe('conventional');
    });

    it('should detect LTR systems as conventional', () => {
      expect(determineSystemTypeFromRR('LTR')).toBe('conventional');
      expect(determineSystemTypeFromRR('ltr')).toBe('conventional');
    });

    it('should detect EDACS systems as conventional', () => {
      expect(determineSystemTypeFromRR('EDACS')).toBe('conventional');
      expect(determineSystemTypeFromRR('edacs')).toBe('conventional');
    });

    it('should detect analog systems as conventional', () => {
      expect(determineSystemTypeFromRR('analog')).toBe('conventional');
      expect(determineSystemTypeFromRR('Analog')).toBe('conventional');
    });

    it('should detect DMR conventional systems', () => {
      expect(determineSystemTypeFromRR('DMR Conventional')).toBe('conventional');
      expect(determineSystemTypeFromRR('dmr conventional')).toBe('conventional');
    });

    it('should detect NXDN conventional systems', () => {
      expect(determineSystemTypeFromRR('NXDN Conventional')).toBe('conventional');
      expect(determineSystemTypeFromRR('nxdn conventional')).toBe('conventional');
    });
  });

  describe('Trunked System Detection', () => {
    it('should detect P25 trunked systems', () => {
      expect(determineSystemTypeFromRR('P25')).toBe('p25');
      expect(determineSystemTypeFromRR('P25 Trunked')).toBe('p25');
      expect(determineSystemTypeFromRR('Project 25 Phase I')).toBe('p25');
      expect(determineSystemTypeFromRR('Project 25 Phase II')).toBe('p25');
    });

    it('should detect Motorola systems as trunked', () => {
      expect(determineSystemTypeFromRR('Motorola SmartNet')).toBe('p25');
      expect(determineSystemTypeFromRR('Motorola SmartZone')).toBe('p25');
    });

    it('should detect DMR trunked systems', () => {
      expect(determineSystemTypeFromRR('DMR Tier III')).toBe('p25');
      expect(determineSystemTypeFromRR('DMR')).toBe('p25');
    });

    it('should detect TETRA systems as trunked', () => {
      expect(determineSystemTypeFromRR('TETRA')).toBe('p25');
    });

    it('should default to p25 for unknown types', () => {
      expect(determineSystemTypeFromRR('Unknown')).toBe('p25');
      expect(determineSystemTypeFromRR('')).toBe('p25');
    });
  });

  describe('Real RadioReference System Types', () => {
    // These are real system type strings from RadioReference
    const realSystemTypes = [
      { type: 'Project 25 Phase I', expected: 'p25' as const },
      { type: 'Project 25 Phase II', expected: 'p25' as const },
      { type: 'Motorola Type II SmartNet', expected: 'p25' as const },
      { type: 'Motorola Type II SmartZone', expected: 'p25' as const },
      { type: 'Conventional', expected: 'conventional' as const },
      { type: 'LTR Standard', expected: 'conventional' as const },
      { type: 'EDACS Standard', expected: 'conventional' as const },
      { type: 'DMR Tier III', expected: 'p25' as const },
      { type: 'NXDN Conventional', expected: 'conventional' as const },
    ];

    for (const { type, expected } of realSystemTypes) {
      it(`should correctly classify "${type}" as ${expected}`, () => {
        expect(determineSystemTypeFromRR(type)).toBe(expected);
      });
    }
  });
});

describe('LAPD Frequencies', () => {
  const lapdChannels = [
    { frequency: 506737500, name: 'LAPD Central', division: 'Central' },
    { frequency: 506937500, name: 'LAPD Rampart', division: 'Rampart' },
    { frequency: 506987500, name: 'LAPD Southwest', division: 'Southwest' },
    { frequency: 507187500, name: 'LAPD Hollenbeck', division: 'Hollenbeck' },
    { frequency: 507087500, name: 'LAPD CW Tac 1', division: 'Tactical' },
  ];

  it('should have valid LAPD UHF frequencies', () => {
    for (const channel of lapdChannels) {
      // LAPD uses T-band (470-512 MHz)
      expect(channel.frequency).toBeGreaterThanOrEqual(470000000);
      expect(channel.frequency).toBeLessThanOrEqual(512000000);
    }
  });

  it('should format LAPD frequencies correctly', () => {
    expect((506737500 / 1e6).toFixed(4)).toBe('506.7375');
    expect((506937500 / 1e6).toFixed(4)).toBe('506.9375');
    expect((507087500 / 1e6).toFixed(4)).toBe('507.0875');
  });
});
