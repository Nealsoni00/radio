import { describe, it, expect } from 'vitest';
import {
  formatFrequency,
  formatDuration,
  classNames,
  getTagColor,
} from './formatters';

describe('formatFrequency', () => {
  it('converts Hz to MHz with 5 decimal places', () => {
    expect(formatFrequency(770106250)).toBe('770.10625 MHz');
    expect(formatFrequency(851000000)).toBe('851.00000 MHz');
  });

  it('handles zero', () => {
    expect(formatFrequency(0)).toBe('0.00000 MHz');
  });
});

describe('formatDuration', () => {
  it('returns -- for null or undefined', () => {
    expect(formatDuration(null)).toBe('--');
    expect(formatDuration(undefined)).toBe('--');
  });

  it('formats seconds under 60', () => {
    expect(formatDuration(5)).toBe('5s');
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m 0s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('rounds fractional seconds', () => {
    expect(formatDuration(5.7)).toBe('6s');
    expect(formatDuration(65.4)).toBe('1m 5s');
  });
});

describe('classNames', () => {
  it('joins class strings', () => {
    expect(classNames('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(classNames('foo', false, 'bar', null, undefined)).toBe('foo bar');
  });

  it('handles empty input', () => {
    expect(classNames()).toBe('');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(classNames('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });
});

describe('getTagColor', () => {
  it('returns gray for null/undefined', () => {
    expect(getTagColor(null)).toBe('bg-gray-600');
    expect(getTagColor(undefined)).toBe('bg-gray-600');
  });

  it('returns blue for dispatch', () => {
    expect(getTagColor('Law Dispatch')).toBe('bg-blue-600');
    expect(getTagColor('Fire Dispatch')).toBe('bg-blue-600');
  });

  it('returns purple for tac', () => {
    expect(getTagColor('Law Tac')).toBe('bg-purple-600');
    expect(getTagColor('Fire-Tac')).toBe('bg-purple-600');
  });

  it('returns red for fire (without other matches)', () => {
    // Note: "Fire-Talk" matches 'talk' first, so use a tag without 'talk'
    expect(getTagColor('Fire Ops')).toBe('bg-red-600');
    expect(getTagColor('fire department')).toBe('bg-red-600');
  });

  it('returns orange for ems (without other matches)', () => {
    // Note: "EMS-Tac" matches 'tac' first, "ems dispatch" matches 'dispatch' first
    // Use tags that only match 'ems'
    expect(getTagColor('EMS Ops')).toBe('bg-orange-600');
    expect(getTagColor('EMS Unit')).toBe('bg-orange-600');
  });

  it('returns yellow for interop', () => {
    expect(getTagColor('Interop')).toBe('bg-yellow-600');
  });

  it('returns gray for unknown tags', () => {
    expect(getTagColor('Unknown')).toBe('bg-gray-600');
    expect(getTagColor('Random Tag')).toBe('bg-gray-600');
  });
});
