import { FastifyPluginCallback } from 'fastify';
import { systemManager, ActiveSystemInfo } from '../../services/system/system-manager.js';

interface SwitchParams {
  systemId: string;
}

export const systemRoutes: FastifyPluginCallback = (app, _opts, done) => {
  // Get the currently active system
  app.get('/api/system/active', async () => {
    const activeSystem = systemManager.getActiveSystem();
    return {
      active: activeSystem !== null,
      system: activeSystem,
    };
  });

  // Switch to a new system
  app.post<{ Params: SwitchParams }>('/api/system/switch/:systemId', async (request, reply) => {
    const systemId = parseInt(request.params.systemId, 10);

    if (isNaN(systemId)) {
      return reply.code(400).send({ error: 'Invalid system ID' });
    }

    try {
      const system = await systemManager.switchToSystem(systemId);
      return {
        success: true,
        system,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to switch to system ${systemId}:`, error);
      return reply.code(500).send({ error: message });
    }
  });

  // Stop trunk-recorder
  app.post('/api/system/stop', async () => {
    await systemManager.stopTrunkRecorder();
    return { success: true };
  });

  // Get trunk-recorder status
  app.get('/api/system/status', async () => {
    return {
      running: systemManager.isTrunkRecorderRunning(),
      activeSystem: systemManager.getActiveSystem(),
    };
  });

  done();
};
