import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RTLDevice {
  index: number;
  name: string;
  manufacturer: string;
  product: string;
  serial: string;
  connected: boolean;
}

export interface SDRStatus {
  devices: RTLDevice[];
  totalDevices: number;
  lastChecked: number;
}

/**
 * Detect connected RTL-SDR devices using rtl_test command
 */
export async function detectRTLDevices(): Promise<SDRStatus> {
  const result: SDRStatus = {
    devices: [],
    totalDevices: 0,
    lastChecked: Date.now(),
  };

  try {
    // Try rtl_test -t first (quick test that lists devices)
    const { stdout, stderr } = await execAsync('rtl_test -t 2>&1', {
      timeout: 5000,
    });

    const output = stdout + stderr;

    // Parse device information from rtl_test output
    // Example output:
    // Found 1 device(s):
    //   0:  Realtek, RTL2838UHIDIR, SN: 00000001
    // Using device 0: Generic RTL2832U OEM

    const deviceCountMatch = output.match(/Found (\d+) device/);
    if (deviceCountMatch) {
      result.totalDevices = parseInt(deviceCountMatch[1], 10);
    }

    // Parse individual device lines
    const deviceLineRegex = /^\s*(\d+):\s+(.+?),\s+(.+?),\s+SN:\s*(\S+)/gm;
    let match;
    while ((match = deviceLineRegex.exec(output)) !== null) {
      result.devices.push({
        index: parseInt(match[1], 10),
        manufacturer: match[2].trim(),
        product: match[3].trim(),
        serial: match[4].trim(),
        name: `${match[2].trim()} ${match[3].trim()}`,
        connected: true,
      });
    }

    // If we found devices via count but didn't parse details, try alternate parsing
    if (result.totalDevices > 0 && result.devices.length === 0) {
      // Try parsing "Using device X: Name" format
      const usingDeviceRegex = /Using device (\d+):\s*(.+)/g;
      while ((match = usingDeviceRegex.exec(output)) !== null) {
        result.devices.push({
          index: parseInt(match[1], 10),
          name: match[2].trim(),
          manufacturer: 'Unknown',
          product: match[2].trim(),
          serial: 'Unknown',
          connected: true,
        });
      }
    }

  } catch (error: any) {
    // rtl_test returns non-zero exit code when no devices found
    const output = error.stdout || error.stderr || error.message || '';

    // Check if it's just "no devices found" vs actual error
    if (output.includes('No supported devices found') ||
        output.includes('Found 0 device')) {
      result.totalDevices = 0;
      result.devices = [];
    } else if (output.includes('command not found') ||
               output.includes('not found')) {
      // rtl_test not installed
      console.warn('rtl_test command not found. Install rtl-sdr package.');
      result.totalDevices = -1; // Indicate unknown/error state
    } else {
      // Try to parse whatever output we got
      const deviceCountMatch = output.match(/Found (\d+) device/);
      if (deviceCountMatch) {
        result.totalDevices = parseInt(deviceCountMatch[1], 10);
      }
    }
  }

  return result;
}

/**
 * Get detailed info for a specific RTL-SDR device using rtl_eeprom
 */
export async function getDeviceDetails(deviceIndex: number): Promise<RTLDevice | null> {
  try {
    const { stdout, stderr } = await execAsync(`rtl_eeprom -d ${deviceIndex} 2>&1`, {
      timeout: 5000,
    });

    const output = stdout + stderr;

    const device: RTLDevice = {
      index: deviceIndex,
      name: 'RTL-SDR',
      manufacturer: 'Unknown',
      product: 'Unknown',
      serial: 'Unknown',
      connected: true,
    };

    // Parse rtl_eeprom output
    const vendorMatch = output.match(/Vendor:\s*(.+)/i);
    const productMatch = output.match(/Product:\s*(.+)/i);
    const serialMatch = output.match(/Serial:\s*(.+)/i);

    if (vendorMatch) device.manufacturer = vendorMatch[1].trim();
    if (productMatch) device.product = productMatch[1].trim();
    if (serialMatch) device.serial = serialMatch[1].trim();

    device.name = `${device.manufacturer} ${device.product}`.trim();

    return device;
  } catch {
    return null;
  }
}
